const express = require("express");
const router = express.Router();
const transaccionesController = require("../controllers/transaccionController");
const verificarMinimo = require("../middlewares/verificarMinimo");
const auth = require("../middlewares/auth"); // autenticación general

// ===== RUTAS PÚBLICAS/JUGADORES =====

/**
 * Crear solicitud de depósito o retiro
 * POST /api/transacciones/solicitud
 */
router.post(
  "/solicitud",
  auth,
  verificarMinimo("bot"),
  transaccionesController.crearSolicitudCajero
);

//Confirmar pago por usuario
router.put(
  "/:id/confirmar-pago-usuario",
  auth,
  verificarMinimo("bot"),
  transaccionesController.confirmarPagoUsuario
);

/**
 * Obtener historial de transacciones de un jugador
 * GET /api/transacciones/jugador/:jugadorId/historial
 */
router.get(
  "/jugador/:jugadorId/historial",
  auth,
  transaccionesController.obtenerHistorial
);

//Procesar transacción interna
router.post(
  "/procesar-automatica",
  auth,
  verificarMinimo("bot"),
  transaccionesController.procesarTransaccionAutomatica
);

/**
 * Obtener estadísticas de transacciones de un jugador
 * GET /api/transacciones/jugador/:jugadorId/estadisticas
 */
router.get(
  "/jugador/:jugadorId/estadisticas",
  auth,
  transaccionesController.obtenerEstadisticas
);

// ===== RUTAS PARA ADMINISTRADORES =====

/**
 * Obtener cajeros disponibles
 * GET /api/transacciones/cajeros-disponibles
 */
router.get(
  "/cajeros-disponibles",
  auth,
  verificarMinimo("admin"),
  transaccionesController.obtenerCajerosDisponibles
);

/**
 * Obtener transacciones pendientes para cajeros
 * GET /api/transacciones/pendientes-cajero
 */
router.get(
  "/pendientes-cajero",
  auth,
  verificarMinimo("cajero"),
  transaccionesController.obtenerPendientesCajero
);

/**
 * Asignar cajero a una transacción
 * PUT /api/transacciones/:transaccionId/asignar-cajero
 */
router.put(
  "/:transaccionId/asignar-cajero",
  auth,
  verificarMinimo("admin"),
  transaccionesController.asignarCajero
);

// ===== RUTAS PARA CAJEROS =====

/**
 * Confirmar transacción por cajero
 * PUT /api/transacciones/:transaccionId/confirmar
 */
router.put(
  "/:transaccionId/confirmar",
  auth,
  verificarMinimo("cajero"),
  transaccionesController.confirmarPorCajero
);

/**
 * Rechazar transacción
 * PUT /api/transacciones/:transaccionId/rechazar
 */
router.put(
  "/:transaccionId/rechazar",
  auth,
  verificarMinimo("cajero"),
  transaccionesController.rechazarTransaccion
);

// ===== RUTAS ADMINISTRATIVAS ADICIONALES =====

/**
 * Obtener todas las transacciones con filtros (solo admins)
 * GET /api/transacciones/admin/todas
 */
