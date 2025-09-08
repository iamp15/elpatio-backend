const Jugador = require("../models/Jugador");
const Cajero = require("../models/Cajero");
const Sala = require("../models/Sala");
const Pago = require("../models/Pago");

// Función para obtener estadísticas globales (sin filtros de fecha)
exports.obtenerStatsGlobales = async (req, res) => {
  try {
    const [
      totalJugadores,
      totalCajeros,
      totalSalas,
      totalPagos,
      pagosConfirmados,
      pagosPendientes,
      montoEntradas,
      montoPremios,
    ] = await Promise.all([
      Jugador.countDocuments(),
      Cajero.countDocuments(),
      Sala.countDocuments(),
      Pago.countDocuments(),
      Pago.countDocuments({ estado: "confirmado" }),
      Pago.countDocuments({ estado: "pendiente" }),
      Pago.aggregate([
        { $match: { tipo: "entrada", estado: "confirmado" } },
        { $group: { _id: null, total: { $sum: "$monto" } } },
      ]),
      Pago.aggregate([
        { $match: { tipo: "premio", estado: "completado" } },
        { $group: { _id: null, total: { $sum: "$monto" } } },
      ]),
    ]);

    const totalEntradas = montoEntradas[0]?.total || 0;
    const totalPremios = montoPremios[0]?.total || 0;

    res.status(200).json({
      jugadores: totalJugadores,
      cajeros: totalCajeros,
      salas: totalSalas,
      pagos: {
        total: totalPagos,
        confirmados: pagosConfirmados,
        pendientes: pagosPendientes,
      },
      ingresos: totalEntradas,
      egresos: totalPremios,
      balance: totalEntradas - totalPremios,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al obtener las estadísticas",
      error: error.message,
    });
  }
};

// Función para obtener estadísticas por fecha
exports.obtenerStatsPorFecha = async (req, res) => {
  try {
    const { inicio, fin } = req.query;

    // Validar fechas
    const fechaInicio = inicio ? new Date(inicio) : null;
    const fechaFin = fin ? new Date(fin) : null;

    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      return res.status(400).json({
        mensaje: "La fecha de inicio no puede ser mayor que la fecha de fin",
      });
    }

    // Crear filtros de fecha para cada modelo
    const filtroFechaPagos =
      fechaInicio && fechaFin
        ? { fechaSolicitud: { $gte: fechaInicio, $lte: fechaFin } }
        : {};

    const filtroFechaSalas =
      fechaInicio && fechaFin
        ? { creadaEn: { $gte: fechaInicio, $lte: fechaFin } }
        : {};

    const [
      totalJugadores,
      totalCajeros,
      totalSalas,
      totalPagos,
      pagosConfirmados,
      pagosPendientes,
      montoEntradas,
      montoPremios,
    ] = await Promise.all([
      Jugador.countDocuments(), // Jugadores siempre se cuentan globalmente
      Cajero.countDocuments(), // Cajeros siempre se cuentan globalmente
      Sala.countDocuments(filtroFechaSalas),
      Pago.countDocuments(filtroFechaPagos),
      Pago.countDocuments({
        ...filtroFechaPagos,
        estado: "confirmado",
      }),
      Pago.countDocuments({
        ...filtroFechaPagos,
        estado: "pendiente",
      }),
      Pago.aggregate([
        {
          $match: {
            tipo: "entrada",
            estado: "confirmado",
            ...filtroFechaPagos,
          },
        },
        { $group: { _id: null, total: { $sum: "$monto" } } },
      ]),
      Pago.aggregate([
        {
          $match: {
            tipo: "premio",
            estado: "completado",
            ...filtroFechaPagos,
          },
        },
        { $group: { _id: null, total: { $sum: "$monto" } } },
      ]),
    ]);

    const totalEntradas = montoEntradas[0]?.total || 0;
    const totalPremios = montoPremios[0]?.total || 0;

    res.status(200).json({
      jugadores: totalJugadores,
      cajeros: totalCajeros,
      salas: totalSalas,
      pagos: {
        total: totalPagos,
        confirmados: pagosConfirmados,
        pendientes: pagosPendientes,
      },
      ingresos: totalEntradas,
      egresos: totalPremios,
      balance: totalEntradas - totalPremios,
      rango:
        fechaInicio && fechaFin
          ? {
              desde: fechaInicio,
              hasta: fechaFin,
            }
          : "global",
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al obtener estadísticas",
      error: error.message,
    });
  }
};
