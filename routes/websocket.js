const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const verificarMinimo = require("../middlewares/verificarMinimo");

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
 * Endpoint para diagnosticar rooms de transacciones
 * GET /api/websocket/diagnosticar-rooms
 * TODO: Agregar autenticación en producción (auth, verificarMinimo("cajero"))
 * Temporalmente sin autenticación para desarrollo
 */
router.get("/diagnosticar-rooms", (req, res) => {
  const socketManager = req.app.get("socketManager");

  if (!socketManager || !socketManager.roomsManager) {
    return res.status(500).json({
      success: false,
      message: "RoomsManager no disponible",
    });
  }

  try {
    const diagnostico = socketManager.roomsManager.diagnosticarRoomsTransacciones();

    console.log(
      `🔍 [API] Diagnóstico de rooms solicitado`
    );

    res.json({
      success: true,
      diagnostico: diagnostico,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ [API] Error en diagnóstico de rooms:", error);
    res.status(500).json({
      success: false,
      message: "Error al diagnosticar rooms",
      error: error.message,
    });
  }
});

/**
 * Endpoint para limpiar rooms huérfanos
 * POST /api/websocket/limpiar-rooms
 * TODO: Agregar autenticación en producción (auth, verificarMinimo("cajero"))
 * Temporalmente sin autenticación para desarrollo
 */
router.post("/limpiar-rooms", (req, res) => {
  const socketManager = req.app.get("socketManager");

  if (!socketManager || !socketManager.roomsManager) {
    return res.status(500).json({
      success: false,
      message: "RoomsManager no disponible",
    });
  }

  try {
    const resultado = socketManager.roomsManager.limpiarRoomsVacios();

    console.log(
      `🧹 [API] Limpieza de rooms solicitada: ${resultado.limpiados} limpiados`
    );

    res.json({
      success: true,
      resultado: resultado,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ [API] Error en limpieza de rooms:", error);
    res.status(500).json({
      success: false,
      message: "Error al limpiar rooms",
      error: error.message,
    });
  }
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
