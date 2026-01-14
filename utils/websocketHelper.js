/**
 * Helper para emitir eventos WebSocket desde controladores HTTP
 * Mantiene compatibilidad entre APIs REST y WebSocket
 */

class WebSocketHelper {
  constructor() {
    this.socketManager = null;
  }

  /**
   * Inicializar el helper con el socketManager
   */
  initialize(socketManager) {
    this.socketManager = socketManager;
  }

  /**
   * Obtener el socketManager desde la app Express
   */
  getSocketManager(req) {
    if (!this.socketManager) {
      this.socketManager = req.app.get("socketManager");
    }
    return this.socketManager;
  }

  /**
   * Emitir evento de nueva solicitud de depósito
   */
  async emitNuevaSolicitudDeposito(transaccion, jugador) {
    if (!this.socketManager) return;

    try {
      const depositoController = this.socketManager.depositoController;
      if (depositoController) {
        await depositoController.notificarCajerosNuevaSolicitud(
          transaccion,
          jugador
        );
        console.log(
          "📡 [HTTP→WS] Nueva solicitud de depósito emitida via WebSocket"
        );
      }
    } catch (error) {
      console.error("❌ [HTTP→WS] Error emitiendo nueva solicitud:", error);
    }
  }

  /**
   * Emitir evento de cajero asignado
   */
  async emitCajeroAsignado(transaccion, cajero) {
    if (!this.socketManager) return;

    try {
      const depositoController = this.socketManager.depositoController;
      if (depositoController) {
        await depositoController.notificarJugadorSolicitudAceptada(
          transaccion,
          cajero
        );
        console.log("📡 [HTTP→WS] Cajero asignado emitido via WebSocket");
      }
    } catch (error) {
      console.error("❌ [HTTP→WS] Error emitiendo cajero asignado:", error);
    }
  }

  /**
   * Emitir evento de pago confirmado por usuario
   */
  async emitPagoConfirmadoUsuario(transaccion) {
    if (!this.socketManager) return;

    try {
      const depositoController = this.socketManager.depositoController;
      if (depositoController) {
        await depositoController.notificarCajeroVerificarPago(transaccion);
        console.log(
          "📡 [HTTP→WS] Pago confirmado por usuario emitido via WebSocket"
        );
      }
    } catch (error) {
      console.error("❌ [HTTP→WS] Error emitiendo pago confirmado:", error);
    }
  }

  /**
   * Emitir evento de transacción completada
   */
  async emitTransaccionCompletada(transaccion, jugador) {
    if (!this.socketManager) return;

    try {
      const depositoController = this.socketManager.depositoController;
      if (depositoController) {
        await depositoController.notificarJugadorDepositoCompletado(
          transaccion,
          jugador
        );
        console.log(
          "📡 [HTTP→WS] Transacción completada emitida via WebSocket"
        );
      }
    } catch (error) {
      console.error(
        "❌ [HTTP→WS] Error emitiendo transacción completada:",
        error
      );
    }
  }

  /**
   * Emitir evento de transacción rechazada
   */
  async emitTransaccionRechazada(transaccion, jugador, motivo) {
    if (!this.socketManager) return;

    try {
      const depositoController = this.socketManager.depositoController;
      if (depositoController) {
        await depositoController.notificarJugadorDepositoRechazado(
          transaccion,
          jugador,
          motivo
        );
        console.log("📡 [HTTP→WS] Transacción rechazada emitida via WebSocket");
      }
    } catch (error) {
      console.error(
        "❌ [HTTP→WS] Error emitiendo transacción rechazada:",
        error
      );
    }
  }

