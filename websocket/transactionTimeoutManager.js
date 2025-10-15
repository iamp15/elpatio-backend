/**
 * Manager para auto-cancelación de transacciones por timeout
 * Usa timeouts individuales por transacción (no polling)
 * - Transacciones "pendiente" (sin cajero): 2 minutos (testing)
 * - Transacciones "en_proceso" (cajero asignado): 4 minutos (testing)
 */

const Transaccion = require("../models/Transaccion");
const { registrarLog } = require("../utils/logHelper");

class TransactionTimeoutManager {
  constructor(socketManager) {
    this.socketManager = socketManager;
    // Timeouts para pruebas (2 y 4 minutos)
    this.timeouts = {
      pendiente: 2 * 60 * 1000, // 2 minutos en milisegundos
      en_proceso: 4 * 60 * 1000, // 4 minutos en milisegundos
    };
    // Map de timeouts activos: transaccionId -> timeoutId
    this.activeTimeouts = new Map();
  }

  /**
   * Iniciar sistema de timeouts
   * En este nuevo diseño, no hay polling - cada transacción programa su propio timeout
   */
  start() {
    console.log("⏰ [TIMEOUT] Sistema de auto-cancelación iniciado");
    console.log(
      `⏰ [TIMEOUT] Timeouts: Pendiente=${this.timeouts.pendiente / 60000}min, En proceso=${this.timeouts.en_proceso / 60000}min`
    );
    console.log(
      "⏰ [TIMEOUT] Modo: Timeouts individuales (no polling) - Eficiente ✨"
    );

    // Recuperar transacciones activas existentes al inicio del servidor
    this.recoverExistingTransactions();
  }

  /**
   * Detener sistema de timeouts
   */
  stop() {
    console.log("⏰ [TIMEOUT] Deteniendo sistema de auto-cancelación...");

    // Cancelar todos los timeouts activos
    for (const [transaccionId, timeoutId] of this.activeTimeouts.entries()) {
      clearTimeout(timeoutId);
      console.log(`⏰ [TIMEOUT] Timeout cancelado para transacción ${transaccionId}`);
    }

    this.activeTimeouts.clear();
    console.log("⏰ [TIMEOUT] Sistema de auto-cancelación detenido");
  }

  /**
   * Recuperar transacciones activas existentes al iniciar el servidor
   * Solo se ejecuta una vez al arrancar
   */
  async recoverExistingTransactions() {
    try {
      console.log(
        "🔄 [TIMEOUT] Recuperando transacciones activas existentes..."
      );

      // Buscar transacciones pendientes y en_proceso
      const transaccionesActivas = await Transaccion.find({
        estado: { $in: ["pendiente", "en_proceso"] },
      });

      console.log(
        `🔄 [TIMEOUT] Encontradas ${transaccionesActivas.length} transacciones activas`
      );

      for (const transaccion of transaccionesActivas) {
        // Calcular tiempo restante
        const tiempoBase =
          transaccion.estado === "pendiente"
            ? new Date(transaccion.createdAt)
            : new Date(transaccion.updatedAt);

        const tiempoTranscurrido = Date.now() - tiempoBase.getTime();
        const timeoutDuration = this.timeouts[transaccion.estado];
        const tiempoRestante = timeoutDuration - tiempoTranscurrido;

        if (tiempoRestante <= 0) {
          // Ya expiró, cancelar inmediatamente
          console.log(
            `⚠️ [TIMEOUT] Transacción ${transaccion._id} ya expiró, cancelando...`
          );
          await this.cancelExpiredTransaction(transaccion, transaccion.estado);
        } else {
          // Programar timeout con el tiempo restante
          console.log(
            `⏰ [TIMEOUT] Programando timeout para transacción ${transaccion._id} en ${Math.round(tiempoRestante / 1000)}s`
          );
          this.scheduleTimeout(
            transaccion._id.toString(),
            tiempoRestante,
            transaccion.estado
          );
        }
      }

      console.log("✅ [TIMEOUT] Recuperación de transacciones completada");
    } catch (error) {
      console.error(
        "❌ [TIMEOUT] Error recuperando transacciones existentes:",
        error
      );
    }
  }

