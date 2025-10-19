const app = require("./app");
const connectDB = require("./config/db");
const mongoose = require("mongoose");
const socketManager = require("./websocket/socketManager");
const { iniciarLimpiezaAutomatica } = require("./utils/notificationCleanup");

const PORT = process.env.PORT || 3000;

// Variable para el servidor (declarada en scope superior)
let server;

// Función para shutdown graceful
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Recibida señal ${signal}. Iniciando shutdown graceful...`);

  if (!server) {
    console.log("⚠️ Servidor no inicializado, saliendo directamente...");
    process.exit(0);
    return;
  }

  server.close(() => {
    console.log("✅ Servidor HTTP cerrado");

    mongoose.connection.close(false, () => {
      console.log("✅ Conexión MongoDB cerrada");
      process.exit(0);
    });
  });

  // Forzar cierre después de 10 segundos
  setTimeout(() => {
    console.error("❌ Forzando cierre del servidor");
    process.exit(1);
  }, 10000);
};

// Manejar señales de terminación
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Manejar errores no capturados
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});

// Iniciar servidor
connectDB()
  .then(() => {
    server = app.listen(PORT, "0.0.0.0", () => {
      console.log(
        `🚀 Servidor El Patio Backend v${app.APP_VERSION} [ALPHA] corriendo en el puerto ${PORT}`
      );
      console.log(
        `📊 Health check disponible en: http://localhost:${PORT}/health`
      );
    });

    // Configurar timeout del servidor
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;

    // Inicializar WebSocket
    socketManager.initialize(server);

    // Hacer disponible el socketManager globalmente
    app.set("socketManager", socketManager);

    // Endpoint para estadísticas de WebSocket
    app.get("/api/websocket/stats", (req, res) => {
      res.json(socketManager.getStats());
    });

    // Iniciar limpieza automática de notificaciones
    try {
      iniciarLimpiezaAutomatica();
    } catch (error) {
      console.error(
        "⚠️ Error iniciando limpieza automática de notificaciones:",
        error.message
      );
      console.log("💡 Asegúrate de instalar node-cron: npm install node-cron");
    }
  })
  .catch((error) => {
    console.error("❌ Error al iniciar servidor:", error);
    process.exit(1);
  });