  /**
   * Emitir evento de transacción cancelada por jugador
   */
  async emitTransaccionCanceladaPorJugador(transaccion, motivo) {
    if (!this.socketManager) {
      console.log("⚠️ [HTTP→WS] socketManager no inicializado");
      return;
    }

    try {
      console.log("🔴 [HTTP→WS] emitTransaccionCanceladaPorJugador llamado");
      console.log("🔴 [HTTP→WS] TransaccionId:", transaccion._id);
      console.log("🔴 [HTTP→WS] Estado:", transaccion.estado);
      console.log("🔴 [HTTP→WS] CajeroId:", transaccion.cajeroId);

      const transaccionIdStr = transaccion._id.toString();
      const jugadorNombre =
        transaccion.jugadorId.nickname ||
        transaccion.jugadorId.firstName ||
        "Usuario";
      const notificationData = {
        transaccionId: transaccion._id,
        jugador: {
          id: transaccion.jugadorId._id || transaccion.jugadorId,
          telegramId: transaccion.telegramId,
          nombre: jugadorNombre,
        },
        motivo: motivo || "Cancelada por el usuario",
        timestamp: new Date().toISOString(),
      };

      console.log("🔴 [HTTP→WS] Datos de notificación:", notificationData);

      // Si hay cajero asignado (en_proceso, realizada), notificar al room específico
      if (transaccion.cajeroId) {
        const cajeroId = transaccion.cajeroId._id || transaccion.cajeroId;

        console.log("🔴 [HTTP→WS] Cajero asignado, enviando notificación");
        console.log(
          "🔴 [HTTP→WS] Room de transacción:",
          `transaccion-${transaccionIdStr}`
        );

        // Importar crearNotificacionInterna
        const {
          crearNotificacionInterna,
        } = require("../controllers/notificacionesController");

        // Crear notificación persistente para el cajero
        try {
          await crearNotificacionInterna({
            destinatarioId: cajeroId,
            destinatarioTipo: "cajero",
            tipo: "transaccion_cancelada",
            titulo: "Depósito cancelado por jugador",
            mensaje: `El jugador ${jugadorNombre} canceló el depósito de ${(
              transaccion.monto / 100
            ).toFixed(2)} Bs`,
            datos: {
              transaccionId: transaccion._id.toString(),
              jugadorNombre: jugadorNombre,
              monto: transaccion.monto,
              motivo: motivo || "Cancelada por el usuario",
            },
            eventoId: `cancelacion-${transaccion._id}`,
          });

          console.log(
            `✅ [HTTP→WS] Notificación persistente creada para cajero ${cajeroId}`
          );

          // Emitir evento de nueva notificación al cajero específico
          const socketId = this.socketManager.connectedCajeros.get(
            cajeroId.toString()
          );
          if (socketId) {
            const socket = this.socketManager.io.sockets.sockets.get(socketId);
            if (socket) {
              socket.emit("nuevaNotificacion", {
                tipo: "transaccion_cancelada",
                titulo: "Depósito cancelado por jugador",
                mensaje: `El jugador ${jugadorNombre} canceló el depósito de ${(
                  transaccion.monto / 100
                ).toFixed(2)} Bs`,
                transaccionId: transaccion._id.toString(),
              });
              console.log(
                `📨 [HTTP→WS] Evento nuevaNotificacion emitido al cajero`
              );
            }
          }
        } catch (notifError) {
          console.error(
            `❌ [HTTP→WS] Error creando notificación persistente:`,
            notifError
          );
        }

        this.socketManager.roomsManager.notificarTransaccion(
          transaccionIdStr,
          "transaccion-cancelada-por-jugador",
          notificationData
        );

        console.log(
          `✅ [HTTP→WS] Transacción ${transaccionIdStr} cancelada notificada al cajero ${cajeroId}`
        );
      } else {
        // Si no hay cajero asignado (pendiente), notificar a todos los cajeros
        console.log("🔴 [HTTP→WS] No hay cajero asignado (estado pendiente)");
        console.log("🔴 [HTTP→WS] Notificando a todos los cajeros disponibles");

        // Importar crearNotificacionInterna
        const {
          crearNotificacionInterna,
        } = require("../controllers/notificacionesController");

        // Crear notificaciones persistentes para todos los cajeros conectados
        try {
          const cajerosConectados = Array.from(
            this.socketManager.connectedCajeros.keys()
          );

          for (const cajeroIdStr of cajerosConectados) {
            await crearNotificacionInterna({
              destinatarioId: cajeroIdStr,
              destinatarioTipo: "cajero",
              tipo: "transaccion_cancelada",
              titulo: "Solicitud de depósito cancelada",
              mensaje: `El jugador ${jugadorNombre} canceló su solicitud de depósito de ${(
                transaccion.monto / 100
              ).toFixed(2)} Bs`,
              datos: {
                transaccionId: transaccion._id.toString(),
                jugadorNombre: jugadorNombre,
                monto: transaccion.monto,
                motivo: motivo || "Cancelada por el usuario",
              },
              eventoId: `cancelacion-${transaccion._id}`,
            });

            // Emitir evento de nueva notificación al cajero específico
            const socketId =
              this.socketManager.connectedCajeros.get(cajeroIdStr);
            if (socketId) {
              const socket =
                this.socketManager.io.sockets.sockets.get(socketId);
              if (socket) {
                socket.emit("nuevaNotificacion", {
                  tipo: "transaccion_cancelada",
                  titulo: "Solicitud de depósito cancelada",
                  mensaje: `El jugador ${jugadorNombre} canceló su solicitud de depósito de ${(
                    transaccion.monto / 100
                  ).toFixed(2)} Bs`,
                  transaccionId: transaccion._id.toString(),
                });
              }
            }
          }

          console.log(
            `✅ [HTTP→WS] Notificaciones persistentes creadas para ${cajerosConectados.length} cajero(s)`
          );
        } catch (notifError) {
          console.error(
            `❌ [HTTP→WS] Error creando notificaciones persistentes:`,
            notifError
          );
        }

        this.socketManager.roomsManager.notificarCajerosDisponibles(
          "transaccion-cancelada-por-jugador",
          notificationData
        );

        console.log(
          `✅ [HTTP→WS] Transacción ${transaccionIdStr} cancelada notificada a todos los cajeros`
        );
      }
    } catch (error) {
      console.error(
        "❌ [HTTP→WS] Error emitiendo transacción cancelada:",
        error
      );
    }
  }

