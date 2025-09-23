const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const options = {
      maxPoolSize: 10, // Mantener hasta 10 conexiones de socket
      serverSelectionTimeoutMS: 5000, // Mantener intentando enviar operaciones por 5 segundos
      socketTimeoutMS: 45000, // Cerrar sockets después de 45 segundos de inactividad
      bufferCommands: false, // Deshabilitar mongoose buffering
    };

    await mongoose.connect(process.env.MONGODB_URI, options);
    console.log("✅ MongoDB connected successfully");

    // Manejar eventos de conexión
    mongoose.connection.on("error", (err) => {
      console.error("❌ MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      console.warn("⚠️ MongoDB disconnected, attempting to reconnect...");
    });

    mongoose.connection.on("reconnected", () => {
      console.log("✅ MongoDB reconnected");
    });
  } catch (error) {
    console.error("❌ Error de conexión a MongoDB:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
