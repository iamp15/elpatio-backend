const express = require("express");
const router = express.Router();
const notificacionesController = require("../controllers/notificacionesController");
const verificarAdmin = require("../middlewares/verificarAdmin");
const telegramAuth = require("../middlewares/telegramAuth");

/**
 * GET /api/notificaciones/cajero
 * Obtener notificaciones del cajero autenticado
 * Requiere autenticación de cajero
 */
router.get("/cajero", verificarAdmin, async (req, res) => {
  try {
    // El middleware verificarAdmin agrega req.usuario con info del cajero
    const cajeroId = req.usuario._id || req.usuario.id;

    // Modificar query para usar el cajeroId del token
    req.query.destinatarioId = cajeroId;
    req.query.destinatarioTipo = "cajero";

    return notificacionesController.obtenerNotificaciones(req, res);
  } catch (error) {
    console.error("❌ Error en ruta cajero:", error.message);
    return res.status(500).json({
      mensaje: "Error obteniendo notificaciones",
      error: error.message,
    });
  }
});

/**
 * GET /api/notificaciones/jugador/:telegramId
 * Obtener notificaciones de un jugador por telegramId
 * Requiere autenticación de Telegram (o admin)
 */
router.get(
  "/jugador/:telegramId",
  telegramAuth,
  notificacionesController.obtenerNotificacionesJugador
);

/**
 * POST /api/notificaciones
 * Crear una nueva notificación
 * Endpoint interno, requiere autenticación de admin o sistema
 */
router.post("/", verificarAdmin, notificacionesController.crearNotificacion);

/**
 * DELETE /api/notificaciones/:id
 * Eliminar una notificación específica
 * Puede ser usado por cajeros o jugadores para eliminar sus propias notificaciones
 */
router.delete(
  "/:id",
  telegramAuth,
  notificacionesController.eliminarNotificacion
);

/**
 * POST /api/notificaciones/limpieza
 * Ejecutar limpieza manual de notificaciones antiguas
 * Solo para administradores
 */
router.post(
  "/limpieza",
  verificarAdmin,
  notificacionesController.ejecutarLimpieza
);

module.exports = router;
