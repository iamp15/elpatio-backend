/**
 * Manager para recuperación de conexiones y transacciones
 * Implementa tiempo de gracia para reconexión antes de limpiar rooms
 */

class ConnectionRecoveryManager {
  constructor(socketManager) {
    this.socketManager = socketManager;

    // Configuración de tiempos de gracia por tipo de usuario (en milisegundos)
    this.gracePeriodsMs = {
      jugador: 60000, // 1 minuto para jugadores
      cajero: 120000, // 2 minutos para cajeros
    };

    // Usuarios en periodo de gracia
    // Map<socketId, {tipo, userId, timestamp, transaccionesActivas, timer}>
    this.disconnectedUsers = new Map();

    // Transacciones en espera de reconexión
    // Map<transaccionId, {jugadorId, cajeroId, estado, timestamp}>
    this.pendingTransactions = new Map();
  }

  /**
   * Registrar desconexión con tiempo de gracia
   */
  registerDisconnection(socket) {
    const userType = socket.userType; // 'jugador' o 'cajero'
    const userId = userType === "jugador" ? socket.telegramId : socket.cajeroId;

    if (!userType || !userId) {
      console.log(
        "⚠️ [RECOVERY] Socket sin tipo o ID, limpiando inmediatamente"
      );
      this.cleanupImmediately(socket.id);
      return;
    }

    // Obtener transacciones activas del socket
    const activeTransactions = this.getActiveTransactions(socket.id);

    // Si no hay transacciones activas, limpiar inmediatamente
    if (activeTransactions.length === 0) {
      console.log(
        `🧹 [RECOVERY] ${userType} ${userId} sin transacciones activas, limpiando inmediatamente`
      );
      this.cleanupImmediately(socket.id);
      return;
    }

    const gracePeriod = this.gracePeriodsMs[userType];
    const disconnectionTime = Date.now();

    console.log(
      `⏳ [RECOVERY] ${userType} ${userId} desconectado con ${activeTransactions.length} transacciones activas. Tiempo de gracia: ${gracePeriod}ms`
    );

    // Guardar información de desconexión
    const disconnectionInfo = {
      socketId: socket.id,
      tipo: userType,
      userId: userId,
      timestamp: disconnectionTime,
      transaccionesActivas: activeTransactions,
      gracePeriod: gracePeriod,
    };

    this.disconnectedUsers.set(socket.id, disconnectionInfo);

    // Registrar transacciones pendientes
    activeTransactions.forEach((transaccionId) => {
      this.pendingTransactions.set(transaccionId, {
        ...disconnectionInfo,
        transaccionId,
        estadoDesconexion: "esperando_reconexion",
      });
    });

    // Notificar a los participantes sobre la desconexión temporal
    this.notifyTemporaryDisconnection(disconnectionInfo);

    // Configurar timer para limpieza después del periodo de gracia
    const timer = setTimeout(() => {
      this.handleGracePeriodExpired(socket.id);
    }, gracePeriod);

    disconnectionInfo.timer = timer;
  }

  /**
   * Manejar reconexión exitosa
   */
  async handleReconnection(socket, userId) {
    const userType = socket.userType;

    // Buscar desconexión pendiente
    let disconnectionInfo = null;
    let oldSocketId = null;

    for (const [socketId, info] of this.disconnectedUsers.entries()) {
      if (info.userId === userId && info.tipo === userType) {
        disconnectionInfo = info;
        oldSocketId = socketId;
        break;
      }
    }

    if (!disconnectionInfo) {
      console.log(
        `ℹ️ [RECOVERY] ${userType} ${userId} reconectó pero no hay desconexión pendiente`
      );
      return { recovered: false };
    }

    const disconnectionDuration = Date.now() - disconnectionInfo.timestamp;
    console.log(
      `✅ [RECOVERY] ${userType} ${userId} reconectado dentro del periodo de gracia (${disconnectionDuration}ms)`
    );

    // Cancelar timer de limpieza
    if (disconnectionInfo.timer) {
      clearTimeout(disconnectionInfo.timer);
    }

    // Re-unir a rooms de transacciones
    const recoveredTransactions = [];
    for (const transaccionId of disconnectionInfo.transaccionesActivas) {
      const wasRecovered = await this.rejoinTransactionRoom(
        socket,
        transaccionId
      );

      // Solo agregar a la lista si realmente se recuperó (no estaba en estado final)
      if (wasRecovered) {
        recoveredTransactions.push(transaccionId);
      }

      // Limpiar de transacciones pendientes
      this.pendingTransactions.delete(transaccionId);
    }

    // Limpiar de usuarios desconectados
    this.disconnectedUsers.delete(oldSocketId);

    // Notificar reconexión exitosa
    this.notifySuccessfulReconnection(
      socket,
      recoveredTransactions,
      disconnectionDuration
    );

    return {
      recovered: true,
      transactionsRecovered: recoveredTransactions,
      disconnectionDuration: disconnectionDuration,
    };
  }

