const express = require("express");
const router = express.Router();
const notificacionesBotController = require("../controllers/notificacionesBotController");
const auth = require("../middlewares/auth");
const verificarAdmin = require("../middlewares/verificarAdmin");

/**
 * GET /api/bot/notificaciones-pendientes
 * Obtener notificaciones pendientes para el bot
 * Requiere autenticación
 */
router.get("/notificaciones-pendientes", auth, async (req, res) => {
  try {
    // Verificar que el usuario autenticado sea el bot
    if (!req.user || req.user.rol !== "bot") {
      return res.status(403).json({
        mensaje: "Solo el bot puede acceder a las notificaciones pendientes",
      });
    }

    // Obtener query params opcionales
    const { telegramId, tipo, limit } = req.query;
    const query = {};

    if (telegramId) {
      query.jugadorTelegramId = telegramId;
    }

    if (tipo) {
      query.tipo = tipo;
    }

    // Obtener notificaciones pendientes
    const notificaciones = await notificacionesBotController.obtenerPendientes(
      query
    );

    // Limitar resultados
    const limite = parseInt(limit) || 50;
    const resultado = notificaciones.slice(0, limite);

    return res.status(200).json({
      mensaje: "Notificaciones obtenidas exitosamente",
      notificaciones: resultado,
      total: resultado.length,
    });
  } catch (error) {
    console.error("❌ Error obteniendo notificaciones pendientes:", error);
    return res.status(500).json({
      mensaje: "Error obteniendo notificaciones pendientes",
      error: error.message,
    });
  }
});

/**
 * POST /api/bot/notificaciones/:id/marcar-enviada
 * Marcar una notificación como enviada
 * Requiere autenticación
 */
router.post("/notificaciones/:id/marcar-enviada", auth, async (req, res) => {
  try {
    // Verificar que el usuario autenticado sea el bot
    if (!req.user || req.user.rol !== "bot") {
      return res.status(403).json({
        mensaje: "Solo el bot puede marcar notificaciones como enviadas",
      });
    }

    const { id } = req.params;

    // Marcar como enviada
    const notificacion = await notificacionesBotController.marcarEnviada(id);

    return res.status(200).json({
      mensaje: "Notificación marcada como enviada",
      notificacion,
    });
  } catch (error) {
    console.error("❌ Error marcando notificación como enviada:", error);
    return res.status(500).json({
      mensaje: "Error marcando notificación como enviada",
      error: error.message,
    });
  }
});

/**
 * POST /api/bot/notificaciones/marcar-enviadas
 * Marcar múltiples notificaciones como enviadas
 * Requiere autenticación
 */
router.post("/notificaciones/marcar-enviadas", auth, async (req, res) => {
  try {
    // Verificar que el usuario autenticado sea el bot
    if (!req.user || req.user.rol !== "bot") {
      return res.status(403).json({
        mensaje: "Solo el bot puede marcar notificaciones como enviadas",
      });
    }

    const { notificacionIds } = req.body;

    if (!notificacionIds || !Array.isArray(notificacionIds)) {
      return res.status(400).json({
        mensaje: "notificacionIds debe ser un array",
      });
    }

    // Marcar como enviadas
    const result = await notificacionesBotController.marcarVariasEnviadas(
      notificacionIds
    );

    return res.status(200).json({
      mensaje: "Notificaciones marcadas como enviadas",
      modificadas: result.modifiedCount,
    });
  } catch (error) {
    console.error(
      "❌ Error marcando múltiples notificaciones como enviadas:",
      error
    );
    return res.status(500).json({
      mensaje: "Error marcando notificaciones como enviadas",
      error: error.message,
    });
  }
});

/**
 * POST /api/bot/notificaciones/:id/incrementar-intentos
 * Incrementar contador de intentos (para reintentos)
 * Requiere autenticación
 */
router.post(
  "/notificaciones/:id/incrementar-intentos",
  auth,
  async (req, res) => {
    try {
      // Verificar que el usuario autenticado sea el bot
      if (!req.user || req.user.rol !== "bot") {
        return res.status(403).json({
          mensaje: "Solo el bot puede incrementar intentos",
        });
      }

      const { id } = req.params;

      // Incrementar intentos
      const notificacion =
        await notificacionesBotController.incrementarIntentos(id);

      return res.status(200).json({
        mensaje: "Intentos incrementados",
        intentos: notificacion.intentos,
      });
    } catch (error) {
      console.error("❌ Error incrementando intentos:", error);
      return res.status(500).json({
        mensaje: "Error incrementando intentos",
        error: error.message,
      });
    }
  }
);

/**
 * POST /api/bot/notificaciones/limpieza
 * Limpiar notificaciones antiguas (enviadas hace más de 30 días)
 * Solo para administradores
 */
router.post("/notificaciones/limpieza", verificarAdmin, async (req, res) => {
  try {
    const result = await notificacionesBotController.limpiarAntiguas();

    return res.status(200).json({
      mensaje: "Limpieza completada",
      eliminadas: result.deletedCount,
    });
  } catch (error) {
    console.error("❌ Error en limpieza de notificaciones:", error);
    return res.status(500).json({
      mensaje: "Error en limpieza de notificaciones",
      error: error.message,
    });
  }
});

module.exports = router;
