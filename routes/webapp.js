const express = require("express");
const router = express.Router();
const { obtenerSaldo } = require("../controllers/jugadoresController");
const { telegramIdAuth } = require("../middlewares/telegramAuth");

/**
 * Rutas específicas para Telegram Web Apps
 * Estas rutas usan autenticación basada en Telegram ID
 * en lugar de JWT para mayor simplicidad
 */

// Obtener saldo del jugador (para mini apps)
router.get("/jugadores/:telegramId/saldo", telegramIdAuth, obtenerSaldo);

// Endpoint de salud para mini apps
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "WebApp API funcionando",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
