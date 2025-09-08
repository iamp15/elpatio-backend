const Log = require("../models/Log");

exports.obtenerLogs = async (req, res) => {
  try {
    const { rol, accion, desde, hasta, limite = 100 } = req.query;

    const filtro = {};

    if (rol) filtro.rol = rol;
    if (accion) filtro.accion = accion;
    if (desde || hasta) {
      filtro.createdAt = {};
      if (desde) filtro.createdAt.$gte = new Date(desde);
      if (hasta) filtro.createdAt.$lte = new Date(hasta);
    }

    const logs = await Log.find(filtro)
      .sort({ createdAt: -1 }) // más recientes primero
      .limit(parseInt(limite))
      .populate("usuario", "nombre email") // muestra nombre y email del usuario asociado si aplica
      .lean();

    res.status(200).json({
      total: logs.length,
      logs,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al obtener los logs",
      error: error.message,
    });
  }
};