router.get("/admin/todas", auth, verificarMinimo("admin"), async (req, res) => {
  try {
    const {
      limite = 100,
      pagina = 1,
      tipo,
      categoria,
      estado,
      cajeroId,
      fechaInicio,
      fechaFin,
    } = req.query;

    const filtros = {};
    if (tipo) filtros.tipo = tipo;
    if (categoria) filtros.categoria = categoria;
    if (estado) filtros.estado = estado;
    if (cajeroId) filtros.cajeroId = cajeroId;

    if (fechaInicio || fechaFin) {
      filtros.createdAt = {};
      if (fechaInicio) filtros.createdAt.$gte = new Date(fechaInicio);
      if (fechaFin) filtros.createdAt.$lte = new Date(fechaFin);
    }

    const skip = (parseInt(pagina) - 1) * parseInt(limite);

    const [transacciones, total] = await Promise.all([
      require("../models/Transaccion")
        .find(filtros)
        .populate("jugadorId", "username nickname telegramId")
        .populate("cajeroId", "nombreCompleto email")
        .populate("creadoPor", "username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limite))
        .lean(),
      require("../models/Transaccion").countDocuments(filtros),
    ]);

    res.json({
      transacciones,
      paginacion: {
        total,
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        totalPaginas: Math.ceil(total / parseInt(limite)),
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo transacciones",
      error: error.message,
    });
  }
});

/**
 * Obtener estadísticas generales del sistema
 * GET /api/transacciones/admin/estadisticas-sistema
 */
router.get(
  "/admin/estadisticas-sistema",
  auth,
  verificarMinimo("admin"),
  async (req, res) => {
    try {
      const { fechaInicio, fechaFin } = req.query;

      const filtros = {};
      if (fechaInicio || fechaFin) {
        filtros.createdAt = {};
        if (fechaInicio) filtros.createdAt.$gte = new Date(fechaInicio);
        if (fechaFin) filtros.createdAt.$lte = new Date(fechaFin);
      }

      const estadisticas = await require("../models/Transaccion").aggregate([
        { $match: filtros },
        {
          $group: {
            _id: {
              categoria: "$categoria",
              estado: "$estado",
            },
            total: { $sum: 1 },
            montoTotal: { $sum: "$monto" },
            montoPromedio: { $avg: "$monto" },
          },
        },
        {
          $sort: { "_id.categoria": 1, "_id.estado": 1 },
        },
      ]);

      // Resumen por estado
      const resumenEstados = await require("../models/Transaccion").aggregate([
        { $match: filtros },
        {
          $group: {
            _id: "$estado",
            total: { $sum: 1 },
            montoTotal: { $sum: "$monto" },
          },
        },
      ]);

      // Transacciones por cajero
      const transaccionesPorCajero =
        await require("../models/Transaccion").aggregate([
          {
            $match: {
              ...filtros,
              cajeroId: { $exists: true },
            },
          },
          {
            $group: {
              _id: "$cajeroId",
              total: { $sum: 1 },
              montoTotal: { $sum: "$monto" },
              completadas: {
                $sum: { $cond: [{ $eq: ["$estado", "completada"] }, 1, 0] },
              },
            },
          },
          {
            $lookup: {
              from: "cajeros",
              localField: "_id",
              foreignField: "_id",
              as: "cajero",
            },
          },
          {
            $unwind: "$cajero",
          },
          {
            $project: {
              cajeroNombre: "$cajero.nombreCompleto",
              total: 1,
              montoTotal: 1,
              completadas: 1,
              efectividad: {
                $multiply: [{ $divide: ["$completadas", "$total"] }, 100],
              },
            },
          },
        ]);

      res.json({
        estadisticasDetalladas: estadisticas,
        resumenEstados,
        transaccionesPorCajero,
      });
    } catch (error) {
      res.status(500).json({
        mensaje: "Error obteniendo estadísticas del sistema",
        error: error.message,
      });
    }
  }
);

/**
 * Obtener detalles de una transacción específica
 * GET /api/transacciones/:transaccionId
 */
router.get("/:transaccionId", auth, async (req, res) => {
  try {
    const { transaccionId } = req.params;

    const transaccion = await require("../models/Transaccion")
      .findById(transaccionId)
      .populate("jugadorId", "username nickname telegramId email")
      .populate(
        "cajeroId",
        "nombreCompleto email telefonoContacto datosPagoMovil"
      )
      .populate("creadoPor", "username email")
      .populate("referenciaExterna.salaId", "nombre")
      .lean();

    if (!transaccion) {
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    // Verificar permisos: admin, cajero asignado, o jugador propietario
    const esAdmin = ["admin", "superadmin"].includes(req.user?.rol);
    const esCajeroAsignado =
      transaccion.cajeroId &&
      transaccion.cajeroId._id.toString() === req.user?._id?.toString();
    const esJugadorPropietario =
      transaccion.jugadorId._id.toString() === req.user?._id?.toString();

    if (!esAdmin && !esCajeroAsignado && !esJugadorPropietario) {
      return res
        .status(403)
        .json({ mensaje: "No tienes permisos para ver esta transacción" });
    }

    res.json({ transaccion });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo detalles de transacción",
      error: error.message,
    });
  }
});

module.exports = router;