  /**
   * Programar timeout para una transacción específica
   * @param {string} transaccionId - ID de la transacción
   * @param {number} delay - Tiempo en ms antes de cancelar (opcional, usa default si no se provee)
   * @param {string} estado - Estado de la transacción ('pendiente' o 'en_proceso')
   */
  scheduleTimeout(transaccionId, delay = null, estado = "pendiente") {
    // Si ya hay un timeout para esta transacción, cancelarlo primero
    this.cancelTimeout(transaccionId);

    // Usar delay especificado o el default según el estado
    const timeoutDelay = delay !== null ? delay : this.timeouts[estado];

    console.log(
      `⏰ [TIMEOUT] Programando auto-cancelación para ${transaccionId} en ${Math.round(timeoutDelay / 60000)} minutos (estado: ${estado})`
    );

    // Programar timeout
    const timeoutId = setTimeout(async () => {
      console.log(
        `⏱️ [TIMEOUT] Timeout alcanzado para transacción ${transaccionId}`
      );
      await this.handleTimeout(transaccionId, estado);
    }, timeoutDelay);

    // Guardar referencia del timeout
    this.activeTimeouts.set(transaccionId, timeoutId);
  }

  /**
   * Cancelar timeout de una transacción
   * Se llama cuando la transacción se completa, rechaza o cancela antes del timeout
   */
  cancelTimeout(transaccionId) {
    const timeoutId = this.activeTimeouts.get(transaccionId);

    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activeTimeouts.delete(transaccionId);
      console.log(
        `✅ [TIMEOUT] Timeout cancelado para transacción ${transaccionId}`
      );
      return true;
    }

    return false;
  }

  /**
   * Actualizar timeout cuando cambia el estado de la transacción
   * Por ejemplo, de 'pendiente' (15min) a 'en_proceso' (30min)
   */
  updateTimeout(transaccionId, nuevoEstado) {
    console.log(
      `🔄 [TIMEOUT] Actualizando timeout para ${transaccionId} a estado: ${nuevoEstado}`
    );

    // Cancelar timeout anterior
    this.cancelTimeout(transaccionId);

    // Programar nuevo timeout según el nuevo estado
    if (nuevoEstado === "pendiente" || nuevoEstado === "en_proceso") {
      this.scheduleTimeout(transaccionId, null, nuevoEstado);
    }
  }

  /**
   * Manejar timeout alcanzado
   */
  async handleTimeout(transaccionId, estadoOriginal) {
    try {
      console.log(
        `🚫 [TIMEOUT] Procesando timeout para transacción ${transaccionId}`
      );

      // Buscar la transacción
      const transaccion = await Transaccion.findById(transaccionId)
        .populate("jugadorId", "telegramId nickname firstName")
        .populate("cajeroId", "nombreCompleto email");

      if (!transaccion) {
        console.log(
          `⚠️ [TIMEOUT] Transacción ${transaccionId} no encontrada, posiblemente ya fue procesada`
        );
        this.activeTimeouts.delete(transaccionId);
        return;
      }

      // Verificar si la transacción aún está en un estado cancelable
      if (
        transaccion.estado !== "pendiente" &&
        transaccion.estado !== "en_proceso"
      ) {
        console.log(
          `ℹ️ [TIMEOUT] Transacción ${transaccionId} ya no está en estado cancelable (${transaccion.estado})`
        );
        this.activeTimeouts.delete(transaccionId);
        return;
      }

      // Cancelar la transacción
      await this.cancelExpiredTransaction(transaccion, estadoOriginal);

      // Limpiar timeout de la lista
      this.activeTimeouts.delete(transaccionId);
    } catch (error) {
      console.error(
        `❌ [TIMEOUT] Error manejando timeout de ${transaccionId}:`,
        error
      );
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
          motivo: `Timeout automático (>${estadoOriginal === "pendiente" ? "2" : "4"} minutos)`,
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
      timeouts: this.timeouts,
      activeTimeouts: this.activeTimeouts.size,
      transaccionesMonitoreadas: Array.from(this.activeTimeouts.keys()),
    };
  }
}

module.exports = TransactionTimeoutManager;
