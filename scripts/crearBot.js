require("dotenv").config();
const mongoose = require("mongoose");
const Admin = require("../models/Admin");

// Protección: solo permitir en desarrollo
if (process.env.NODE_ENV !== "development") {
  console.error(
    "❌ Este script solo puede ejecutarse en entorno de desarrollo."
  );
  process.exit(1);
}

async function crearBot() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Conectado a MongoDB");

    const email = "bot@elpatio.games";
    const yaExiste = await Admin.findOne({ email });

    if (yaExiste) {
      console.log("⚠️ Ya existe un bot con ese correo.");
      process.exit(0);
    }

    const password = "BotCl4ve#Sup3rS3gur4!2025";

    const nuevoBot = new Admin({
      nombreCompleto: "Bot de Telegram",
      email,
      password: password,
      rol: "bot",
      estado: "activo",
    });

    await nuevoBot.save();
    console.log("🎉 Bot del sistema creado correctamente:");
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Contraseña: ${password}`);
    console.log(`🤖 Rol: bot`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error al crear el bot:", error.message);
    process.exit(1);
  }
}

crearBot();
