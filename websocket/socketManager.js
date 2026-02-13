/**
 * Módulo básico de gestión de WebSockets
 * Refactorizado: Handlers extraídos a módulos separados
 */

const DepositoWebSocketController = require("./depositos/depositoController");
const RoomsManager = require("./roomsManager");
const ConnectionStateManager = require("./connectionStateManager");
const ConnectionRecoveryManager = require("./connectionRecoveryManager");
const TransactionTimeoutManager = require("./transactionTimeoutManager");

// Importar handlers
const {
  authenticateJugador,
  authenticateCajero,
  authenticateBot,
} = require("./handlers/authHandlers");
const {
  handleCambiarEstadoCajero,
  handleUnirseTransaccion,
  handleSalirTransaccion,
  handleObtenerStatsRooms,
  handleDiagnosticarRoomsTransacciones,
  handleLimpiarRoomsHuerfanos,
  handleUnirseRoomTransaccion,
} = require("./handlers/roomHandlers");
const {
  handleObtenerEstadoCompleto,
  handleObtenerEstadisticas,
  handleObtenerEstadoCajeros,
  handleObtenerEstadoJugadores,
  handleObtenerEstadoTransacciones,
  handleUnirseDashboard,
} = require("./handlers/dashboardHandlers");
const {
  handleTestNotificationCajeros,
  handleTestNotificationJugador,
  handleTestNotificationTransaccion,
} = require("./handlers/testHandlers");
const {
  handleSolicitarDeposito,
  handleAtenderDeposito,
  handleConfirmarDeposito,
  handleRechazarDeposito,
} = require("./handlers/legacyHandlers");

