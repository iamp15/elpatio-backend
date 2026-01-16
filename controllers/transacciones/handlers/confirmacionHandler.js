const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const mongoose = require("mongoose");
const websocketHelper = require("../../../utils/websocketHelper");
const { registrarLog } = require("../../../utils/logHelper");

/**
 * Confirmar pago por el usuario (solo para depósitos/retiros)
 */
async function confirmarPagoUsuario(req, res) {
  try {
    const { id } = req.params;
    const {
      bancoOrigen,
      telefonoOrigen,
      numeroReferencia,
      fechaPago,
      metodoPago,
    } = req.body;

    const transaccion = await Transaccion.findById(id);
    if (!transaccion) {
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    if (transaccion.estado !== "en_proceso") {
      return res.status(400).json({
        mensaje: "Solo se pueden confirmar pagos en transacciones en proceso",
      });
    }

    // Actualizar información de pago
    transaccion.infoPago = {
      ...transaccion.infoPago,
      bancoOrigen,
      telefonoOrigen,
      numeroReferencia,
      fechaPago,
      metodoPago,
    };

    // Cambiar estado a "realizada" cuando el usuario confirma que hizo el pago
    transaccion.cambiarEstado("realizada");

    await transaccion.save();

    // Emitir evento WebSocket si hay usuarios conectados
    websocketHelper.initialize(req.app.get("socketManager"));
    websocketHelper.logWebSocketStats("Pago confirmado por usuario");

    // Solo emitir si es una transacción de depósito/retiro
    if (["deposito", "retiro"].includes(transaccion.categoria)) {
      await websocketHelper.emitPagoConfirmadoUsuario(transaccion);
    }

    res.json({
      mensaje: "Pago confirmado por el usuario",
      transaccion: {
        _id: transaccion._id,
        estado: transaccion.estado,
        infoPago: transaccion.infoPago,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error confirmando pago",
      error: error.message,
    });
  }
}

/**
 * Confirmar transacción por cajero
 */
async function confirmarPorCajero(req, res) {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { transaccionId } = req.params;
    const datosConfirmacion = req.body;

    // Obtener transacción
    const transaccion = await Transaccion.findById(transaccionId).session(
      session
    );
    if (!transaccion) {
      await session.abortTransaction();
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    // Verificar que la transacción esté en estado "realizada" (usuario ya reportó el pago)
    if (transaccion.estado !== "realizada") {
      await session.abortTransaction();
      return res.status(400).json({
        mensaje: `Solo se pueden confirmar transacciones realizadas por el usuario. Estado actual: ${transaccion.estado}`,
      });
    }

    // Actualizar información de pago
    transaccion.fechaConfirmacionCajero = new Date();
    transaccion.infoPago = {
      metodoPago: datosConfirmacion.metodoPago,
      numeroReferencia: datosConfirmacion.numeroReferencia,
      bancoOrigen: datosConfirmacion.bancoOrigen,
      bancoDestino: datosConfirmacion.bancoDestino,
      comprobanteUrl: datosConfirmacion.comprobanteUrl,
      notasCajero: datosConfirmacion.notas,
      telefonoOrigen: datosConfirmacion.telefonoOrigen,
      cedulaOrigen: datosConfirmacion.cedulaOrigen,
    };

    transaccion.cambiarEstado("confirmada");
    await transaccion.save({ session });

    // Procesar saldo del jugador
    const jugador = await Jugador.findById(transaccion.jugadorId).session(
      session
    );
    let saldoNuevo;

    if (transaccion.tipo === "debito") {
      saldoNuevo = jugador.saldo - transaccion.monto;
    } else {
      saldoNuevo = jugador.saldo + transaccion.monto;
    }

    await Jugador.findByIdAndUpdate(
      transaccion.jugadorId,
      { saldo: saldoNuevo },
      { session }
    );

    // Completar transacción
    transaccion.cambiarEstado("completada");
    transaccion.saldoNuevo = saldoNuevo;
    transaccion.fechaProcesamiento = new Date();
    await transaccion.save({ session });

    // Registrar log
    await registrarLog(
      {
        accion: `Transacción ${transaccion.categoria} confirmada`,
        usuario: req.user?._id,
        rol: req.user?.rol || "cajero",
        detalle: {
          transaccionId: transaccion._id,
          jugadorId: transaccion.jugadorId,
          monto: transaccion.monto,
          saldoNuevo: saldoNuevo,
          cajeroId: transaccion.cajeroId,
        },
      },
      session
    );

    await session.commitTransaction();

    // Emitir evento WebSocket si hay usuarios conectados
    websocketHelper.initialize(req.app.get("socketManager"));
    websocketHelper.logWebSocketStats("Transacción completada por cajero");

    // Solo emitir si es una transacción de depósito/retiro
    if (["deposito", "retiro"].includes(transaccion.categoria)) {
      await websocketHelper.emitTransaccionCompletada(transaccion, jugador);
    }

    // Limpiar room de transacción cuando finaliza
    await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);

    res.json({
      mensaje: "Transacción confirmada y procesada exitosamente",
      transaccion: {
        _id: transaccion._id,
        estado: transaccion.estado,
        saldoNuevo: saldoNuevo,
        fechaProcesamiento: transaccion.fechaProcesamiento,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      mensaje: "Error confirmando transacción",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
}

module.exports = {
  confirmarPagoUsuario,
  confirmarPorCajero,
};
