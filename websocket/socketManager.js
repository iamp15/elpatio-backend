/**
 * Módulo básico de gestión de WebSockets
 */

class SocketManager {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // telegramId -> socketId
    this.connectedCajeros = new Map(); // cajeroId -> socketId
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
    });

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
      socket.on("authenticate-jugador", async (data) => {
        try {
          const result = await this.authenticateJugador(socket, data);
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
      socket.on("authenticate-cajero", async (data) => {
        try {
          const result = await this.authenticateCajero(socket, data);
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
      socket.userType = "jugador";

      console.log(
        `👤 Jugador autenticado: ${
          jugador.nickname || jugador.firstName
        } (${telegramId})`
      );

      return {
        success: true,
        message: "Autenticación exitosa",
        user: {
          telegramId: jugador.telegramId,
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

      console.log(`🏦 Cajero autenticado: ${cajero.nombre} (${decoded.id})`);

      return {
        success: true,
        message: "Autenticación exitosa",
        user: {
          id: cajero._id,
          nombre: cajero.nombre,
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
}

// Crear instancia única
const socketManager = new SocketManager();

module.exports = socketManager;