class SocketManager {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // telegramId -> socketId
    this.connectedCajeros = new Map(); // cajeroId -> socketId
    this.connectedBots = new Map(); // botId -> socketId
    this.connectedPlayers = new Map(); // telegramId -> socketId (solo jugadores en app de depósitos)
    this.depositoController = null; // Controlador de depósitos
    this.roomsManager = null; // Manager de rooms
    this.connectionStateManager = null; // Manager de estado de conexión
    this.connectionRecoveryManager = null; // Manager de recuperación de conexiones
    this.transactionTimeoutManager = null; // Manager de timeouts de transacciones
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
                "https://elpatio-app-cajeros.vercel.app", // App de cajeros en Vercel
                "https://elpatio-backend.fly.dev",
                "https://telegram.org", // Para Telegram Web Apps
                "https://web.telegram.org", // Para Telegram Web Apps
              ]
            : "*", // Permitir cualquier origen en desarrollo
        methods: ["GET", "POST"],
        credentials: true,
      },
      transports: ["websocket", "polling"],
      allowEIO3: true, // Compatibilidad con versiones anteriores
      pingTimeout: 120000, // 2 minutos
      pingInterval: 30000, // 30 segundos
      upgradeTimeout: 15000, // 15 segundos
    });

    // Inicializar manager de rooms PRIMERO
    this.roomsManager = new RoomsManager(this);

    // Inicializar manager de estado de conexión
    this.connectionStateManager = new ConnectionStateManager(this);

    // Inicializar manager de recuperación de conexiones
    this.connectionRecoveryManager = new ConnectionRecoveryManager(this);

    // Inicializar manager de timeouts de transacciones
    this.transactionTimeoutManager = new TransactionTimeoutManager(this);
    // Iniciar verificación periódica (async, no esperamos)
    this.transactionTimeoutManager.start().catch((error) => {
      console.error("❌ [SOCKET] Error iniciando TransactionTimeoutManager:", error);
    });

    // Inicializar controlador de depósitos DESPUÉS (necesita roomsManager)
    this.depositoController = new DepositoWebSocketController(this);

    this.setupEventHandlers();
    console.log("🔌 WebSocket server inicializado");
    console.log("✅ Sistema de recuperación de conexiones activado");
    console.log("✅ Sistema de auto-cancelación de transacciones activado");
  }

  /**
   * Obtener contexto para pasar a handlers
   */
  getContext() {
    return {
      socketManager: this,
      io: this.io,
      roomsManager: this.roomsManager,
      connectionStateManager: this.connectionStateManager,
      connectionRecoveryManager: this.connectionRecoveryManager,
      depositoController: this.depositoController,
    };
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
          const result = await authenticateJugador(this.getContext(), socket, data);
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
          const result = await authenticateCajero(this.getContext(), socket, data);
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

      // Autenticación de bot (JWT)
      socket.on("auth-bot", async (data) => {
        console.log("🔐 [AUTH] Evento auth-bot recibido:", data);
        try {
          const result = await authenticateBot(this.getContext(), socket, data);
          console.log("🔐 [AUTH] Resultado autenticación bot:", result);
          socket.emit("auth-result", result);
        } catch (error) {
          console.error("❌ Error autenticando bot:", error);
          socket.emit("auth-result", {
            success: false,
            message: "Error interno del servidor",
          });
        }
      });

      // Eventos de depósitos (legacy - compatibilidad)
      socket.on("atender-deposito", (data) => {
        handleAtenderDeposito(this.getContext(), socket, data);
      });

      socket.on("confirmar-deposito", (data) => {
        handleConfirmarDeposito(this.getContext(), socket, data);
      });

      socket.on("rechazar-deposito", (data) => {
        handleRechazarDeposito(this.getContext(), socket, data);
      });

      // ===== EVENTOS DE DEPÓSITOS =====

      // Solicitar depósito (jugador) - Evento oficial (sobrescribe legacy si existe)
      socket.on("solicitar-deposito", async (data) => {
        try {
          await this.depositoController.solicitarDeposito(socket, data);
        } catch (error) {
          console.error("❌ Error en solicitar-deposito:", error);
          socket.emit("error", { message: "Error interno del servidor" });
        }
      });

      // Solicitar retiro (jugador)
      socket.on("solicitar-retiro", async (data) => {
        try {
          await this.depositoController.solicitarRetiro(socket, data);
        } catch (error) {
          console.error("❌ Error en solicitar-retiro:", error);
          socket.emit("error", { message: "Error interno del servidor" });
        }
      });

      // NOTA: El handler de 'aceptar-solicitud' está registrado más abajo
      // con removeAllListeners para evitar duplicación (ver línea ~280)

      // Confirmar pago (jugador)
      socket.on("confirmar-pago-jugador", async (data) => {
        try {
          await this.depositoController.confirmarPagoJugador(socket, data);
        } catch (error) {
          console.error("❌ Error en confirmar-pago-jugador:", error);
          socket.emit("error", { message: "Error interno del servidor" });
        }
      });

      // NOTA: El handler de 'verificar-pago-cajero' está registrado más abajo
      // con removeAllListeners para evitar duplicación (ver línea ~300)

      // ===== EVENTOS DE ROOMS =====

      // Cambiar estado de cajero (disponible/ocupado)
      socket.on("cambiar-estado-cajero", (data) => {
        handleCambiarEstadoCajero(this.getContext(), socket, data);
      });

      // Unirse a room de transacción
      socket.on("unirse-transaccion", (data) => {
        handleUnirseTransaccion(this.getContext(), socket, data);
      });

      // Salir de room de transacción
      socket.on("salir-transaccion", (data) => {
        handleSalirTransaccion(this.getContext(), socket, data);
      });

      // Obtener estadísticas de rooms
      socket.on("obtener-stats-rooms", () => {
        handleObtenerStatsRooms(this.getContext(), socket);
      });

      // Diagnosticar rooms de transacciones
      socket.on("diagnosticar-rooms-transacciones", () => {
        handleDiagnosticarRoomsTransacciones(this.getContext(), socket);
      });

      // Limpiar rooms huérfanos
      socket.on("limpiar-rooms-huerfanos", () => {
        handleLimpiarRoomsHuerfanos(this.getContext(), socket);
      });

      // ===== EVENTOS DE PRUEBA DE NOTIFICACIONES =====

      // Prueba de notificación a cajeros disponibles
      socket.on("test-notification-cajeros", (data) => {
        handleTestNotificationCajeros(this.getContext(), socket, data);
      });

      // Prueba de notificación a jugador específico
      socket.on("test-notification-jugador", (data) => {
        handleTestNotificationJugador(this.getContext(), socket, data);
      });

      // Prueba de notificación a transacción
      socket.on("test-notification-transaccion", (data) => {
        handleTestNotificationTransaccion(this.getContext(), socket, data);
      });

      // ===== EVENTOS DE ACEPTACIÓN DE SOLICITUDES =====
      // Aceptar solicitud de depósito (manejado por depositoController)
      // Remover listener existente si existe para evitar duplicación
      socket.removeAllListeners("aceptar-solicitud");

      socket.on("aceptar-solicitud", async (data) => {
        try {
          await this.depositoController.aceptarSolicitud(socket, data);
        } catch (error) {
          console.error("❌ Error en aceptar-solicitud:", error);
          socket.emit("error", { 
            message: "Error interno del servidor",
            transaccionId: data.transaccionId 
          });
        }
      });

      // Unirse a room de transacción (para reconexión)
      socket.on("unirse-room-transaccion", (data) => {
        handleUnirseRoomTransaccion(this.getContext(), socket, data);
      });

      // Remover listener existente si existe para evitar duplicación
      socket.removeAllListeners("verificar-pago-cajero");

      socket.on("verificar-pago-cajero", async (data) => {
        try {
          console.log("🔍 [SOCKET] Evento verificar-pago-cajero recibido:", {
            transaccionId: data.transaccionId,
            accion: data.accion,
            socketId: socket.id,
            timestamp: new Date().toISOString(),
          });
          await this.depositoController.verificarPagoCajero(socket, data);
        } catch (error) {
          console.error("❌ Error en verificar-pago-cajero:", error);
          socket.emit("error", { 
            message: "Error interno del servidor",
            transaccionId: data.transaccionId 
          });
        }
      });

      // Referir transacción a administrador (desde cajero)
      socket.removeAllListeners("referir-a-admin");
      socket.on("referir-a-admin", async (data) => {
        console.log("⚠️ [SOCKET] Evento referir-a-admin recibido:", {
          transaccionId: data.transaccionId,
          socketId: socket.id,
        });
        await this.depositoController.referirAAdmin(socket, data);
      });

      // Solicitar revisión administrativa (desde jugador)
      socket.removeAllListeners("solicitar-revision-admin");
      socket.on("solicitar-revision-admin", async (data) => {
        console.log("📞 [SOCKET] Evento solicitar-revision-admin recibido:", {
          transaccionId: data.transaccionId,
          socketId: socket.id,
        });
        await this.depositoController.solicitarRevisionAdmin(socket, data);
      });

      // Ajustar monto de depósito
      socket.removeAllListeners("ajustar-monto-deposito");
      socket.on("ajustar-monto-deposito", async (data) => {
        console.log("💰 [SOCKET] Evento ajustar-monto-deposito recibido:", {
          transaccionId: data.transaccionId,
          montoReal: data.montoReal,
          socketId: socket.id,
        });
        await this.depositoController.ajustarMontoDeposito(socket, data);
      });

      // ===== EVENTOS DE DASHBOARD DE ESTADO =====

      // Obtener estado completo del sistema
      socket.on("obtener-estado-completo", () => {
        handleObtenerEstadoCompleto(this.getContext(), socket);
      });

      // Obtener solo estadísticas
      socket.on("obtener-estadisticas", () => {
        handleObtenerEstadisticas(this.getContext(), socket);
      });

      // Obtener estado de cajeros
      socket.on("obtener-estado-cajeros", () => {
        handleObtenerEstadoCajeros(this.getContext(), socket);
      });

      // Obtener estado de jugadores
      socket.on("obtener-estado-jugadores", () => {
        handleObtenerEstadoJugadores(this.getContext(), socket);
      });

      // Obtener estado de transacciones
      socket.on("obtener-estado-transacciones", () => {
        handleObtenerEstadoTransacciones(this.getContext(), socket);
      });

      // Unirse al dashboard de administración
      socket.on("unirse-dashboard", () => {
        handleUnirseDashboard(this.getContext(), socket);
      });

      // Manejar logout de cajero (cuando el cajero cierra sesión sin cerrar la ventana)
      socket.on("logout-cajero", (data, callback) => {
        if (socket.userType === "cajero" && socket.cajeroId) {
          console.log(`🚪 [LOGOUT] Cajero ${socket.cajeroId} cerrando sesión`);
          this.removerCajeroPorId(socket.cajeroId);
          // Limpiar el socket de rooms
          this.roomsManager.limpiarSocket(socket.id);
          
          // Confirmar recepción del evento si hay callback
          if (typeof callback === "function") {
            callback({ success: true, message: "Sesión cerrada correctamente" });
          } else {
            // Fallback: emitir evento de confirmación
            socket.emit("logout-confirmado", { message: "Sesión cerrada correctamente" });
          }
        } else {
          const errorMessage = "Solo cajeros pueden cerrar sesión";
          if (typeof callback === "function") {
            callback({ success: false, message: errorMessage });
          } else {
            socket.emit("error", { message: errorMessage });
          }
        }
      });

      // Manejar tipo de desconexión (antes de desconectarse)
      socket.on("disconnection-type", (data) => {
        console.log(`📱 [DISCONNECTION] Tipo de desconexión recibido: ${data.tipo} para socket ${socket.id}`);
        // Guardar el tipo de desconexión en el socket para usarlo cuando se desconecte
        socket.disconnectionType = data.tipo;
      });

      // Manejar desconexión
      socket.on("disconnect", (reason) => {
        console.log(`🔌 Cliente desconectado: ${socket.id}, razón: ${reason}, tipo: ${socket.disconnectionType || "unknown"}`);
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
   * Manejar desconexión con sistema de recuperación
   */
  async handleDisconnect(socket) {
    // Usar el sistema de recuperación en lugar de limpiar inmediatamente
    // El recovery manager decidirá si limpia inmediatamente o espera reconexión
    await this.connectionRecoveryManager.registerDisconnection(socket);

    // Limpiar referencias básicas del usuario desconectado
    // (pero NO rooms si hay transacciones activas - el recovery manager lo maneja)
    for (let [telegramId, socketId] of this.connectedUsers.entries()) {
      if (socketId === socket.id) {
        this.connectedUsers.delete(telegramId);
        // También eliminar de la lista de jugadores en app de depósitos
        this.connectedPlayers.delete(telegramId);
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

    for (let [botId, socketId] of this.connectedBots.entries()) {
      if (socketId === socket.id) {
        this.connectedBots.delete(botId);
        console.log(`🤖 Bot desconectado: ${botId}`);
        break;
      }
    }
  }

  /**
   * Obtener estadísticas básicas
   * Usa connectionStateManager para tener datos sincronizados
   */
  getStats() {
    // Usar connectionStateManager si está disponible para datos más precisos
    if (this.connectionStateManager) {
      const estadisticas = this.connectionStateManager.getEstadisticas();
      return {
        jugadoresConectados: estadisticas.jugadoresConectados || 0,
        cajerosConectados: estadisticas.cajerosDisponibles + estadisticas.cajerosOcupados || 0,
        botsConectados: this.connectedBots.size,
        totalConexiones: estadisticas.totalConexiones || 0,
      };
    }
    
    // Fallback a los maps si connectionStateManager no está disponible
    return {
      jugadoresConectados: this.connectedUsers.size,
      cajerosConectados: this.connectedCajeros.size,
      botsConectados: this.connectedBots.size,
      totalConexiones: this.io.engine.clientsCount,
    };
  }

  /**
   * Remover cajero por ID (útil cuando el cajero cierra sesión)
   */
  removerCajeroPorId(cajeroId) {
    // Remover de connectedCajeros
    this.connectedCajeros.delete(cajeroId);
    
    // Remover del connectionStateManager
    if (this.connectionStateManager) {
      this.connectionStateManager.removerCajeroPorId(cajeroId);
    }
    
    console.log(`🏦 [SOCKET] Cajero ${cajeroId} removido del sistema`);
  }

}

// Crear instancia única
const socketManager = new SocketManager();

module.exports = socketManager;
