const Cajero = require("../../../models/Cajero");
const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const websocketHelper = require("../../../utils/websocketHelper");
const { registrarLog } = require("../../../utils/logHelper");

/**
 * Obtener cajeros disponibles para asignar
 */
async function obtenerCajerosDisponibles(req, res) {
  try {
    const cajeros = await Cajero.find(
      { estado: "activo" },
      "nombreCompleto email telefonoContacto datosPagoMovil"
    ).sort({ nombreCompleto: 1 });

    res.json({
      cajeros,
      total: cajeros.length,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo cajeros disponibles",
      error: error.message,
    });
  }
}

/**
 * Asignar cajero a transacción
 */
async function asignarCajero(req, res) {
  try {
    const { transaccionId } = req.params;

    // Si es un cajero autenticado, usar su ID
    // Si es un admin, permitir especificar cajeroId en el body
    const cajeroId =
      req.user.rol === "cajero" ? req.user.id : req.body.cajeroId;

    if (!cajeroId) {
      return res.status(400).json({ mensaje: "ID del cajero requerido" });
    }

    // Validar transacción
    const transaccion = await Transaccion.findById(transaccionId);
    if (!transaccion) {
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    if (!["deposito", "retiro"].includes(transaccion.categoria)) {
      return res.status(400).json({
        mensaje: "Solo se pueden asignar cajeros a depósitos y retiros",
      });
    }

    if (transaccion.estado !== "pendiente") {
      return res.status(400).json({
        mensaje: "Solo se pueden asignar cajeros a transacciones pendientes",
      });
    }

    // Validar cajero
    const cajero = await Cajero.findById(cajeroId);
    if (!cajero || cajero.estado !== "activo") {
      return res.status(400).json({ mensaje: "El cajero no está disponible" });
    }

    // Asignar cajero
    transaccion.cajeroId = cajeroId;
    transaccion.fechaAsignacionCajero = new Date();
    transaccion.cambiarEstado("en_proceso");
    await transaccion.save();

    // Registrar log
    await registrarLog({
      accion: "Cajero asignado a transacción",
      usuario: req.user?._id,
      rol: req.user?.rol || "admin",
      detalle: {
        transaccionId: transaccion._id,
        cajeroId: cajero._id,
        categoria: transaccion.categoria,
      },
    });

    // Emitir evento WebSocket si hay usuarios conectados
    websocketHelper.initialize(req.app.get("socketManager"));
    websocketHelper.logWebSocketStats("Cajero asignado");

    // Solo emitir si es una transacción de depósito/retiro
    if (["deposito", "retiro"].includes(transaccion.categoria)) {
      // Obtener datos del jugador para la notificación
      const jugador = await Jugador.findById(transaccion.jugadorId);
      if (jugador) {
        await websocketHelper.emitCajeroAsignado(transaccion, cajero);
      }
    }

    res.json({
      mensaje: "Cajero asignado exitosamente",
      transaccion: {
        _id: transaccion._id,
        estado: transaccion.estado,
        fechaAsignacion: transaccion.fechaAsignacionCajero,
      },
      cajero: {
        _id: cajero._id,
        nombreCompleto: cajero.nombreCompleto,
        email: cajero.email,
        telefonoContacto: cajero.telefonoContacto,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error asignando cajero",
      error: error.message,
    });
  }
}

module.exports = {
  obtenerCajerosDisponibles,
  asignarCajero,
};
