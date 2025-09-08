const express = require("express");
const router = express.Router();
const {
  crearAdmin,
  loginAdmin,
  obtenerAdmins,
} = require("../controllers/adminController");
const {
  obtenerStatsGlobales,
  obtenerStatsPorFecha,
} = require("../controllers/statsController");
const { obtenerLogs } = require("../controllers/logsController");
const auth = require("../middlewares/auth");
const verificarMinimo = require("../middlewares/verificarMinimo");

//Crear admin (solo superadmin en produccion)
router.post("/", auth, verificarMinimo("superadmin"), crearAdmin);

//Login publico
router.post("/login", loginAdmin);

//Obtener todos los admins (solo superadmin)
router.get("/", auth, verificarMinimo("superadmin"), obtenerAdmins);

//Obtener stats globales
router.get("/stats", auth, verificarMinimo("admin"), obtenerStatsGlobales);

//Obtener stats por fecha
router.get(
  "/stats/fecha",
  auth,
  verificarMinimo("admin"),
  obtenerStatsPorFecha
);

//Obtener logs
router.get("/logs", auth, verificarMinimo(3), obtenerLogs);

module.exports = router;
