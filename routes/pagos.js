const express = require("express");
const router = express.Router();
const {
  crearPago,
  confirmarPago,
  rechazarPago,
  obtenerPagosPorSala,
  obtenerPagosPorJugador,
  obtenerPagosPendientes,
} = require("../controllers/pagosController");

const auth = require("../middlewares/auth");
const verificarMinimo = require("../middlewares/verificarMinimo");
const verificarRolExacto = require("../middlewares/verificarRolExacto");

// Crear un pago (por el sistema o el bot)
router.post("/", auth, verificarRolExacto(["bot", "superadmin"]), crearPago);

// Confirmar pago (solo cajeros y admins)
router.post("/:id/confirmar", auth, verificarMinimo("cajero"), confirmarPago);

// Rechazar pago (solo cajeros y admins)
router.post("/:id/rechazar", auth, verificarMinimo("cajero"), rechazarPago);

// Obtener pagos de un jugador (admins o superadmin)
router.get(
  "/jugador/:jugadorId",
  auth,
  verificarMinimo("admin"),
  obtenerPagosPorJugador
);

//Obtener pagos pendientes de un cajero
router.get(
  "/pendientes",
  auth,
  verificarRolExacto(["cajero"]),
  obtenerPagosPendientes
);

module.exports = router;
