/**
 * Manager para auto-cancelación de transacciones por timeout
 * Usa polling adaptativo (no timeouts individuales)
 * - Sin transacciones activas: verifica cada 5 minutos
 * - Con transacciones activas: verifica cada 30 segundos
 * - Transacciones "pendiente": 2 minutos de timeout
 * - Transacciones "en_proceso": 4 minutos de timeout
 */

const Transaccion = require("../models/Transaccion");
const Jugador = require("../models/Jugador");
const { registrarLog } = require("../utils/logHelper");
const {
  crearNotificacionBot,
} = require("../controllers/notificacionesBotController");

class TransactionTimeoutManager {
  constructor(socketManager) {
    this.socketManager = socketManager;
    // Timeouts para pruebas (2 y 4 minutos)
    this.timeouts = {
      pendiente: 2 * 60 * 1000, // 2 minutos en milisegundos
      en_proceso: 4 * 60 * 1000, // 4 minutos en milisegundos
    };
    // Intervalos de verificación
    this.checkIntervals = {
      withActivity: 30 * 1000, // 30 segundos cuando hay transacciones activas
      withoutActivity: 5 * 60 * 1000, // 5 minutos cuando no hay actividad
    };
    this.pollingTimeoutId = null;
    this.isRunning = false;
  }

  /**
   * Iniciar sistema de polling adaptativo
   */
  start() {
    if (this.isRunning) {
      console.log("⏰ [TIMEOUT] Sistema ya está corriendo");
      return;
    }

    this.isRunning = true;
    console.log("⏰ [TIMEOUT] Sistema de auto-cancelación iniciado");
    console.log(
      `⏰ [TIMEOUT] Timeouts: Pendiente=${
        this.timeouts.pendiente / 60000
      }min, En proceso=${this.timeouts.en_proceso / 60000}min`
    );
    console.log(
      `⏰ [TIMEOUT] Polling adaptativo: 30s con actividad, 5min sin actividad`
    );
    console.log("⏰ [TIMEOUT] Modo: Escalable y robusto ✨");

    // Iniciar el ciclo de polling
    this.runAdaptivePolling();
  }

  /**
   * Detener sistema de polling
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollingTimeoutId) {
      clearTimeout(this.pollingTimeoutId);
      this.pollingTimeoutId = null;
    }

    console.log("⏰ [TIMEOUT] Sistema de auto-cancelación detenido");
  }

  /**
   * Ejecutar polling adaptativo
   */
  async runAdaptivePolling() {
    if (!this.isRunning) {
      return;
    }

    try {
      // 1. Verificar si hay transacciones activas
      const activeCount = await Transaccion.countDocuments({
        estado: { $in: ["pendiente", "en_proceso"] },
      });

      console.log(
        `🔍 [TIMEOUT] Verificando transacciones... (${activeCount} activas)`
      );

      // 2. Si hay transacciones activas, buscar las expiradas
      if (activeCount > 0) {
        await this.checkExpiredTransactions();
      } else {
        console.log(`✅ [TIMEOUT] No hay transacciones activas`);
      }

      // 3. Determinar próximo intervalo
      const nextInterval =
        activeCount > 0
          ? this.checkIntervals.withActivity
          : this.checkIntervals.withoutActivity;

      const nextCheckMinutes = Math.round(nextInterval / 60000);
      console.log(
        `⏰ [TIMEOUT] Próxima verificación en ${nextCheckMinutes} minuto(s)`
      );

      // 4. Programar próxima verificación
      this.pollingTimeoutId = setTimeout(() => {
        this.runAdaptivePolling();
      }, nextInterval);
    } catch (error) {
      console.error("❌ [TIMEOUT] Error en polling adaptativo:", error);

      // En caso de error, reintentar en 1 minuto
      this.pollingTimeoutId = setTimeout(() => {
        this.runAdaptivePolling();
      }, 60000);
    }
  }

