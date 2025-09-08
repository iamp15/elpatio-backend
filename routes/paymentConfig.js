const express = require("express");
const router = express.Router();
const paymentConfigController = require("../controllers/paymentConfigController");
const auth = require("../middlewares/auth"); // autenticación general
const verificarMinimo = require("../middlewares/verificarMinimo"); // control de rol

// Obtener configuración actual
router.get("/", auth, paymentConfigController.getConfig);

// Obtener configuración específica
router.get("/:configType", auth, paymentConfigController.getConfigByType);

// Actualizar configuración (solo admin)
router.put(
  "/",
  auth,
  verificarMinimo("admin"),
  paymentConfigController.updateConfig
);

// Obtener historial de auditoría
router.get(
  "/audit",
  auth,
  verificarMinimo("admin"),
  paymentConfigController.getAuditLog
);

// Eliminar configuración (soft delete)
router.delete(
  "/:id",
  auth,
  verificarMinimo("admin"),
  paymentConfigController.deleteConfig
);

// Restaurar configuración eliminada
router.patch(
  "/:id/restore",
  auth,
  verificarMinimo("admin"),
  paymentConfigController.restoreConfig
);

module.exports = router;
