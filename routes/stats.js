const express = require("express");
const router = express.Router();
const { obtenerStatsGlobales } = require("../controllers/statsController");

const verificarToken = require("../middlewares/auth");
const verificarAdmin = require("../middlewares/verificarAdmin");

router.get("/", verificarToken, verificarAdmin, obtenerStatsGlobales);

module.exports = router;
