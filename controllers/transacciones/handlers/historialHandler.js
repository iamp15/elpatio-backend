const Transaccion = require("../../models/Transaccion");

/**
 * Obtener historial de transacciones de un jugador
 */
async function obtenerHistorial(req, res) {
  try {
    const { jugadorId } = req.params;
    const { limite = 50, tipo, categoria, estado } = req.query;

    const filtros = { jugadorId };
    if (tipo) filtros.tipo = tipo;
    if (categoria) filtros.categoria = categoria;
    if (estado) filtros.estado = estado;

    const transacciones = await Transaccion.find(filtros)
      .sort({ createdAt: -1 })
      .limit(parseInt(limite))
      .populate("referenciaExterna.salaId", "nombre")
      .populate("cajeroId", "nombreCompleto")
      .populate("creadoPor", "nickname username")
      .lean();

    const saldoActual = await Transaccion.obtenerBalance(jugadorId);

    res.json({
      transacciones,
      total: transacciones.length,
      saldoActual,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo historial",
      error: error.message,
    });
  }
}

/**
 * Obtener estadísticas de transacciones
 */
async function obtenerEstadisticas(req, res) {
  try {
    const { jugadorId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    const filtros = { jugadorId };

    if (fechaInicio || fechaFin) {
      filtros.createdAt = {};
      if (fechaInicio) filtros.createdAt.$gte = new Date(fechaInicio);
      if (fechaFin) filtros.createdAt.$lte = new Date(fechaFin);
    }

    const estadisticas = await Transaccion.aggregate([
      { $match: filtros },
      {
        $group: {
          _id: { tipo: "$tipo", categoria: "$categoria" },
          total: { $sum: 1 },
          montoTotal: { $sum: "$monto" },
        },
      },
      {
        $sort: { "_id.tipo": 1, "_id.categoria": 1 },
      },
    ]);

    res.json({ estadisticas });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo estadísticas",
      error: error.message,
    });
  }
}

module.exports = {
  obtenerHistorial,
  obtenerEstadisticas,
};
