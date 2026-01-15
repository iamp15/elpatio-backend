const express = require("express");
const router = express.Router();
const {
  registrarCajero,
  registrarAdmin,
} = require("../controllers/usuariosController");
const auth = require("../middlewares/auth");
const verificarMinimo = require("../middlewares/verificarMinimo");

/**
 * POST /api/usuarios/registro/cajero
 * Registra un nuevo cajero
 * 
 * Requiere autenticación: mínimo rol "admin"
 * 
 * Body:
 * {
 *   "nombreCompleto": "Nombre Completo",
 *   "email": "email@example.com",
 *   "password": "password123",
 *   "telefonoContacto": "04121234567",
 *   "datosPagoMovil": {
 *     "banco": "Banco",
 *     "cedula": {
 *       "prefijo": "V",
 *       "numero": "12345678"
 *     },
 *     "telefono": "04121234567"
 *   },
 *   "foto": "url_foto" // opcional
 * }
 */
router.post(
  "/registro/cajero",
  auth,
  verificarMinimo("admin"),
  registrarCajero
);

/**
 * POST /api/usuarios/registro/admin
 * Registra un nuevo admin
 * 
 * Requiere autenticación: rol "superadmin"
 * 
 * Body:
 * {
 *   "nombreCompleto": "Nombre Completo",
 *   "email": "email@example.com",
 *   "password": "password123",
 *   "rolAdmin": "admin" // opcional, por defecto "admin". También puede ser "moderador"
 * }
 */
router.post(
  "/registro/admin",
  auth,
  verificarMinimo("superadmin"),
  registrarAdmin
);

module.exports = router;