  /**
   * Re-unir socket a room de transacción
   */
  async rejoinTransactionRoom(socket, transaccionId) {
    try {
      console.log(
        `🔄 [RECOVERY] Re-uniendo socket ${socket.id} a transacción ${transaccionId}`
      );

      // Obtener estado actual de la transacción desde la BD
      const Transaccion = require("../models/Transaccion");
      const transaccion = await Transaccion.findById(transaccionId)
        .populate("jugadorId", "telegramId nickname firstName")
        .populate("cajeroId", "nombreCompleto email datosPagoMovil");

      if (!transaccion) {
        console.error(
          `❌ [RECOVERY] Transacción ${transaccionId} no encontrada`
        );
        return false; // No se pudo recuperar
      }

      // Estados finales que no requieren recuperación
      const estadosFinales = [
        "completada",
        "rechazada",
        "cancelada",
        "fallida",
        "revertida",
      ];

      if (estadosFinales.includes(transaccion.estado)) {
        console.log(
          `ℹ️ [RECOVERY] Transacción ${transaccionId} en estado final: ${transaccion.estado} - No se recupera`
        );
        // Informar al cliente que la transacción ya finalizó
        socket.emit("transaction-already-finished", {
          transaccionId: transaccionId,
          estado: transaccion.estado,
          mensaje: "La transacción ya ha finalizado y no requiere acción",
        });
        return false; // No se recuperó
      }

      // Solo para estados activos: pendiente, en_proceso, realizada
      console.log(
        `✅ [RECOVERY] Transacción ${transaccionId} en estado activo: ${transaccion.estado} - Recuperando`
      );

      // Agregar a room usando roomsManager
      this.socketManager.roomsManager.agregarParticipanteTransaccion(
        transaccionId,
        socket.id
      );

      // Preparar datos para enviar
      const recoveryData = {
        transaccionId: transaccion._id,
        estado: transaccion.estado,
        monto: transaccion.monto,
        infoPago: transaccion.infoPago,
        cajero: transaccion.cajeroId
          ? {
              id: transaccion.cajeroId._id,
              nombre: transaccion.cajeroId.nombreCompleto,
              telefono: transaccion.cajeroId.datosPagoMovil?.telefono,
              datosPago: transaccion.cajeroId.datosPagoMovil,
            }
          : null,
        timestamp: new Date().toISOString(),
        mensaje: "Conexión recuperada. Estado de transacción restaurado.",
      };

      console.log(
        `📤 [RECOVERY] Enviando transaction-state-recovered a socket ${socket.id}`
      );
      console.log(`📤 [RECOVERY] Datos a enviar:`, {
        transaccionId: recoveryData.transaccionId,
        estado: recoveryData.estado,
        monto: recoveryData.monto,
        tieneCajero: !!recoveryData.cajero,
      });

      // Enviar estado actual al socket reconectado
      socket.emit("transaction-state-recovered", recoveryData);

      console.log(
        `✅ [RECOVERY] Evento transaction-state-recovered EMITIDO a socket ${socket.id}`
      );
      console.log(
        `✅ [RECOVERY] Socket re-unido a transacción ${transaccionId} en estado: ${transaccion.estado}`
      );

      return true; // Transacción recuperada exitosamente
    } catch (error) {
      console.error(
        `❌ [RECOVERY] Error re-uniendo a transacción ${transaccionId}:`,
        error
      );
      return false; // Error al recuperar
    }
  }