  /**
   * Verificar y cancelar transacciones expiradas
   */
  async checkExpiredTransactions() {
    try {
      const now = new Date();

      // Calcular timestamps límite
      const pendienteLimitDate = new Date(now - this.timeouts.pendiente);
      const enProcesoLimitDate = new Date(now - this.timeouts.en_proceso);

      // Buscar transacciones pendientes expiradas (> 2 min)
      const expiredPendientes = await Transaccion.find({
        estado: "pendiente",
        createdAt: { $lt: pendienteLimitDate },
      }).populate("jugadorId", "telegramId nickname firstName");

      // Buscar transacciones en_proceso expiradas (> 4 min)
      const expiredEnProceso = await Transaccion.find({
        estado: "en_proceso",
        updatedAt: { $lt: enProcesoLimitDate },
      })
        .populate("jugadorId", "telegramId nickname firstName")
        .populate("cajeroId", "nombreCompleto email");

      const totalExpired = expiredPendientes.length + expiredEnProceso.length;

      if (totalExpired > 0) {
        console.log(
          `⚠️ [TIMEOUT] Encontradas ${totalExpired} transacciones expiradas`
        );
        console.log(`⚠️ [TIMEOUT] - Pendientes: ${expiredPendientes.length}`);
        console.log(`⚠️ [TIMEOUT] - En proceso: ${expiredEnProceso.length}`);

        // Cancelar transacciones pendientes
        for (const transaccion of expiredPendientes) {
          await this.cancelExpiredTransaction(transaccion, "pendiente");
        }

        // Cancelar transacciones en_proceso
        for (const transaccion of expiredEnProceso) {
          await this.cancelExpiredTransaction(transaccion, "en_proceso");
        }
      } else {
        console.log(`✅ [TIMEOUT] No hay transacciones expiradas`);
      }
    } catch (error) {
      console.error("❌ [TIMEOUT] Error verificando transacciones:", error);
    }
  }

  /**
   * Cancelar transacción expirada
   */
  async cancelExpiredTransaction(transaccion, estadoOriginal) {
    try {
      const tiempoTranscurrido =
        estadoOriginal === "pendiente"
          ? Date.now() - new Date(transaccion.createdAt).getTime()
          : Date.now() - new Date(transaccion.updatedAt).getTime();

      const minutos = Math.floor(tiempoTranscurrido / 60000);

      console.log(
        `🚫 [TIMEOUT] Cancelando transacción ${transaccion._id} (${estadoOriginal}, ${minutos} minutos)`
      );

      // Actualizar estado de la transacción
      transaccion.estado = "cancelada";
      transaccion.metadata = {
        ...transaccion.metadata,
        canceladoPor: "sistema",
        motivoCancelacion: "timeout",
        estadoAnterior: estadoOriginal,
        tiempoTranscurrido: tiempoTranscurrido,
        canceladoEn: new Date().toISOString(),
      };

      await transaccion.save();

      // Notificar a los participantes
      await this.notifyTransactionTimeout(transaccion, estadoOriginal, minutos);

      // Limpiar room de la transacción
      this.socketManager.roomsManager.limpiarRoomTransaccion(transaccion._id);

      // Registrar log
      await registrarLog({
        accion: "Transacción cancelada por timeout",
        usuario: transaccion.jugadorId,
        rol: "sistema",
        detalle: {
          transaccionId: transaccion._id,
          estadoOriginal: estadoOriginal,
          tiempoTranscurrido: minutos + " minutos",
          motivo: `Timeout automático (>${
            estadoOriginal === "pendiente" ? "2" : "4"
          } minutos)`,
        },
      });

      console.log(
        `✅ [TIMEOUT] Transacción ${transaccion._id} cancelada exitosamente`
      );
    } catch (error) {
      console.error(
        `❌ [TIMEOUT] Error cancelando transacción ${transaccion._id}:`,
        error
      );
    }
  }

