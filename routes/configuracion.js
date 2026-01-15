const express = require("express");
const router = express.Router();
const configuracionController = require("../controllers/configuracionController");
const auth = require("../middlewares/auth");
const verificarMinimo = require("../middlewares/verificarMinimo");

/**
 * Rutas públicas (accesibles para cajeros autenticados)
 */

// Obtener configuraciones de depósitos (público para app de cajeros)
router.get("/depositos", configuracionController.obtenerConfiguracionesDepositos);

// Obtener una configuración específica (público para lectura)
router.get("/:clave", configuracionController.obtenerConfiguracion);

/**
 * Rutas protegidas (solo administradores)
 */

// Obtener todas las configuraciones (requiere autenticación admin)
router.get("/", auth, verificarMinimo("admin"), configuracionController.obtenerConfiguraciones);

// Crear nueva configuración (requiere autenticación admin)
router.post("/", auth, verificarMinimo("admin"), configuracionController.crearConfiguracion);

// Actualizar configuración (requiere autenticación admin)
router.put("/:clave", auth, verificarMinimo("admin"), configuracionController.actualizarConfiguracion);

// Inicializar configuraciones por defecto (requiere autenticación admin)
router.post("/inicializar", auth, verificarMinimo("admin"), configuracionController.inicializarDefaults);

module.exports = router;