  /**
   * Manejar expiración del periodo de gracia
   */
  handleGracePeriodExpired(socketId) {
    const disconnectionInfo = this.disconnectedUsers.get(socketId);

    if (!disconnectionInfo) {
      return; // Ya fue procesado
    }

    console.log(
      `⏰ [RECOVERY] Periodo de gracia expirado para ${disconnectionInfo.tipo} ${disconnectionInfo.userId}`
    );

    // Marcar transacciones como desconectadas
    for (const transaccionId of disconnectionInfo.transaccionesActivas) {
      this.handleTransactionDisconnectionTimeout(transaccionId);
      this.pendingTransactions.delete(transaccionId);
    }

    // Limpiar socket completamente
    this.cleanupImmediately(socketId);

    // Remover de usuarios desconectados
    this.disconnectedUsers.delete(socketId);

    // Notificar timeout
    this.notifyDisconnectionTimeout(disconnectionInfo);
  }

  /**
   * Manejar transacción que perdió conexión
   */
  async handleTransactionDisconnectionTimeout(transaccionId) {
    try {
      const Transaccion = require("../models/Transaccion");
      const transaccion = await Transaccion.findById(transaccionId);

      if (!transaccion) {
        console.error(
          `❌ [RECOVERY] Transacción ${transaccionId} no encontrada`
        );
        return;
      }

      console.log(
        `⚠️ [RECOVERY] Transacción ${transaccionId} perdió conexión. Estado: ${transaccion.estado}`
      );

      // Según el estado, decidir qué hacer
      switch (transaccion.estado) {
        case "pendiente":
          // Si estaba pendiente, se puede dejar pendiente (no se perdió nada)
          console.log(
            `ℹ️ [RECOVERY] Transacción ${transaccionId} estaba pendiente, se mantiene así`
          );
          break;

        case "en_proceso":
          // Si estaba en proceso, agregar nota pero mantener estado
          // El cajero o jugador deberá volver a solicitar/verificar cuando reconecte
          console.log(
            `⚠️ [RECOVERY] Transacción ${transaccionId} estaba en proceso, se mantiene para completar manualmente`
          );

          // Agregar metadata de desconexión
          transaccion.metadata = {
            ...transaccion.metadata,
            desconexionDetectada: true,
            timestampDesconexion: new Date().toISOString(),
            notasSistema:
              "Conexión perdida durante procesamiento. Verificar estado manualmente.",
          };
          await transaccion.save();
          break;

        case "realizada":
          // CRÍTICO: Usuario ya reportó el pago, mantener para que cajero verifique
          console.log(
            `🔴 [RECOVERY] Transacción ${transaccionId} estaba REALIZADA - Usuario reportó pago, cajero debe verificar`
          );

          transaccion.metadata = {
            ...transaccion.metadata,
            desconexionCriticaDetectada: true,
            timestampDesconexion: new Date().toISOString(),
            notasSistema:
              "IMPORTANTE: Usuario reportó pago pero se desconectó. Verificar pago urgente.",
          };
          await transaccion.save();
          break;

        case "confirmada":
        case "completada":
          // Si ya estaba confirmada o completada, no hacer nada (ya se procesó)
          console.log(
            `✅ [RECOVERY] Transacción ${transaccionId} ya estaba completada`
          );
          break;

        default:
          console.log(
            `ℹ️ [RECOVERY] Transacción ${transaccionId} en estado ${transaccion.estado}`
          );
      }

      // Limpiar room de transacción
      this.socketManager.roomsManager.limpiarRoomTransaccion(transaccionId);
    } catch (error) {
      console.error(
        `❌ [RECOVERY] Error manejando timeout de transacción ${transaccionId}:`,
        error
      );
    }
  }

  /**
   * Obtener transacciones activas de un socket
   */
  getActiveTransactions(socketId) {
    const activeTransactions = [];

    // Buscar en rooms de transacciones
    for (const [
      transaccionId,
      sockets,
    ] of this.socketManager.roomsManager.rooms.transacciones.entries()) {
      if (sockets.has(socketId)) {
        activeTransactions.push(transaccionId);
      }
    }

    return activeTransactions;
  }

