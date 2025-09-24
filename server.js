const app = require("./app");
const connectDB = require("./config/db");
const mongoose = require("mongoose");

const PORT = process.env.PORT || 3000;

// Función para shutdown graceful
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Recibida señal ${signal}. Iniciando shutdown graceful...`);

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
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
      console.log(
        `📊 Health check disponible en: http://localhost:${PORT}/health`
      );
    });

    // Configurar timeout del servidor
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
  })
  .catch((error) => {
    console.error("❌ Error al iniciar servidor:", error);
    process.exit(1);
  });