  /**
   * Notificar timeout a participantes
   */
  async notifyTransactionTimeout(transaccion, estadoOriginal, minutos) {
    try {
      const mensaje =
        estadoOriginal === "pendiente"
          ? `Tu solicitud de depósito fue cancelada automáticamente por inactividad (${minutos} minutos sin respuesta).`
          : `Tu depósito fue cancelado automáticamente por inactividad (${minutos} minutos sin completar el pago).`;

      // Notificar al jugador
      if (transaccion.telegramId) {
        this.socketManager.roomsManager.notificarJugador(
          transaccion.telegramId,
          "transaccion-cancelada-por-timeout",
          {
            transaccionId: transaccion._id,
            estado: "cancelada",
            estadoAnterior: estadoOriginal,
            motivo: "timeout",
            mensaje: mensaje,
            tiempoTranscurrido: minutos,
            timestamp: new Date().toISOString(),
          }
        );

        console.log(
          `📢 [TIMEOUT] Jugador ${transaccion.telegramId} notificado de cancelación`
        );

        // Notificar al bot de Telegram
        try {
          const jugador = await Jugador.findById(transaccion.jugadorId);
          if (jugador && jugador.telegramId) {
            // Verificar si el jugador tiene la app de depósitos abierta
            const tieneAppAbierta = this.socketManager.connectedPlayers.has(
              jugador.telegramId
            );

            if (tieneAppAbierta) {
              console.log(
                `ℹ️ [TIMEOUT] Jugador ${jugador.telegramId} tiene la app de depósitos abierta, no enviar notificación a Telegram`
              );
              return; // No enviar notificación a Telegram si tiene la app abierta
            }

            const notificacion = await crearNotificacionBot({
              transaccionId: transaccion._id,
              jugadorTelegramId: jugador.telegramId,
              tipo: "deposito_cancelado",
              titulo: "Depósito cancelado",
              mensaje: mensaje,
              datos: {
                monto: transaccion.monto,
                tiempoTranscurrido: minutos,
                motivo: "timeout",
              },
              eventoId: `deposito-cancelado-timeout-${transaccion._id}`,
            });

            console.log(
              `🔍 [TIMEOUT] Verificando bot conectado: ${this.socketManager.connectedBots.size} bot(es)`
            );

            if (notificacion && this.socketManager.connectedBots.size > 0) {
              console.log(
                `📤 [TIMEOUT] Emitiendo evento bot-notificacion para jugador ${jugador.telegramId}`
              );

              this.socketManager.io.emit("bot-notificacion", {
                notificacionId: notificacion._id.toString(),
                tipo: notificacion.tipo,
                titulo: notificacion.titulo,
                mensaje: notificacion.mensaje,
                jugadorTelegramId: notificacion.jugadorTelegramId,
                datos: notificacion.datos,
              });

              console.log(
                `✅ [TIMEOUT] Notificación bot creada y emitida para jugador ${jugador.telegramId}`
              );
            } else if (!notificacion) {
              console.log(
                `⚠️ [TIMEOUT] No se pudo crear notificación bot (duplicado?)`
              );
            } else {
              console.log(
                `⚠️ [TIMEOUT] Bot no está conectado, notificación quedará pendiente para polling`
              );
            }
          }
        } catch (error) {
          console.error(
            "❌ [TIMEOUT] Error notificando al bot por timeout:",
            error.message
          );
        }
      }

      // Si es transacción pendiente (sin cajero), solo actualizar listas de cajeros
      // No enviar mensaje intrusivo, solo que desaparezca la transacción
      if (estadoOriginal === "pendiente") {
        this.socketManager.roomsManager.notificarCajerosDisponibles(
          "transaccion-cancelada-por-timeout",
          {
            transaccionId: transaccion._id,
            estado: "cancelada",
            estadoAnterior: estadoOriginal,
            motivo: "timeout",
            tiempoTranscurrido: minutos,
            timestamp: new Date().toISOString(),
            // Sin campo 'mensaje' para cajeros - solo actualización de lista
          }
        );

        console.log(
          `📢 [TIMEOUT] Cajeros notificados para actualizar listas (transacción pendiente cancelada)`
        );
      }

      // Si había un cajero asignado, notificar también
      if (transaccion.cajeroId && estadoOriginal === "en_proceso") {
        // Obtener estado del cajero
        const cajeroState =
          this.socketManager.connectionStateManager.connectionStates.cajeros.get(
            transaccion.cajeroId._id.toString()
          );

        if (cajeroState && cajeroState.socketId) {
          const socket = this.socketManager.io.sockets.sockets.get(
            cajeroState.socketId
          );
          if (socket) {
            socket.emit("transaccion-cancelada-por-timeout", {
              transaccionId: transaccion._id,
              estado: "cancelada",
              estadoAnterior: estadoOriginal,
              motivo: "timeout",
              mensaje: `El depósito fue cancelado por inactividad (${minutos} minutos sin pago).`,
              tiempoTranscurrido: minutos,
              timestamp: new Date().toISOString(),
            });

            console.log(
              `📢 [TIMEOUT] Cajero ${transaccion.cajeroId.nombreCompleto} notificado de cancelación`
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `❌ [TIMEOUT] Error notificando timeout de transacción ${transaccion._id}:`,
        error
      );
    }
  }

  /**
   * Obtener estadísticas
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      timeouts: this.timeouts,
      checkIntervals: this.checkIntervals,
      mode: "adaptive-polling",
    };
  }
}

module.exports = TransactionTimeoutManager;
