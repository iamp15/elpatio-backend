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

async function crearSuperadmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado a MongoDB");

    const email = "iamp18@gmail.com";
    const yaExiste = await Admin.findOne({ email });

    if (yaExiste) {
      console.log("⚠️ Ya existe un superadmin con ese correo.");
      process.exit(0);
    }

    const password = "Cl4ve#SuperAdm1n!2025";

    const superadmin = new Admin({
      nombreCompleto: "Igor Martínez",
      email,
      password: password, // ✅ Sin hash manual
      rol: "superadmin",
      estado: "activo",
    });

    await superadmin.save();
    console.log("🎉 Superadmin creado correctamente:");
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Contraseña: ${password}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error al crear el superadmin:", error.message);
    process.exit(1);
  }
}

crearSuperadmin();
