require("dotenv").config();
const jwt = require("jsonwebtoken");

// Generar un token JWT válido para el bot
function generarToken() {
  try {
    const payload = {
      id: "688e2b5444ea3f514acf7bd9", // ID del bot (puedes cambiarlo si es necesario)
      email: "bot@elpatio.games",
      rol: "bot"
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d" // Token válido por 7 días
    });

    console.log("🔑 Token JWT generado:");
    console.log(token);
    console.log("\n📋 Información del token:");
    console.log(`📧 Email: ${payload.email}`);
    console.log(`🤖 Rol: ${payload.rol}`);
    console.log(`⏰ Expira en: 7 días`);
    
    return token;
  } catch (error) {
    console.error("❌ Error generando token:", error.message);
    process.exit(1);
  }
}

generarToken();
