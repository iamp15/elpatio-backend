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
      console.log("🔴 [HTTP→WS] CajeroId:", transaccion.cajeroId);
      
      // Notificar al cajero si está asignado
      if (transaccion.cajeroId) {
        const cajeroId = transaccion.cajeroId._id || transaccion.cajeroId;
        const transaccionIdStr = transaccion._id.toString();

        console.log("🔴 [HTTP→WS] Cajero asignado, enviando notificación");
        console.log("🔴 [HTTP→WS] Room de transacción:", `transaccion-${transaccionIdStr}`);
        
        const notificationData = {
          transaccionId: transaccion._id,
          jugador: {
            id: transaccion.jugadorId._id || transaccion.jugadorId,
            telegramId: transaccion.telegramId,
            nombre:
              transaccion.jugadorId.nickname ||
              transaccion.jugadorId.firstName ||
              "Usuario",
          },
          motivo: motivo || "Cancelada por el usuario",
          timestamp: new Date().toISOString(),
        };

        console.log("🔴 [HTTP→WS] Datos de notificación:", notificationData);

        this.socketManager.roomsManager.notificarTransaccion(
          transaccionIdStr,
          "transaccion-cancelada-por-jugador",
          notificationData
        );

        console.log(
          `✅ [HTTP→WS] Transacción ${transaccionIdStr} cancelada notificada al cajero ${cajeroId}`
        );
      } else {
        console.log("ℹ️ [HTTP→WS] No hay cajero asignado, no se notifica");
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
}

// Crear instancia singleton
const websocketHelper = new WebSocketHelper();

module.exports = websocketHelper;
