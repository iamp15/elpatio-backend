/**
 * Módulo básico de gestión de WebSockets
 */

const DepositoWebSocketController = require("./depositoController");
const RoomsManager = require("./roomsManager");
const ConnectionStateManager = require("./connectionStateManager");

class SocketManager {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // telegramId -> socketId
    this.connectedCajeros = new Map(); // cajeroId -> socketId
    this.depositoController = null; // Controlador de depósitos
    this.roomsManager = null; // Manager de rooms
    this.connectionStateManager = null; // Manager de estado de conexión
  }

  /**
   * Inicializar Socket.IO
   */
  initialize(server) {
    const { Server } = require("socket.io");

    this.io = new Server(server, {
      cors: {
        origin:
          process.env.NODE_ENV === "production"
            ? [
                "https://elpatio-miniapps.vercel.app",
                "https://elpatio-backend-production.up.railway.app",
                "https://telegram.org", // Para Telegram Web Apps
                "https://web.telegram.org", // Para Telegram Web Apps
              ]
            : "*", // Permitir cualquier origen en desarrollo
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
      allowEIO3: true, // Compatibilidad con versiones anteriores
      pingTimeout: 60000, // 60 segundos
      pingInterval: 25000, // 25 segundos
      upgradeTimeout: 10000, // 10 segundos
    });

    // Inicializar controlador de depósitos
    this.depositoController = new DepositoWebSocketController(this);

    // Inicializar manager de rooms
    this.roomsManager = new RoomsManager(this);

    // Inicializar manager de estado de conexión
    this.connectionStateManager = new ConnectionStateManager(this);

    this.setupEventHandlers();
    console.log("🔌 WebSocket server inicializado");
  }

  /**
   * Configurar manejadores de eventos básicos
   */
  setupEventHandlers() {
    this.io.on("connection", (socket) => {
      console.log(`🔗 Cliente conectado: ${socket.id}`);
      console.log(`📡 Transporte usado: ${socket.conn.transport.name}`);
      console.log(`🌐 Origen: ${socket.handshake.headers.origin || "N/A"}`);

      // Autenticación de jugador (Telegram)
      socket.on("auth-jugador", async (data) => {
        console.log("🔐 [AUTH] Evento auth-jugador recibido:", data);
        try {
          const result = await this.authenticateJugador(socket, data);
          console.log("🔐 [AUTH] Resultado autenticación jugador:", result);
          socket.emit("auth-result", result);
        } catch (error) {
          console.error("❌ Error autenticando jugador:", error);
          socket.emit("auth-result", {
            success: false,
            message: "Error interno del servidor",
          });
        }
      });

      // Autenticación de cajero (JWT)
      socket.on("auth-cajero", async (data) => {
        console.log("🔐 [AUTH] Evento auth-cajero recibido:", data);
        try {
          const result = await this.authenticateCajero(socket, data);
          console.log("🔐 [AUTH] Resultado autenticación cajero:", result);
          socket.emit("auth-result", result);
        } catch (error) {
          console.error("❌ Error autenticando cajero:", error);
          socket.emit("auth-result", {
            success: false,
            message: "Error interno del servidor",
          });
        }
      });

      // Eventos de depósitos
      socket.on("solicitar-deposito", (data) => {
        this.handleSolicitarDeposito(socket, data);
      });

      socket.on("atender-deposito", (data) => {
        this.handleAtenderDeposito(socket, data);
      });

      socket.on("confirmar-deposito", (data) => {
        this.handleConfirmarDeposito(socket, data);
      });

      socket.on("rechazar-deposito", (data) => {
        this.handleRechazarDeposito(socket, data);
      });

      // ===== EVENTOS DE DEPÓSITOS =====

      // Solicitar depósito (jugador)
      socket.on("solicitar-deposito", async (data) => {
        try {
          await this.depositoController.solicitarDeposito(socket, data);
        } catch (error) {
          console.error("❌ Error en solicitar-deposito:", error);
          socket.emit("error", { message: "Error interno del servidor" });
        }
      });

      // Aceptar solicitud (cajero)
      socket.on("aceptar-solicitud", async (data) => {
        try {
          await this.depositoController.aceptarSolicitud(socket, data);
        } catch (error) {
          console.error("❌ Error en aceptar-solicitud:", error);
          socket.emit("error", { message: "Error interno del servidor" });
        }
      });

      // Confirmar pago (jugador)
      socket.on("confirmar-pago-jugador", async (data) => {
        try {
          await this.depositoController.confirmarPagoJugador(socket, data);
        } catch (error) {
          console.error("❌ Error en confirmar-pago-jugador:", error);
          socket.emit("error", { message: "Error interno del servidor" });
        }
      });

      // Verificar pago (cajero)
      socket.on("verificar-pago-cajero", async (data) => {
        try {
          await this.depositoController.verificarPagoCajero(socket, data);
        } catch (error) {
          console.error("❌ Error en verificar-pago-cajero:", error);
          socket.emit("error", { message: "Error interno del servidor" });
        }
      });

      // ===== EVENTOS DE ROOMS =====

      // Cambiar estado de cajero (disponible/ocupado)
      socket.on("cambiar-estado-cajero", (data) => {
        this.handleCambiarEstadoCajero(socket, data);
      });

      // Unirse a room de transacción
      socket.on("unirse-transaccion", (data) => {
        this.handleUnirseTransaccion(socket, data);
      });

      // Salir de room de transacción
      socket.on("salir-transaccion", (data) => {
        this.handleSalirTransaccion(socket, data);
      });

      // Obtener estadísticas de rooms
      socket.on("obtener-stats-rooms", () => {
        this.handleObtenerStatsRooms(socket);
      });

      // ===== EVENTOS DE PRUEBA DE NOTIFICACIONES =====

      // Prueba de notificación a cajeros disponibles
      socket.on("test-notification-cajeros", (data) => {
        this.handleTestNotificationCajeros(socket, data);
      });

      // Prueba de notificación a jugador específico
      socket.on("test-notification-jugador", (data) => {
        this.handleTestNotificationJugador(socket, data);
      });

      // Prueba de notificación a transacción
      socket.on("test-notification-transaccion", (data) => {
        this.handleTestNotificationTransaccion(socket, data);
      });

      // ===== EVENTOS DE DASHBOARD DE ESTADO =====

      // Obtener estado completo del sistema
      socket.on("obtener-estado-completo", () => {
        this.handleObtenerEstadoCompleto(socket);
      });

      // Obtener solo estadísticas
      socket.on("obtener-estadisticas", () => {
        this.handleObtenerEstadisticas(socket);
      });

      // Obtener estado de cajeros
      socket.on("obtener-estado-cajeros", () => {
        this.handleObtenerEstadoCajeros(socket);
      });

      // Obtener estado de jugadores
      socket.on("obtener-estado-jugadores", () => {
        this.handleObtenerEstadoJugadores(socket);
      });

      // Obtener estado de transacciones
      socket.on("obtener-estado-transacciones", () => {
        this.handleObtenerEstadoTransacciones(socket);
      });

      // Unirse al dashboard de administración
      socket.on("unirse-dashboard", () => {
        this.handleUnirseDashboard(socket);
      });

      // Manejar desconexión
      socket.on("disconnect", (reason) => {
        console.log(`🔌 Cliente desconectado: ${socket.id}, razón: ${reason}`);
        this.handleDisconnect(socket);
      });

      // Manejar errores
      socket.on("error", (error) => {
        console.error("❌ Error en socket:", error);
      });

      // Manejar eventos de transporte
      socket.conn.on("upgrade", () => {
        console.log(
          `⬆️ Socket ${socket.id} actualizado a: ${socket.conn.transport.name}`
        );
      });

      socket.conn.on("upgradeError", (error) => {
        console.error(
          `❌ Error de actualización en socket ${socket.id}:`,
          error
        );
      });
    });

    // Manejar errores de conexión
    this.io.engine.on("connection_error", (err) => {
      console.error("❌ Error de conexión del motor:", err);
    });
  }

  /**
   * Manejar desconexión
   */
  handleDisconnect(socket) {
    // Limpiar rooms del socket desconectado
    this.roomsManager.limpiarSocket(socket.id);

    // Limpiar estado de conexión
    this.connectionStateManager.removerUsuario(socket.id);

    // Limpiar referencias del usuario desconectado
    for (let [telegramId, socketId] of this.connectedUsers.entries()) {
      if (socketId === socket.id) {
        this.connectedUsers.delete(telegramId);
        console.log(`👤 Jugador desconectado: ${telegramId}`);
        break;
      }
    }

    for (let [cajeroId, socketId] of this.connectedCajeros.entries()) {
      if (socketId === socket.id) {
        this.connectedCajeros.delete(cajeroId);
        console.log(`🏦 Cajero desconectado: ${cajeroId}`);
        break;
      }
    }
  }

  /**
   * Obtener estadísticas básicas
   */
  getStats() {
    return {
      jugadoresConectados: this.connectedUsers.size,
      cajerosConectados: this.connectedCajeros.size,
      totalConexiones: this.io.engine.clientsCount,
    };
  }

  /**
   * Autenticar jugador usando datos de Telegram
   */
  async authenticateJugador(socket, data) {
    const { telegramId, initData } = data;

    if (!telegramId || !initData) {
      return {
        success: false,
        message: "Datos de autenticación incompletos",
      };
    }

    try {
      // Validar datos de Telegram (simplificado por ahora)
      // En producción, deberías validar la firma de initData

      // Buscar jugador en la base de datos
      const Jugador = require("../models/Jugador");
      const jugador = await Jugador.findOne({ telegramId });

      if (!jugador) {
        return {
          success: false,
          message: "Jugador no encontrado",
        };
      }

      // Registrar conexión
      this.connectedUsers.set(telegramId, socket.id);
      socket.telegramId = telegramId;
      socket.jugadorId = jugador._id; // Agregar jugadorId al socket
      socket.userType = "jugador";

      // Agregar jugador a su room personal
      this.roomsManager.agregarJugador(telegramId, socket.id);

      // Agregar jugador al estado de conexión
      this.connectionStateManager.agregarJugador(telegramId, socket.id, {
        nombre: jugador.nickname || jugador.firstName || "Usuario",
        nickname: jugador.nickname,
      });

      console.log(
        `👤 Jugador autenticado: ${
          jugador.nickname || jugador.firstName
        } (${telegramId})`
      );

      return {
        success: true,
        message: "Autenticación exitosa",
        user: {
          id: jugador._id,
          telegramId: jugador.telegramId,
          nombre: jugador.nickname || jugador.firstName || "Usuario",
          nickname: jugador.nickname,
          firstName: jugador.firstName,
          username: jugador.username,
        },
      };
    } catch (error) {
      console.error("Error autenticando jugador:", error);
      return {
        success: false,
        message: "Error validando datos de Telegram",
      };
    }
  }

  /**
   * Autenticar cajero usando JWT
   */
  async authenticateCajero(socket, data) {
    const { token } = data;

    if (!token) {
      return {
        success: false,
        message: "Token JWT requerido",
      };
    }

    try {
      // Verificar JWT
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.rol !== "cajero") {
        return {
          success: false,
          message: "Token no válido para cajero",
        };
      }

      // Buscar cajero en la base de datos
      const Cajero = require("../models/Cajero");
      const cajero = await Cajero.findById(decoded.id);

      if (!cajero) {
        return {
          success: false,
          message: "Cajero no encontrado",
        };
      }

      // Registrar conexión
      this.connectedCajeros.set(decoded.id, socket.id);
      socket.cajeroId = decoded.id;
      socket.userType = "cajero";

      // Agregar cajero a room de disponibles por defecto
      this.roomsManager.agregarCajeroDisponible(decoded.id, socket.id);

      // Agregar cajero al estado de conexión
      this.connectionStateManager.agregarCajero(decoded.id, socket.id, {
        nombre: cajero.nombreCompleto,
        email: cajero.email,
      });

      console.log(
        `🏦 Cajero autenticado: ${cajero.nombreCompleto} (${decoded.id})`
      );

      return {
        success: true,
        message: "Autenticación exitosa",
        user: {
          id: cajero._id,
          nombre: cajero.nombreCompleto,
          email: cajero.email,
        },
      };
    } catch (error) {
      console.error("Error autenticando cajero:", error);
      return {
        success: false,
        message: "Token JWT inválido",
      };
    }
  }

  /**
   * Manejar solicitud de depósito
   */
  handleSolicitarDeposito(socket, data) {
    if (socket.userType !== "jugador") {
      socket.emit("error", {
        message: "Solo jugadores pueden solicitar depósitos",
      });
      return;
    }

    console.log(
      `💰 Solicitud de depósito de jugador ${socket.telegramId}:`,
      data
    );

    // Notificar a todos los cajeros conectados
    this.connectedCajeros.forEach((cajeroSocketId, cajeroId) => {
      const cajeroSocket = this.io.sockets.sockets.get(cajeroSocketId);
      if (cajeroSocket) {
        cajeroSocket.emit("nueva-solicitud-deposito", {
          jugadorId: socket.telegramId,
          socketId: socket.id,
          ...data,
        });
      }
    });

    socket.emit("solicitud-enviada", {
      message: "Solicitud enviada a cajeros",
    });
  }

  /**
   * Manejar atención de depósito por cajero
   */
  handleAtenderDeposito(socket, data) {
    if (socket.userType !== "cajero") {
      socket.emit("error", {
        message: "Solo cajeros pueden atender depósitos",
      });
      return;
    }

    const { jugadorSocketId } = data;
    const jugadorSocket = this.io.sockets.sockets.get(jugadorSocketId);

    if (jugadorSocket) {
      jugadorSocket.emit("deposito-atendido", {
        cajeroId: socket.cajeroId,
        message: "Tu solicitud está siendo atendida",
      });
    }

    console.log(`🏦 Cajero ${socket.cajeroId} atendiendo depósito de jugador`);
  }

  /**
   * Manejar confirmación de depósito
   */
  handleConfirmarDeposito(socket, data) {
    if (socket.userType !== "cajero") {
      socket.emit("error", {
        message: "Solo cajeros pueden confirmar depósitos",
      });
      return;
    }

    const { jugadorSocketId, transaccionId } = data;
    const jugadorSocket = this.io.sockets.sockets.get(jugadorSocketId);

    if (jugadorSocket) {
      jugadorSocket.emit("deposito-confirmado", {
        transaccionId,
        message: "Depósito confirmado exitosamente",
      });
    }

    console.log(`✅ Depósito confirmado por cajero ${socket.cajeroId}`);
  }

  /**
   * Manejar rechazo de depósito
   */
  handleRechazarDeposito(socket, data) {
    if (socket.userType !== "cajero") {
      socket.emit("error", {
        message: "Solo cajeros pueden rechazar depósitos",
      });
      return;
    }

    const { jugadorSocketId, motivo } = data;
    const jugadorSocket = this.io.sockets.sockets.get(jugadorSocketId);

    if (jugadorSocket) {
      jugadorSocket.emit("deposito-rechazado", {
        motivo,
        message: "Depósito rechazado",
      });
    }

    console.log(
      `❌ Depósito rechazado por cajero ${socket.cajeroId}: ${motivo}`
    );
  }

  /**
   * Manejar cambio de estado de cajero
   */
  handleCambiarEstadoCajero(socket, data) {
    if (socket.userType !== "cajero") {
      socket.emit("error", {
        message: "Solo cajeros pueden cambiar su estado",
      });
      return;
    }

    const { estado } = data; // "disponible" o "ocupado"

    if (estado === "disponible") {
      this.roomsManager.agregarCajeroDisponible(socket.cajeroId, socket.id);
      socket.emit("estado-cambiado", {
        estado: "disponible",
        message: "Estado cambiado a disponible",
      });
    } else if (estado === "ocupado") {
      this.roomsManager.moverCajeroAOcupado(socket.cajeroId, socket.id);
      socket.emit("estado-cambiado", {
        estado: "ocupado",
        message: "Estado cambiado a ocupado",
      });
    } else {
      socket.emit("error", {
        message: "Estado inválido. Use 'disponible' o 'ocupado'",
      });
    }
  }

  /**
   * Manejar unirse a room de transacción
   */
  handleUnirseTransaccion(socket, data) {
    const { transaccionId } = data;

    if (!transaccionId) {
      socket.emit("error", {
        message: "ID de transacción requerido",
      });
      return;
    }

    this.roomsManager.agregarParticipanteTransaccion(transaccionId, socket.id);
    socket.emit("unido-transaccion", {
      transaccionId,
      message: `Unido a transacción ${transaccionId}`,
    });
  }

  /**
   * Manejar salir de room de transacción
   */
  handleSalirTransaccion(socket, data) {
    const { transaccionId } = data;

    if (!transaccionId) {
      socket.emit("error", {
        message: "ID de transacción requerido",
      });
      return;
    }

    const socketObj = this.io.sockets.sockets.get(socket.id);
    if (socketObj) {
      socketObj.leave(`transaccion-${transaccionId}`);
    }

    socket.emit("salido-transaccion", {
      transaccionId,
      message: `Salido de transacción ${transaccionId}`,
    });
  }

  /**
   * Manejar obtener estadísticas de rooms
   */
  handleObtenerStatsRooms(socket) {
    const stats = this.roomsManager.getStats();
    socket.emit("stats-rooms", stats);
  }

  /**
   * Manejar prueba de notificación a cajeros disponibles
   */
  handleTestNotificationCajeros(socket, data) {
    if (!socket.userType) {
      socket.emit("error", {
        message: "Debe estar autenticado para enviar notificaciones de prueba",
      });
      return;
    }

    const notificacion = {
      tipo: "prueba",
      mensaje: data.message || "Notificación de prueba a cajeros disponibles",
      timestamp: data.timestamp || new Date().toISOString(),
      enviadoPor:
        socket.userType === "cajero" ? socket.cajeroId : socket.telegramId,
    };

    // Enviar a todos los cajeros disponibles
    this.roomsManager.notificarCajerosDisponibles(
      "notificacion-prueba",
      notificacion
    );

    // Confirmar al emisor
    socket.emit("notificacion-enviada", {
      tipo: "cajeros-disponibles",
      destinatarios: this.roomsManager.rooms.cajerosDisponibles.size,
      mensaje: "Notificación enviada a cajeros disponibles",
    });

    console.log(
      `🧪 [TEST] Notificación de prueba enviada a ${this.roomsManager.rooms.cajerosDisponibles.size} cajeros disponibles`
    );
  }

  /**
   * Manejar prueba de notificación a jugador específico
   */
  handleTestNotificationJugador(socket, data) {
    if (!socket.userType) {
      socket.emit("error", {
        message: "Debe estar autenticado para enviar notificaciones de prueba",
      });
      return;
    }

    const { telegramId } = data;
    if (!telegramId) {
      socket.emit("error", {
        message: "telegramId requerido para notificar jugador específico",
      });
      return;
    }

    const notificacion = {
      tipo: "prueba",
      mensaje: data.message || "Notificación de prueba a jugador específico",
      timestamp: data.timestamp || new Date().toISOString(),
      enviadoPor:
        socket.userType === "cajero" ? socket.cajeroId : socket.telegramId,
    };

    // Enviar al jugador específico
    this.roomsManager.notificarJugador(
      telegramId,
      "notificacion-prueba",
      notificacion
    );

    // Confirmar al emisor
    socket.emit("notificacion-enviada", {
      tipo: "jugador-especifico",
      destinatario: telegramId,
      mensaje: `Notificación enviada a jugador ${telegramId}`,
    });

    console.log(
      `🧪 [TEST] Notificación de prueba enviada a jugador ${telegramId}`
    );
  }

  /**
   * Manejar prueba de notificación a transacción
   */
  handleTestNotificationTransaccion(socket, data) {
    if (!socket.userType) {
      socket.emit("error", {
        message: "Debe estar autenticado para enviar notificaciones de prueba",
      });
      return;
    }

    const { transaccionId } = data;
    if (!transaccionId) {
      socket.emit("error", {
        message: "transaccionId requerido para notificar transacción",
      });
      return;
    }

    const notificacion = {
      tipo: "prueba",
      mensaje: data.message || "Notificación de prueba a transacción",
      timestamp: data.timestamp || new Date().toISOString(),
      transaccionId: transaccionId,
      enviadoPor:
        socket.userType === "cajero" ? socket.cajeroId : socket.telegramId,
    };

    // Enviar a participantes de la transacción
    this.roomsManager.notificarTransaccion(
      transaccionId,
      "notificacion-prueba",
      notificacion
    );

    // Confirmar al emisor
    const participantes =
      this.roomsManager.rooms.transacciones.get(transaccionId);
    socket.emit("notificacion-enviada", {
      tipo: "transaccion",
      transaccionId: transaccionId,
      destinatarios: participantes ? participantes.size : 0,
      mensaje: `Notificación enviada a transacción ${transaccionId}`,
    });

    console.log(
      `🧪 [TEST] Notificación de prueba enviada a transacción ${transaccionId}`
    );
  }

  /**
   * Manejar obtener estado completo del sistema
   */
  handleObtenerEstadoCompleto(socket) {
    const estado = this.connectionStateManager.getEstadoCompleto();
    socket.emit("estado-completo", estado);
    console.log(`📊 [DASHBOARD] Estado completo enviado a ${socket.id}`);
  }

  /**
   * Manejar obtener solo estadísticas
   */
  handleObtenerEstadisticas(socket) {
    const estadisticas = this.connectionStateManager.getEstadisticas();
    socket.emit("estadisticas", estadisticas);
    console.log(`📊 [DASHBOARD] Estadísticas enviadas a ${socket.id}`);
  }

  /**
   * Manejar obtener estado de cajeros
   */
  handleObtenerEstadoCajeros(socket) {
    const cajeros = this.connectionStateManager.getEstadoCajeros();
    socket.emit("estado-cajeros", cajeros);
    console.log(`🏦 [DASHBOARD] Estado de cajeros enviado a ${socket.id}`);
  }

  /**
   * Manejar obtener estado de jugadores
   */
  handleObtenerEstadoJugadores(socket) {
    const jugadores = this.connectionStateManager.getEstadoJugadores();
    socket.emit("estado-jugadores", jugadores);
    console.log(`👤 [DASHBOARD] Estado de jugadores enviado a ${socket.id}`);
  }

  /**
   * Manejar obtener estado de transacciones
   */
  handleObtenerEstadoTransacciones(socket) {
    const transacciones = this.connectionStateManager.getEstadoTransacciones();
    socket.emit("estado-transacciones", transacciones);
    console.log(
      `💰 [DASHBOARD] Estado de transacciones enviado a ${socket.id}`
    );
  }

  /**
   * Manejar unirse al dashboard de administración
   */
  handleUnirseDashboard(socket) {
    // Verificar si el usuario tiene permisos de administración
    if (socket.userType !== "cajero" && socket.userType !== "admin") {
      socket.emit("error", {
        message: "Solo cajeros y administradores pueden acceder al dashboard",
      });
      return;
    }

    // Unirse al room de administración
    this.roomsManager.agregarAdmin(socket.id);

    // Enviar estado actual
    const estado = this.connectionStateManager.getEstadoCompleto();
    socket.emit("dashboard-conectado", {
      message: "Conectado al dashboard de administración",
      estado: estado,
    });

    console.log(
      `👑 [DASHBOARD] Usuario ${socket.userType} se unió al dashboard`
    );
  }
}

// Crear instancia única
const socketManager = new SocketManager();

module.exports = socketManager;
