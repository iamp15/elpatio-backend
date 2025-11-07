const express = require("express");
const router = express.Router();
const configuracionController = require("../controllers/configuracionController");

// Middleware de autenticación (si existe)
// const { verificarToken } = require("../middlewares/auth");

/**
 * Rutas públicas (accesibles para cajeros autenticados)
 */

// Obtener configuraciones de depósitos
router.get("/depositos", configuracionController.obtenerConfiguracionesDepositos);

// Obtener una configuración específica
router.get("/:clave", configuracionController.obtenerConfiguracion);

/**
 * Rutas protegidas (solo administradores)
 * TODO: Agregar middleware de verificación de rol admin cuando esté disponible
 */

// Obtener todas las configuraciones
router.get("/", configuracionController.obtenerConfiguraciones);

// Crear nueva configuración
router.post("/", configuracionController.crearConfiguracion);

// Actualizar configuración
router.put("/:clave", configuracionController.actualizarConfiguracion);

// Inicializar configuraciones por defecto
router.post("/inicializar", configuracionController.inicializarDefaults);

module.exports = router;

