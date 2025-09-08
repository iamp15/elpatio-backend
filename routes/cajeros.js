const express = require("express");
const router = express.Router();
const {
  crearCajero,
  loginCajero,
  obtenerCajeros,
  obtenerMiPerfil,
} = require("../controllers/cajerosController");
const auth = require("../middlewares/auth");
const verificarMinimo = require("../middlewares/verificarMinimo");

// Crear cajero
router.post("/", auth, verificarMinimo("admin"), crearCajero);

// Login
router.post("/login", loginCajero);

// Listar todos
router.get("/", auth, verificarMinimo("bot"), obtenerCajeros);

// Obtener perfil del cajero autenticado
router.get("/mi-perfil", auth, obtenerMiPerfil);

module.exports = router;
