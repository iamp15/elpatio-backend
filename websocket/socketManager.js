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
}

// Crear instancia única
const socketManager = new SocketManager();

module.exports = socketManager;
