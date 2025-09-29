/**
 * Script para obtener un jugador de prueba para las pruebas de WebSocket
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Jugador = require("../models/Jugador");

async function obtenerJugadorPrueba() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Conectado a MongoDB");

    // Buscar el primer jugador disponible
    const jugador = await Jugador.findOne({});

    if (jugador) {
      console.log("🎮 Jugador encontrado:");
      console.log(`📋 ID: ${jugador._id}`);
      console.log(
        `👤 Nombre: ${jugador.nickname || jugador.firstName || "Sin nombre"}`
      );
      console.log(`📱 Telegram ID: ${jugador.telegramId}`);
      console.log(`💰 Saldo: ${jugador.saldo}`);
      console.log(`📧 Email: ${jugador.email || "Sin email"}`);
      console.log(`📅 Creado: ${jugador.fechaCreacion}`);

      return jugador._id.toString();
    } else {
      console.log("❌ No se encontraron jugadores en la base de datos");

      // Crear un jugador de prueba
      console.log("🔧 Creando jugador de prueba...");
      const nuevoJugador = new Jugador({
        telegramId: 123456789,
        firstName: "Usuario",
        lastName: "Prueba",
        nickname: "TestUser",
        saldo: 1000000,
        email: "test@ejemplo.com",
        estado: "activo",
      });

      await nuevoJugador.save();
      console.log("✅ Jugador de prueba creado:");
      console.log(`📋 ID: ${nuevoJugador._id}`);
      console.log(`👤 Nombre: ${nuevoJugador.nickname}`);
      console.log(`📱 Telegram ID: ${nuevoJugador.telegramId}`);
      console.log(`💰 Saldo: ${nuevoJugador.saldo}`);

      return nuevoJugador._id.toString();
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Desconectado de MongoDB");
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  obtenerJugadorPrueba()
    .then((jugadorId) => {
      console.log(`\n🎯 ID de jugador para usar en las pruebas: ${jugadorId}`);
    })
    .catch((error) => {
      console.error("❌ Error ejecutando script:", error);
      process.exit(1);
    });
}

module.exports = obtenerJugadorPrueba;
