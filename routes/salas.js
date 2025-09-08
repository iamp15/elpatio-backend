const express = require("express");
const router = express.Router();
const salasController = require("../controllers/salasController");
const auth = require("../middlewares/auth"); // autenticación general
const verificarMinimo = require("../middlewares/verificarMinimo"); // control de rol
const verificarRolExacto = require("../middlewares/verificarRolExacto");

// Crear una nueva sala (puede hacerlo el bot o un admin)
router.post("/", auth, verificarMinimo("bot"), salasController.crearSala);

// Obtener todas las salas disponibles (estado: esperando)
router.get(
  "/disponibles",
  auth,
  verificarMinimo("bot"),
  salasController.obtenerSalasDisponibles
);

// Obtener detalles de una sala específica
router.get(
  "/:salaId",
  auth,
  verificarMinimo("bot"),
  salasController.obtenerSalaPorId
);

// Unirse a una sala específica
router.post(
  "/:salaId/unirse",
  auth,
  verificarMinimo("bot"),
  salasController.unirseASala
);

// Cambiar el estado de una sala (ej: a jugando o finalizada)
router.post(
  "/:salaId/estado",
  auth,
  verificarMinimo("bot"),
  salasController.cambiarEstadoSala
);

// Cancelar una sala manualmente (admin o superadmin)
router.post(
  "/:salaId/cancelar",
  auth,
  verificarMinimo("bot"),
  salasController.cancelarSala
);

// Cancelar una sala por inactividad
router.post(
  "/:salaId/cancelar-inactividad",
  auth,
  verificarMinimo("bot"),
  salasController.cancelarSalaPorInactividad
);

// Cambiar estado de la sala a "jugando"
router.post(
  "/:salaId/jugando",
  auth,
  verificarMinimo("bot"),
  salasController.marcarSalaComoJugando
);

// Cambiar estado de la sala a "finalizada"
router.post(
  "/:salaId/finalizada",
  auth,
  verificarRolExacto(["sistema", "bot"]),
  salasController.marcarSalaComoFinalizada
);

// Eliminar a un jugador de una sala
router.post(
  "/:salaId/eliminar-jugador",
  auth,
  verificarMinimo("bot"),
  salasController.eliminarJugadorDeSala
);

module.exports = router;
