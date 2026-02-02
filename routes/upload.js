/**
 * Rutas para subida de archivos
 */

const express = require("express");
const router = express.Router();
const auth = require("../middlewares/auth");
const verificarMinimo = require("../middlewares/verificarMinimo");
const uploadController = require("../controllers/uploadController");

/**
 * Subir imagen de rechazo
 * POST /api/upload/imagen-rechazo
 * Requiere autenticación y rol mínimo de cajero
 */
router.post(
  "/imagen-rechazo",
  auth,
  verificarMinimo("cajero"),
  uploadController.uploadMiddleware,
  uploadController.subirImagenRechazo
);

/**
 * Subir imagen de comprobante (para retiros)
 * POST /api/upload/imagen-comprobante
 * Requiere autenticación y rol mínimo de cajero
 */
router.post(
  "/imagen-comprobante",
  auth,
  verificarMinimo("cajero"),
  uploadController.uploadMiddleware,
  uploadController.subirImagenComprobante
);

module.exports = router;