  /**
   * Limpiar socket inmediatamente (sin tiempo de gracia)
   */
  cleanupImmediately(socketId) {
    // Usar limpieza normal de roomsManager
    this.socketManager.roomsManager.limpiarSocket(socketId);
    this.socketManager.connectionStateManager.removerUsuario(socketId);

    console.log(`🧹 [RECOVERY] Socket ${socketId} limpiado inmediatamente`);
  }

  /**
   * Notificar desconexión temporal
   */
  notifyTemporaryDisconnection(disconnectionInfo) {
    const { transaccionesActivas, tipo, userId } = disconnectionInfo;

    transaccionesActivas.forEach((transaccionId) => {
      // Notificar a otros participantes de la transacción
      this.socketManager.roomsManager.notificarTransaccion(
        transaccionId,
        "participant-disconnected",
        {
          tipo,
          userId,
          transaccionId,
          mensaje: `${tipo} se desconectó temporalmente. Esperando reconexión...`,
          timestamp: new Date().toISOString(),
        }
      );
    });
  }

  /**
   * Notificar reconexión exitosa
   */
  notifySuccessfulReconnection(
    socket,
    recoveredTransactions,
    disconnectionDuration
  ) {
    socket.emit("reconnection-successful", {
      mensaje: "Conexión recuperada exitosamente",
      transaccionesRecuperadas: recoveredTransactions,
      duracionDesconexion: disconnectionDuration,
      timestamp: new Date().toISOString(),
    });

    // Notificar a otros participantes
    recoveredTransactions.forEach((transaccionId) => {
      this.socketManager.roomsManager.notificarTransaccion(
        transaccionId,
        "participant-reconnected",
        {
          tipo: socket.userType,
          userId:
            socket.userType === "jugador" ? socket.telegramId : socket.cajeroId,
          transaccionId,
          mensaje: "Participante reconectado",
          timestamp: new Date().toISOString(),
        }
      );
    });
  }

  /**
   * Notificar timeout de desconexión
   */
  notifyDisconnectionTimeout(disconnectionInfo) {
    const { transaccionesActivas, tipo, userId } = disconnectionInfo;

    transaccionesActivas.forEach((transaccionId) => {
      this.socketManager.roomsManager.notificarTransaccion(
        transaccionId,
        "participant-disconnected-timeout",
        {
          tipo,
          userId,
          transaccionId,
          mensaje: `${tipo} no pudo reconectar. La transacción requiere verificación manual.`,
          timestamp: new Date().toISOString(),
        }
      );
    });
  }

  /**
   * Verificar si una transacción está esperando reconexión
   */
  isTransactionPending(transaccionId) {
    return this.pendingTransactions.has(transaccionId);
  }

  /**
   * Obtener información de transacción pendiente
   */
  getPendingTransactionInfo(transaccionId) {
    return this.pendingTransactions.get(transaccionId);
  }

  /**
   * Obtener estadísticas del sistema de recuperación
   */
  getRecoveryStats() {
    return {
      usuariosDesconectadosEnEspera: this.disconnectedUsers.size,
      transaccionesPendientesRecuperacion: this.pendingTransactions.size,
      detalles: {
        jugadores: Array.from(this.disconnectedUsers.values())
          .filter((info) => info.tipo === "jugador")
          .map((info) => ({
            userId: info.userId,
            transacciones: info.transaccionesActivas.length,
            tiempoRestante: info.gracePeriod - (Date.now() - info.timestamp),
          })),
        cajeros: Array.from(this.disconnectedUsers.values())
          .filter((info) => info.tipo === "cajero")
          .map((info) => ({
            userId: info.userId,
            transacciones: info.transaccionesActivas.length,
            tiempoRestante: info.gracePeriod - (Date.now() - info.timestamp),
          })),
      },
    };
  }

  /**
   * Limpiar todos los timers (para shutdown)
   */
  cleanup() {
    console.log("🧹 [RECOVERY] Limpiando sistema de recuperación...");

    for (const [socketId, info] of this.disconnectedUsers.entries()) {
      if (info.timer) {
        clearTimeout(info.timer);
      }
    }

    this.disconnectedUsers.clear();
    this.pendingTransactions.clear();

    console.log("✅ [RECOVERY] Sistema de recuperación limpiado");
  }
}

module.exports = ConnectionRecoveryManager;
