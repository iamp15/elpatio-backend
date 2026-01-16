const Transaccion = require("../../models/Transaccion");
const Jugador = require("../../models/Jugador");
const websocketHelper = require("../../utils/websocketHelper");

/**
 * Crear solicitud de depósito/retiro (para cajero)
 */
async function crearSolicitudCajero(req, res) {
  try {
    const {
      jugadorId,
      tipo, // 'credito' para depósito, 'debito' para retiro
      categoria, // 'deposito' o 'retiro'
      monto,
      descripcion,
      metodoPago,
    } = req.body;

    // Validaciones básicas
    if (!["deposito", "retiro"].includes(categoria)) {
      return res.status(400).json({
        mensaje: "Categoría debe ser deposito o retiro",
      });
    }

    if (!["credito", "debito"].includes(tipo)) {
      return res.status(400).json({
        mensaje: "Tipo debe ser credito o debito",
      });
    }

    // Validar consistencia tipo-categoría
    if (
      (categoria === "deposito" && tipo !== "credito") ||
      (categoria === "retiro" && tipo !== "debito")
    ) {
      return res.status(400).json({
        mensaje: "Tipo y categoría no son consistentes",
      });
    }

    const jugador = await Jugador.findById(jugadorId);
    if (!jugador) {
      return res.status(404).json({ mensaje: "Jugador no encontrado" });
    }

    // Para retiros, validar saldo suficiente
    if (categoria === "retiro" && jugador.saldo < monto) {
      return res.status(400).json({
        mensaje: "Saldo insuficiente para el retiro",
      });
    }

    const transaccion = new Transaccion({
      jugadorId,
      telegramId: jugador.telegramId,
      tipo,
      categoria,
      monto,
      saldoAnterior: jugador.saldo,
      descripcion,
      referencia: Transaccion.generarReferencia(categoria, jugadorId),
      estado: "pendiente",
      metadata: {
        metodoPago: metodoPago,
        ipOrigen: req.ip,
      },
      creadoPor: req.user?._id,
    });

    await transaccion.save();

    // Emitir evento WebSocket si hay usuarios conectados
    websocketHelper.initialize(req.app.get("socketManager"));
    websocketHelper.logWebSocketStats("Nueva solicitud creada");

    // Solo emitir si es una transacción de depósito/retiro
    if (["deposito", "retiro"].includes(transaccion.categoria)) {
      await websocketHelper.emitNuevaSolicitudDeposito(transaccion, jugador);
    }

    res.status(201).json({
      mensaje: "Solicitud creada exitosamente",
      transaccion: {
        _id: transaccion._id,
        referencia: transaccion.referencia,
        tipo: transaccion.tipo,
        categoria: transaccion.categoria,
        monto: transaccion.monto,
        estado: transaccion.estado,
        fechaCreacion: transaccion.fechaCreacion,
        fechaVencimiento: transaccion.fechaVencimiento,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error creando solicitud",
      error: error.message,
    });
  }
}

module.exports = { crearSolicitudCajero };
