const express = require("express");
const router = express.Router();
const {
  crearAdmin,
  loginAdmin,
  obtenerAdmins,
  obtenerMiPerfil,
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

// Obtener perfil del admin autenticado
router.get("/mi-perfil", auth, obtenerMiPerfil);

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

/**
 * Obtener estadísticas detalladas de conexiones WebSocket
 * GET /api/admin/connection-stats
 */
router.get("/connection-stats", auth, verificarMinimo("admin"), (req, res) => {
  try {
    const socketManager = req.app.get("socketManager");

    if (!socketManager) {
      return res.status(500).json({
        mensaje: "WebSocket manager no disponible",
        error: "El servidor WebSocket no está inicializado",
      });
    }

    // Obtener estadísticas básicas del socketManager
    const statsBasicas = socketManager.getStats();

    // Obtener estadísticas detalladas del ConnectionStateManager si está disponible
    let statsDetalladas = {};
    if (socketManager.connectionStateManager) {
      const estadoCompleto = socketManager.connectionStateManager.getEstadoCompleto();
      statsDetalladas = {
        cajerosDisponibles: estadoCompleto.estadisticas.cajerosDisponibles,
        cajerosOcupados: estadoCompleto.estadisticas.cajerosOcupados,
        transaccionesActivas: estadoCompleto.estadisticas.transaccionesActivas,
        ultimaActualizacion: estadoCompleto.estadisticas.ultimaActualizacion,
        detallesCajeros: estadoCompleto.cajeros,
        detallesJugadores: estadoCompleto.jugadores,
        detallesTransacciones: estadoCompleto.transacciones,
      };
    }

    // Obtener estadísticas del TransactionTimeoutManager si está disponible
    let timeoutStats = null;
    if (socketManager.transactionTimeoutManager) {
      timeoutStats = socketManager.transactionTimeoutManager.getStats();
    }

    res.json({
      conexiones: {
        jugadoresConectados: statsBasicas.jugadoresConectados || 0,
        cajerosConectados: statsBasicas.cajerosConectados || 0,
        botsConectados: statsBasicas.botsConectados || 0,
        totalConexiones: statsBasicas.totalConexiones || 0,
      },
      detalles: statsDetalladas,
      timeouts: timeoutStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error obteniendo estadísticas de conexión:", error);
    res.status(500).json({
      mensaje: "Error obteniendo estadísticas de conexión",
      error: error.message,
    });
  }
});

module.exports = router;
