const express = require("express");
const router = express.Router();

/**
 * Endpoint para obtener estadísticas de WebSocket
 */
router.get("/stats", (req, res) => {
  const socketManager = req.app.get("socketManager");

  if (!socketManager) {
    return res.status(500).json({
      success: false,
      message: "WebSocket manager no disponible",
    });
  }

  res.json({
    success: true,
    stats: socketManager.getStats(),
  });
});

/**
 * Endpoint para enviar mensaje de prueba
 */
router.post("/test-message", (req, res) => {
  const socketManager = req.app.get("socketManager");

  if (!socketManager || !socketManager.io) {
    return res.status(500).json({
      success: false,
      message: "WebSocket no disponible",
    });
  }

  // Enviar mensaje de prueba a todos los clientes conectados
  socketManager.io.emit("test-message", {
    message: "Mensaje de prueba desde el servidor",
    timestamp: new Date().toISOString(),
  });

  res.json({
    success: true,
    message: "Mensaje de prueba enviado",
  });
});

module.exports = router;
