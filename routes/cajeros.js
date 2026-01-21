const express = require("express");
const router = express.Router();
const {
  crearCajero,
  loginCajero,
  obtenerCajeros,
  obtenerMiPerfil,
  modificarCajero,
  eliminarCajero,
} = require("../controllers/cajerosController");
const auth = require("../middlewares/auth");
const verificarMinimo = require("../middlewares/verificarMinimo");

// Crear cajero (solo admin o superadmin)
router.post("/", auth, verificarMinimo("admin"), crearCajero);

// Login
router.post("/login", loginCajero);

// Listar todos
router.get("/", auth, verificarMinimo("bot"), obtenerCajeros);

// Obtener perfil del cajero autenticado
router.get("/mi-perfil", auth, obtenerMiPerfil);

// Modificar cajero (solo admin o superadmin)
router.put("/:id", auth, verificarMinimo("admin"), modificarCajero);

// Eliminar cajero (solo admin o superadmin)
router.delete("/:id", auth, verificarMinimo("admin"), eliminarCajero);

module.exports = router;
