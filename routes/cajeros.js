const express = require("express");
const router = express.Router();
const {
  crearCajero,
  loginCajero,
  obtenerCajeros,
  obtenerMiPerfil,
  modificarCajero,
  eliminarCajero,
  obtenerSaldo,
  obtenerHistorialSaldo,
  modificarSaldo,
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

// Obtener saldo del cajero autenticado (permiso mínimo: cajero)
router.get("/mi-saldo", auth, verificarMinimo("cajero"), obtenerSaldo);

// Obtener historial de saldo del cajero autenticado (permiso mínimo: cajero)
router.get("/mi-historial-saldo", auth, verificarMinimo("cajero"), obtenerHistorialSaldo);

// Modificar cajero (solo admin o superadmin)
router.put("/:id", auth, verificarMinimo("admin"), modificarCajero);

// Modificar saldo manualmente (solo admin o superadmin, para ajustes futuros)
router.put("/:id/saldo", auth, verificarMinimo("admin"), modificarSaldo);

// Eliminar cajero (solo admin o superadmin)
router.delete("/:id", auth, verificarMinimo("admin"), eliminarCajero);

module.exports = router;
