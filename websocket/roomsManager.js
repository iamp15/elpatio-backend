/**
 * Manager para el sistema de rooms de WebSocket
 * Organiza usuarios en rooms para notificaciones dirigidas
 */

class RoomsManager {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.rooms = {
      // Rooms de cajeros
      cajerosDisponibles: new Set(),
      cajerosOcupados: new Set(),

      // Rooms de jugadores (por telegramId)
      jugadores: new Map(), // telegramId -> Set<socketId>

      // Rooms de transacciones (por transaccionId)
      transacciones: new Map(), // transaccionId -> Set<socketId>

      // Rooms de administración
      adminDashboard: new Set(),
    };
  }

  /**
   * Agregar cajero a room de disponibles
   */
  agregarCajeroDisponible(cajeroId, socketId) {
    this.rooms.cajerosDisponibles.add(socketId);
    this.rooms.cajerosOcupados.delete(socketId);

    // Unirse al room de cajeros disponibles
    const socket = this.socketManager.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join("cajeros-disponibles");
      socket.leave("cajeros-ocupados");
    }

    console.log(`🏦 [ROOMS] Cajero ${cajeroId} agregado a disponibles`);
    this.logRoomStats();
  }

  /**
   * Mover cajero a room de ocupados
   */
  moverCajeroAOcupado(cajeroId, socketId) {
    this.rooms.cajerosDisponibles.delete(socketId);
    this.rooms.cajerosOcupados.add(socketId);

    // Cambiar de room
    const socket = this.socketManager.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave("cajeros-disponibles");
      socket.join("cajeros-ocupados");
    }

    console.log(`🏦 [ROOMS] Cajero ${cajeroId} movido a ocupados`);
    this.logRoomStats();
  }

  /**
   * Agregar jugador a su room personal
   */
  agregarJugador(telegramId, socketId) {
    if (!this.rooms.jugadores.has(telegramId)) {
      this.rooms.jugadores.set(telegramId, new Set());
    }

    this.rooms.jugadores.get(telegramId).add(socketId);

    // Unirse al room personal
    const socket = this.socketManager.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(`jugador-${telegramId}`);
    }

    console.log(`👤 [ROOMS] Jugador ${telegramId} agregado a su room`);
    this.logRoomStats();
  }

  /**
   * Remover jugador de su room
   */
  removerJugador(telegramId, socketId) {
    if (this.rooms.jugadores.has(telegramId)) {
      this.rooms.jugadores.get(telegramId).delete(socketId);

      // Si no hay más sockets para este jugador, limpiar
      if (this.rooms.jugadores.get(telegramId).size === 0) {
        this.rooms.jugadores.delete(telegramId);
      }
    }

    // Salir del room personal
    const socket = this.socketManager.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(`jugador-${telegramId}`);
    }

    console.log(`👤 [ROOMS] Jugador ${telegramId} removido de su room`);
    this.logRoomStats();
  }

  /**
   * Crear room para una transacción específica
   */
  crearRoomTransaccion(transaccionId, participantes) {
    this.rooms.transacciones.set(transaccionId, new Set());

    // Agregar participantes al room
    participantes.forEach((participante) => {
      if (participante.socketId) {
        this.rooms.transacciones.get(transaccionId).add(participante.socketId);

        const socket = this.socketManager.io.sockets.sockets.get(
          participante.socketId
        );
        if (socket) {
          socket.join(`transaccion-${transaccionId}`);
        }
      }
    });

    console.log(
      `💰 [ROOMS] Room de transacción ${transaccionId} creado con ${participantes.length} participantes`
    );
    this.logRoomStats();
  }

  /**
   * Agregar participante a room de transacción
   */
  agregarParticipanteTransaccion(transaccionId, socketId) {
    if (!this.rooms.transacciones.has(transaccionId)) {
      this.rooms.transacciones.set(transaccionId, new Set());
    }

    this.rooms.transacciones.get(transaccionId).add(socketId);

    const socket = this.socketManager.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(`transaccion-${transaccionId}`);
    }

    console.log(
      `💰 [ROOMS] Participante agregado a transacción ${transaccionId}`
    );
  }

  /**
   * Limpiar room de transacción
   */
  limpiarRoomTransaccion(transaccionId) {
    if (this.rooms.transacciones.has(transaccionId)) {
      const participantes = this.rooms.transacciones.get(transaccionId);

      // Hacer que todos salgan del room
      participantes.forEach((socketId) => {
        const socket = this.socketManager.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.leave(`transaccion-${transaccionId}`);
        }
      });

      this.rooms.transacciones.delete(transaccionId);
      console.log(`💰 [ROOMS] Room de transacción ${transaccionId} limpiado`);
    }
  }

  /**
   * Agregar administrador al dashboard
   */
  agregarAdmin(socketId) {
    this.rooms.adminDashboard.add(socketId);

    const socket = this.socketManager.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.join("admin-dashboard");
    }

    console.log(`👑 [ROOMS] Admin agregado al dashboard`);
    this.logRoomStats();
  }

  /**
   * Remover administrador del dashboard
   */
  removerAdmin(socketId) {
    this.rooms.adminDashboard.delete(socketId);

    const socket = this.socketManager.io.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave("admin-dashboard");
    }

    console.log(`👑 [ROOMS] Admin removido del dashboard`);
    this.logRoomStats();
  }

  /**
   * Limpiar socket de todos los rooms
   */
  limpiarSocket(socketId) {
    // Remover de cajeros disponibles
    this.rooms.cajerosDisponibles.delete(socketId);

    // Remover de cajeros ocupados
    this.rooms.cajerosOcupados.delete(socketId);

    // Remover de jugadores
    for (const [telegramId, sockets] of this.rooms.jugadores.entries()) {
      if (sockets.has(socketId)) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          this.rooms.jugadores.delete(telegramId);
        }
      }
    }

    // Remover de transacciones
    for (const [transaccionId, sockets] of this.rooms.transacciones.entries()) {
      if (sockets.has(socketId)) {
        sockets.delete(socketId);
        if (sockets.size === 0) {
          this.rooms.transacciones.delete(transaccionId);
        }
      }
    }

    // Remover de admin dashboard
    this.rooms.adminDashboard.delete(socketId);

    console.log(`🧹 [ROOMS] Socket ${socketId} limpiado de todos los rooms`);
  }

  /**
   * Obtener estadísticas de rooms
   */
  getStats() {
    return {
      cajerosDisponibles: this.rooms.cajerosDisponibles.size,
      cajerosOcupados: this.rooms.cajerosOcupados.size,
      jugadoresConectados: this.rooms.jugadores.size,
      transaccionesActivas: this.rooms.transacciones.size,
      adminsConectados: this.rooms.adminDashboard.size,
      totalRooms: this.rooms.jugadores.size + this.rooms.transacciones.size + 3, // +3 por los rooms fijos
    };
  }

  /**
   * Log de estadísticas de rooms
   */
  logRoomStats() {
    const stats = this.getStats();
    console.log(
      `📊 [ROOMS] Stats: Disponibles: ${stats.cajerosDisponibles}, Ocupados: ${stats.cajerosOcupados}, Jugadores: ${stats.jugadoresConectados}, Transacciones: ${stats.transaccionesActivas}, Admins: ${stats.adminsConectados}`
    );
  }

  /**
   * Obtener el socketId de un jugador
   * @param {string} telegramId - ID de Telegram del jugador
   * @returns {string|null} - socketId del jugador o null si no está conectado
   */
  obtenerSocketJugador(telegramId) {
    if (!this.rooms.jugadores.has(telegramId)) {
      console.log(
        `⚠️ [ROOMS] Jugador ${telegramId} no tiene sockets conectados`
      );
      return null;
    }

    const sockets = this.rooms.jugadores.get(telegramId);
    if (sockets.size === 0) {
      console.log(`⚠️ [ROOMS] Jugador ${telegramId} no tiene sockets activos`);
      return null;
    }

    // Verificar que el socket realmente exista en el servidor
    for (const socketId of sockets) {
      const socket = this.socketManager.io.sockets.sockets.get(socketId);
      if (socket) {
        console.log(
          `✅ [ROOMS] Socket VÁLIDO encontrado para jugador ${telegramId}: ${socketId}`
        );
        return socketId;
      } else {
        console.log(
          `⚠️ [ROOMS] Socket ${socketId} en lista pero NO EXISTE en servidor, limpiando...`
        );
        // Limpiar socket inválido
        sockets.delete(socketId);
      }
    }

    // Si llegamos aquí, no hay sockets válidos
    console.log(
      `❌ [ROOMS] No se encontraron sockets válidos para jugador ${telegramId}`
    );
    this.rooms.jugadores.delete(telegramId);
    return null;
  }

  /**
   * Verificar si un jugador está en un room específico
   * @param {string} telegramId - ID de Telegram del jugador
   * @param {string} roomName - Nombre del room
   * @returns {boolean} - true si el jugador está en el room
   */
  jugadorEnRoom(telegramId, roomName) {
    const socketId = this.obtenerSocketJugador(telegramId);
    if (!socketId) {
      return false;
    }

    const socket = this.socketManager.io.sockets.sockets.get(socketId);
    if (!socket) {
      console.log(`⚠️ [ROOMS] Socket ${socketId} no encontrado en servidor`);
      return false;
    }

    const enRoom = socket.rooms.has(roomName);
    console.log(
      `🔍 [ROOMS] Jugador ${telegramId} ${
        enRoom ? "ESTÁ" : "NO está"
      } en room ${roomName}`
    );
    return enRoom;
  }

  /**
   * Notificar a todos los cajeros disponibles
   */
  notificarCajerosDisponibles(evento, datos) {
    this.socketManager.io.to("cajeros-disponibles").emit(evento, datos);
    console.log(
      `📢 [ROOMS] Notificación enviada a ${this.rooms.cajerosDisponibles.size} cajeros disponibles`
    );
  }

  /**
   * Notificar a un jugador específico
   */
  notificarJugador(telegramId, evento, datos) {
    this.socketManager.io.to(`jugador-${telegramId}`).emit(evento, datos);
    console.log(`📢 [ROOMS] Notificación enviada a jugador ${telegramId}`);
  }

  /**
   * Notificar a participantes de una transacción
   */
  notificarTransaccion(transaccionId, evento, datos) {
    this.socketManager.io
      .to(`transaccion-${transaccionId}`)
      .emit(evento, datos);
    console.log(
      `📢 [ROOMS] Notificación enviada a transacción ${transaccionId}`
    );
  }

  /**
   * Notificar a administradores
   */
  notificarAdmins(evento, datos) {
    this.socketManager.io.to("admin-dashboard").emit(evento, datos);
    console.log(
      `📢 [ROOMS] Notificación enviada a ${this.rooms.adminDashboard.size} administradores`
    );
  }
}

module.exports = RoomsManager;
