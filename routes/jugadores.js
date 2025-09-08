const express = require("express");
const router = express.Router();
const {
  crearJugador,
  obtenerJugadores,
  obtenerJugadorPorTelegramId,
  acreditarSaldo,
  debitarSaldo,
  actualizarJugador,
  eliminarJugador,
  checkNicknameAvailability,
  obtenerJugadorPorId,
  verificarEstadoJugador,
  obtenerNickname,
  obtenerSaldo,
} = require("../controllers/jugadoresController");
const verificarMinimo = require("../middlewares/verificarMinimo");
const auth = require("../middlewares/auth");

// Crear jugador
router.post("/", auth, verificarMinimo("bot"), crearJugador);

// Verificar disponibilidad de nickname
router.get(
  "/check-nickname/:nickname",
  auth,
  verificarMinimo("bot"),
  checkNicknameAvailability
);

// Listar todos los jugadores
router.get("/", auth, verificarMinimo("bot"), obtenerJugadores);

// Buscar por telegramId
router.get(
  "/:telegramId",
  auth,
  verificarMinimo("bot"),
  obtenerJugadorPorTelegramId
);

//Buscar por ObjectId
router.get("/by-id/:id", auth, verificarMinimo("bot"), obtenerJugadorPorId);

// Acreditar saldo
router.post(
  "/:telegramId/saldo/acreditar",
  auth,
  verificarMinimo("bot"),
  acreditarSaldo
);

// Debitar saldo
router.post(
  "/:telegramId/saldo/debitar",
  auth,
  verificarMinimo("bot"),
  debitarSaldo
);

// Actualizar jugador (general)
router.put("/:telegramId", auth, verificarMinimo("bot"), actualizarJugador);

// Obtener nickname de jugador
router.get(
  "/:telegramId/nickname",
  auth,
  verificarMinimo("bot"),
  obtenerNickname
);

// Actualizar nickname
router.put(
  "/:telegramId/nickname",
  auth,
  verificarMinimo("bot"),
  actualizarJugador
);

// Eliminar jugador
router.delete("/:telegramId", auth, verificarMinimo("admin"), eliminarJugador);

// Verificar estado del jugador
router.get(
  "/:jugadorId/estado",
  auth,
  verificarMinimo("bot"),
  verificarEstadoJugador
);

// Obtener saldo del jugador
router.get("/:telegramId/saldo", auth, verificarMinimo("bot"), obtenerSaldo);

module.exports = router;
