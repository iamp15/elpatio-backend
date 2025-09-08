const Pago = require("../models/Pago");
const Sala = require("../models/Sala");
const { registrarLog } = require("../utils/logHelper");

// Crear un nuevo pago (entrada o premio)
exports.crearPago = async (req, res) => {
  try {
    const { tipo, jugador, sala, cajero, monto, datosPagoJugador } = req.body;

    const nuevoPago = new Pago({
      tipo,
      jugador,
      sala,
      cajero,
      monto,
      datosPagoJugador: tipo === "premio" ? datosPagoJugador : undefined,
    });

    await nuevoPago.save();

    // Registrar log ANTES de la respuesta
    await registrarLog({
      accion: "Pago creado",
      usuario: req.user?._id || null,
      rol: req.user?.rol || "sistema",
      detalle: {
        pagoId: nuevoPago._id,
        tipo: nuevoPago.tipo,
        jugador: nuevoPago.jugador,
        sala: nuevoPago.sala,
        cajero: nuevoPago.cajero,
        monto: nuevoPago.monto,
      },
    });

    res.status(201).json({
      mensaje: "Pago creado exitosamente",
      pago: nuevoPago,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al crear el pago",
      error: error.message,
    });
  }
};

// Confirmar pago (usado por el cajero)
exports.confirmarPago = async (req, res) => {
  try {
    const { id } = req.params;

    const pago = await Pago.findById(id);
    if (!pago) {
      return res.status(404).json({ mensaje: "Pago no encontrado" });
    }

    // Verificar que la sala existe
    const sala = await Sala.findById(pago.sala);
    if (!sala) {
      return res.status(404).json({ mensaje: "Sala no encontrada" });
    }

    // Actualizar el pago
    pago.estado = pago.tipo === "entrada" ? "confirmado" : "completado";
    pago.confirmadoPorCajero = true;
    pago.fechaConfirmacion = new Date();

    // Actualizar la sala agregando el pago a pagosConfirmados
    if (!sala.pagosConfirmados.includes(pago._id)) {
      sala.pagosConfirmados.push(pago._id);
    }

    // Guardar ambos cambios
    await Promise.all([pago.save(), sala.save()]);

    // Registrar log ANTES de la respuesta
    await registrarLog({
      accion: "Pago confirmado por cajero",
      usuario: req.user?._id || null,
      rol: req.user?.rol || "cajero",
      detalle: {
        pagoId: pago._id,
        jugador: pago.jugador,
        tipo: pago.tipo,
        sala: pago.sala,
        monto: pago.monto,
        estadoAnterior: "pendiente",
        estadoNuevo: pago.estado,
      },
    });

    res.json({
      mensaje: "Pago confirmado correctamente",
      pago,
      sala,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al confirmar el pago",
      error: error.message,
    });
  }
};

// Rechazar pago (opcional)
exports.rechazarPago = async (req, res) => {
  try {
    const { id } = req.params;

    const pago = await Pago.findById(id);
    if (!pago) {
      return res.status(404).json({ mensaje: "Pago no encontrado" });
    }

    // Verificar que la sala existe
    const sala = await Sala.findById(pago.sala);
    if (!sala) {
      return res.status(404).json({ mensaje: "Sala no encontrada" });
    }

    pago.estado = "rechazado";
    pago.confirmadoPorCajero = false;
    pago.fechaConfirmacion = new Date();

    // Remover el pago de pagosConfirmados si estaba ahí
    sala.pagosConfirmados = sala.pagosConfirmados.filter(
      (pagoId) => pagoId.toString() !== pago._id.toString()
    );

    // Guardar ambos cambios
    await Promise.all([pago.save(), sala.save()]);

    // Registrar log ANTES de la respuesta
    await registrarLog({
      accion: "Pago rechazado por cajero",
      usuario: req.user?._id || null,
      rol: req.user?.rol || "cajero",
      detalle: {
        pagoId: pago._id,
        jugador: pago.jugador,
        tipo: pago.tipo,
        sala: pago.sala,
        monto: pago.monto,
        motivo: "rechazado por cajero",
      },
    });

    res.json({
      mensaje: "Pago rechazado correctamente",
      pago,
      sala,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al rechazar el pago",
      error: error.message,
    });
  }
};

// Obtener pagos por jugador
exports.obtenerPagosPorJugador = async (req, res) => {
  try {
    const { jugadorId } = req.params;

    const pagos = await Pago.find({ jugador: jugadorId })
      .populate("sala", "modo configuracion estado")
      .populate("cajero", "nombreCompleto");

    res.json(pagos);
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al obtener los pagos del jugador",
      error: error.message,
    });
  }
};

// Obtener todos los pagos pendientes asignados al cajero autenticado
exports.obtenerPagosPendientes = async (req, res) => {
  try {
    // Obtener el ID del cajero del token de autenticación
    const cajeroId = req.user.id || req.user._id;

    if (!cajeroId) {
      return res.status(400).json({
        mensaje: "No se pudo identificar al cajero",
        error: "ID de cajero no encontrado en el token",
      });
    }

    const pagos = await Pago.find({
      cajero: cajeroId,
      estado: "pendiente",
    })
      .populate("jugador", "nombreCompleto username telegramId")
      .populate("sala", "modo configuracion estado");

    if (pagos.length === 0) {
      return res.status(200).json({
        mensaje: "No hay pagos pendientes",
        cajeroId: cajeroId,
        pagos: [],
        total: 0,
      });
    }

    res.status(200).json({
      mensaje: `Se encontraron ${pagos.length} pagos pendientes`,
      cajeroId: cajeroId,
      pagos: pagos,
      total: pagos.length,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al obtener los pagos pendientes",
      error: error.message,
    });
  }
};