  /**
   * Verificar si hay usuarios conectados via WebSocket
   */
  getWebSocketStats() {
    if (!this.socketManager) {
      return { jugadoresConectados: 0, cajerosConectados: 0 };
    }

    return {
      jugadoresConectados: this.socketManager.connectedUsers.size,
      cajerosConectados: this.socketManager.connectedCajeros.size,
      totalConexiones:
        this.socketManager.connectedUsers.size +
        this.socketManager.connectedCajeros.size,
    };
  }

  /**
   * Log de estadísticas WebSocket
   */
  logWebSocketStats(context = "") {
    const stats = this.getWebSocketStats();
    console.log(
      `📊 [HTTP→WS] ${context} - Jugadores: ${stats.jugadoresConectados}, Cajeros: ${stats.cajerosConectados}`
    );
  }

  /**
   * Limpiar room de transacción cuando finaliza
   * Se llama automáticamente cuando una transacción cambia a un estado final
   * Estados finales: completada, completada_con_ajuste, rechazada, fallida, cancelada, revertida
   */
  async limpiarRoomTransaccionFinalizada(transaccion) {
    if (!this.socketManager) {
      console.log(
        `⚠️ [HTTP→WS] socketManager no inicializado, no se puede limpiar room de transacción ${transaccion._id}`
      );
      return;
    }

    try {
      const Transaccion = require("../models/Transaccion");
      const esEstadoFinal = Transaccion.esEstadoFinal(transaccion.estado);

      if (!esEstadoFinal) {
        console.log(
          `ℹ️ [HTTP→WS] Transacción ${transaccion._id} en estado ${transaccion.estado} (no es final), no se limpia room`
        );
        return;
      }

      console.log(
        `🧹 [HTTP→WS] Limpiando room de transacción ${transaccion._id} (estado final: ${transaccion.estado})`
      );

      const limpiado = this.socketManager.roomsManager.limpiarRoomTransaccion(
        transaccion._id.toString()
      );

      if (limpiado) {
        console.log(
          `✅ [HTTP→WS] Room de transacción ${transaccion._id} limpiado exitosamente`
        );
      } else {
        console.log(
          `ℹ️ [HTTP→WS] Room de transacción ${transaccion._id} no se pudo limpiar (puede estar protegido o no existir)`
        );
      }
    } catch (error) {
      console.error(
        `❌ [HTTP→WS] Error limpiando room de transacción ${transaccion._id}:`,
        error
      );
    }
  }
}

// Crear instancia singleton
const websocketHelper = new WebSocketHelper();

module.exports = websocketHelper;
