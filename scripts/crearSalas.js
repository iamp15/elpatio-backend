require("dotenv").config();
const mongoose = require("mongoose");
const Sala = require("../models/Sala");

// Protección: solo permitir en desarrollo
if (process.env.NODE_ENV !== "development") {
  console.error(
    "❌ Este script solo puede ejecutarse en entorno de desarrollo."
  );
  process.exit(1);
}

async function crearSalas() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado a MongoDB");

    // Crear salas de prueba
    const salas = [
      {
        nombre: "Sala Principal",
        descripcion: "Sala principal para juegos",
        estado: "activa",
        capacidad: 150,
      },
      {
        nombre: "Sala VIP",
        descripcion: "Sala exclusiva para jugadores VIP",
        estado: "activa",
        capacidad: 50,
      },
      {
        nombre: "Sala de Pruebas",
        descripcion: "Sala para testing",
        estado: "activa",
        capacidad: 25,
      },
    ];

    console.log("🏢 Creando salas...");
    const salasCreadas = [];
    for (const salaData of salas) {
      const sala = new Sala(salaData);
      await sala.save();
      salasCreadas.push(sala);
      console.log(`✅ Sala creada: ${sala.nombre} (ID: ${sala._id})`);
    }

    console.log("\n🎉 Salas creadas exitosamente!");
    console.log("\n📋 IDs de salas para usar en pruebas:");
    salasCreadas.forEach((sala, index) => {
      console.log(`${index + 1}. ${sala.nombre}: ${sala._id}`);
    });

    process.exit(0);
  } catch (error) {
    console.error("❌ Error al crear las salas:", error.message);
    process.exit(1);
  }
}

crearSalas();
