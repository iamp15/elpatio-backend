/**
 * Manager para el estado de conexión de usuarios WebSocket
 * Proporciona información en tiempo real sobre usuarios conectados
 */

class ConnectionStateManager {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.connectionStates = {
      // Estados de cajeros
      cajeros: new Map(), // cajeroId -> { estado, timestamp, transaccionId?, socketId }

      // Estados de jugadores
      jugadores: new Map(), // telegramId -> { timestamp, socketId, ultimaActividad }

      // Estados de transacciones
      transacciones: new Map(), // transaccionId -> { estado, participantes, timestamp }

      // Estadísticas generales
      estadisticas: {
        totalConexiones: 0,
        cajerosDisponibles: 0,
        cajerosOcupados: 0,
        jugadoresConectados: 0,
        transaccionesActivas: 0,
        ultimaActualizacion: new Date().toISOString(),
      },
    };
  }

  /**
   * Agregar cajero al estado de conexión
   */
  agregarCajero(cajeroId, socketId, datosCajero) {
    this.connectionStates.cajeros.set(cajeroId, {
      id: cajeroId,
      nombre: datosCajero.nombre || "Cajero",
      email: datosCajero.email,
      estado: "disponible",
      timestamp: new Date().toISOString(),
      socketId: socketId,
      transaccionId: null,
      ultimaActividad: new Date().toISOString(),
    });

    this.actualizarEstadisticas();
    this.notificarCambioEstado();
    console.log(
      `🏦 [ESTADO] Cajero ${datosCajero.nombre} agregado al estado de conexión`
    );
  }

  /**
   * Actualizar estado de cajero
   */
  actualizarEstadoCajero(cajeroId, nuevoEstado, transaccionId = null) {
    const cajero = this.connectionStates.cajeros.get(cajeroId);
    if (!cajero) {
      console.log(
        `⚠️ [ESTADO] Cajero ${cajeroId} no encontrado para actualizar estado`
      );
      return;
    }

    cajero.estado = nuevoEstado;
    cajero.timestamp = new Date().toISOString();
    cajero.ultimaActividad = new Date().toISOString();
    cajero.transaccionId = transaccionId;

    this.actualizarEstadisticas();
    this.notificarCambioEstado();
    console.log(
      `🏦 [ESTADO] Cajero ${cajero.nombre} cambió a estado: ${nuevoEstado}`
    );
  }

  /**
   * Agregar jugador al estado de conexión
   */
  agregarJugador(telegramId, socketId, datosJugador) {
    this.connectionStates.jugadores.set(telegramId, {
      id: telegramId,
      nombre: datosJugador.nombre || "Jugador",
      nickname: datosJugador.nickname,
      timestamp: new Date().toISOString(),
      socketId: socketId,
      ultimaActividad: new Date().toISOString(),
    });

    this.actualizarEstadisticas();
    this.notificarCambioEstado();
    console.log(
      `👤 [ESTADO] Jugador ${datosJugador.nombre} agregado al estado de conexión`
    );
  }

  /**
   * Actualizar actividad de jugador
   */
  actualizarActividadJugador(telegramId) {
    const jugador = this.connectionStates.jugadores.get(telegramId);
    if (jugador) {
      jugador.ultimaActividad = new Date().toISOString();
    }
  }

  /**
   * Agregar transacción al estado
   */
  agregarTransaccion(transaccionId, datosTransaccion) {
    this.connectionStates.transacciones.set(transaccionId, {
      id: transaccionId,
      estado: "activa",
      monto: datosTransaccion.monto,
      jugadorId: datosTransaccion.jugadorId,
      cajeroId: datosTransaccion.cajeroId,
      participantes: [],
      timestamp: new Date().toISOString(),
      ultimaActividad: new Date().toISOString(),
    });

    this.actualizarEstadisticas();
    this.notificarCambioEstado();
    console.log(`💰 [ESTADO] Transacción ${transaccionId} agregada al estado`);
  }

  /**
   * Actualizar estado de transacción
   */
  actualizarEstadoTransaccion(transaccionId, nuevoEstado) {
    const transaccion = this.connectionStates.transacciones.get(transaccionId);
    if (!transaccion) {
      console.log(`⚠️ [ESTADO] Transacción ${transaccionId} no encontrada`);
      return;
    }

    transaccion.estado = nuevoEstado;
    transaccion.ultimaActividad = new Date().toISOString();

    this.actualizarEstadisticas();
    this.notificarCambioEstado();
    console.log(
      `💰 [ESTADO] Transacción ${transaccionId} cambió a estado: ${nuevoEstado}`
    );
  }

  /**
   * Remover usuario del estado de conexión
   */
  removerUsuario(socketId) {
    // Buscar y remover cajero
    for (const [cajeroId, cajero] of this.connectionStates.cajeros.entries()) {
      if (cajero.socketId === socketId) {
        this.connectionStates.cajeros.delete(cajeroId);
        console.log(`🏦 [ESTADO] Cajero ${cajero.nombre} removido del estado`);
        break;
      }
    }

    // Buscar y remover jugador
    for (const [
      telegramId,
      jugador,
    ] of this.connectionStates.jugadores.entries()) {
      if (jugador.socketId === socketId) {
        this.connectionStates.jugadores.delete(telegramId);
        console.log(
          `👤 [ESTADO] Jugador ${jugador.nombre} removido del estado`
        );
        break;
      }
    }

    this.actualizarEstadisticas();
    this.notificarCambioEstado();
  }

  /**
   * Remover cajero por ID (útil cuando el cajero cierra sesión)
   */
  removerCajeroPorId(cajeroId) {
    const cajero = this.connectionStates.cajeros.get(cajeroId);
    if (cajero) {
      this.connectionStates.cajeros.delete(cajeroId);
      console.log(`🏦 [ESTADO] Cajero ${cajero.nombre} (ID: ${cajeroId}) removido del estado`);
      this.actualizarEstadisticas();
      this.notificarCambioEstado();
      return true;
    }
    return false;
  }

  /**
   * Actualizar estadísticas generales
   */
  actualizarEstadisticas() {
    const cajeros = Array.from(this.connectionStates.cajeros.values());
    const jugadores = Array.from(this.connectionStates.jugadores.values());
    const transacciones = Array.from(
      this.connectionStates.transacciones.values()
    );

    const cajerosDisponibles = cajeros.filter((c) => c.estado === "disponible").length;
    const cajerosOcupados = cajeros.filter((c) => c.estado === "ocupado").length;

    this.connectionStates.estadisticas = {
      totalConexiones: cajeros.length + jugadores.length,
      cajerosDisponibles: cajerosDisponibles,
      cajerosOcupados: cajerosOcupados,
      cajerosConectados: cajerosDisponibles + cajerosOcupados, // Incluir para compatibilidad
      jugadoresConectados: jugadores.length,
      transaccionesActivas: transacciones.filter((t) => t.estado === "activa")
        .length,
      ultimaActualizacion: new Date().toISOString(),
    };
  }

  /**
   * Obtener estado completo del sistema
   */
  getEstadoCompleto() {
    this.actualizarEstadisticas();

    return {
      estadisticas: this.connectionStates.estadisticas,
      cajeros: Array.from(this.connectionStates.cajeros.values()),
      jugadores: Array.from(this.connectionStates.jugadores.values()),
      transacciones: Array.from(this.connectionStates.transacciones.values()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Obtener solo estadísticas
   */
  getEstadisticas() {
    this.actualizarEstadisticas();
    return this.connectionStates.estadisticas;
  }

  /**
   * Obtener estado de cajeros
   */
  getEstadoCajeros() {
    return Array.from(this.connectionStates.cajeros.values());
  }

  /**
   * Obtener estado de jugadores
   */
  getEstadoJugadores() {
    return Array.from(this.connectionStates.jugadores.values());
  }

  /**
   * Obtener estado de transacciones
   */
  getEstadoTransacciones() {
    return Array.from(this.connectionStates.transacciones.values());
  }

  /**
   * Notificar cambio de estado a administradores
   */
  notificarCambioEstado() {
    const estado = this.getEstadoCompleto();
    this.socketManager.io
      .to("admin-dashboard")
      .emit("estado-actualizado", estado);
  }

  /**
   * Obtener resumen para logging
   */
  getResumen() {
    const stats = this.getEstadisticas();
    return `📊 [ESTADO] Total: ${stats.totalConexiones}, Cajeros: ${stats.cajerosDisponibles}/${stats.cajerosOcupados}, Jugadores: ${stats.jugadoresConectados}, Transacciones: ${stats.transaccionesActivas}`;
  }

  /**
   * Limpiar transacciones completadas (más de 1 hora)
   */
  limpiarTransaccionesAntiguas() {
    const unaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);

    for (const [
      transaccionId,
      transaccion,
    ] of this.connectionStates.transacciones.entries()) {
      const fechaTransaccion = new Date(transaccion.timestamp);
      if (fechaTransaccion < unaHoraAtras && transaccion.estado !== "activa") {
        this.connectionStates.transacciones.delete(transaccionId);
        console.log(
          `🧹 [ESTADO] Transacción antigua ${transaccionId} removida`
        );
      }
    }

    this.actualizarEstadisticas();
  }
}

module.exports = ConnectionStateManager;

