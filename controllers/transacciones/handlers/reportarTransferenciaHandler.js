/**
 * Handler para reportar transferencia de retiro (admin como cajero)
 * Permite al admin reportar que envió el dinero al jugador, igual que desde la app de cajeros
 */

const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const Cajero = require("../../../models/Cajero");
const mongoose = require("mongoose");
const { registrarLog } = require("../../../utils/logHelper");
const {
  crearNotificacionInterna,
} = require("../../../controllers/notificacionesController");
const {
  notificarBotRetiroCompletado,
} = require("../../../websocket/depositos/notificaciones/notificacionesBot");
const { actualizarSaldoCajero } = require("../../../utils/saldoCajeroHelper");
const websocketHelper = require("../../../utils/websocketHelper");
const { buscarJugadorConectado } = require("../../../websocket/depositos/utils/socketUtils");

/**
 * Reportar transferencia de retiro (solo admin, cuando se asignó como cajero)
 * PUT /api/transacciones/:transaccionId/reportar-transferencia
 */
async function reportarTransferencia(req, res) {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { transaccionId } = req.params;
    const { numeroReferencia, bancoOrigen, comprobanteUrl, notas } = req.body;

    // Solo admin puede usar este endpoint (asignándose como cajero desde el dashboard)
    if (!["admin", "superadmin"].includes(req.user?.rol)) {
      await session.abortTransaction();
      return res.status(403).json({
        mensaje: "Solo administradores pueden reportar transferencias desde el dashboard",
      });
    }

    // Obtener cajero del admin por email
    const adminEmail = req.user?.email;
    if (!adminEmail) {
      await session.abortTransaction();
      return res.status(400).json({
        mensaje: "No se pudo obtener el email del administrador",
      });
    }

    const cajero = await Cajero.findOne({
      email: adminEmail.toLowerCase(),
      estado: "activo",
    }).session(session);

    if (!cajero) {
      await session.abortTransaction();
      return res.status(404).json({
        mensaje:
          "No tienes una cuenta de cajero asociada. Asignate como cajero primero.",
      });
    }

    // Buscar la transacción
    const transaccion = await Transaccion.findById(transaccionId)
      .populate("jugadorId", "telegramId nickname firstName saldo")
      .session(session);

    if (!transaccion) {
      await session.abortTransaction();
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    if (transaccion.categoria !== "retiro") {
      await session.abortTransaction();
      return res.status(400).json({
        mensaje: "Solo se pueden reportar transferencias de retiros",
      });
    }

    if (transaccion.estado !== "en_proceso") {
      await session.abortTransaction();
      return res.status(400).json({
        mensaje: `La transacción debe estar en proceso. Estado actual: ${transaccion.estado}`,
      });
    }

    // Verificar que el cajero asignado sea el del admin
    const cajeroAsignadoId = transaccion.cajeroId?.toString?.() || transaccion.cajeroId;
    if (cajeroAsignadoId !== cajero._id.toString()) {
      await session.abortTransaction();
      return res.status(403).json({
        mensaje: "Solo puedes reportar transferencias de transacciones asignadas a ti",
      });
    }

    // Validar datos mínimos
    if (!numeroReferencia || !bancoOrigen) {
      await session.abortTransaction();
      return res.status(400).json({
        mensaje: "Número de referencia y banco de origen son requeridos",
      });
    }

    // Actualizar info de pago
    transaccion.fechaConfirmacionCajero = new Date();
    transaccion.infoPago = {
      ...transaccion.infoPago,
      comprobanteUrl: comprobanteUrl || transaccion.infoPago?.comprobanteUrl,
      numeroReferencia: numeroReferencia,
      bancoOrigen: bancoOrigen,
      notasCajero: notas || "Transferencia enviada correctamente",
    };
    transaccion.cambiarEstado("confirmada");
    await transaccion.save({ session });

    // Actualizar saldo del jugador
    const jugadorConSesion = await Jugador.findById(transaccion.jugadorId._id || transaccion.jugadorId).session(session);
    if (!jugadorConSesion) {
      throw new Error("Jugador no encontrado");
    }
    const saldoNuevo = jugadorConSesion.saldo - transaccion.monto;

    await Jugador.findByIdAndUpdate(
      transaccion.jugadorId._id || transaccion.jugadorId,
      { saldo: saldoNuevo },
      { session }
    );

    // Actualizar saldo del cajero
    await actualizarSaldoCajero(
      transaccion.cajeroId,
      -transaccion.monto,
      "retiro",
      transaccion._id,
      `Retiro de ${(transaccion.monto / 100).toFixed(2)} Bs procesado exitosamente`,
      session
    );

    transaccion.cambiarEstado("completada");
    transaccion.saldoNuevo = saldoNuevo;
    transaccion.fechaProcesamiento = new Date();
    await transaccion.save({ session });

    await session.commitTransaction();

    // Registrar log
    await registrarLog({
      accion: "Retiro completado (admin reportó transferencia)",
      usuario: req.user?._id,
      rol: req.user?.rol || "admin",
      detalle: {
        transaccionId: transaccion._id,
        jugadorId: transaccion.jugadorId._id || transaccion.jugadorId,
        cajeroId: cajero._id,
        monto: transaccion.monto,
        saldoNuevo,
      },
    });

    // Emitir eventos WebSocket
    websocketHelper.initialize(req.app.get("socketManager"));
    const socketManager = req.app.get("socketManager");
    const io = socketManager?.io;

    if (io) {
      const notificacion = {
        transaccionId: transaccion._id,
        monto: transaccion.monto,
        saldoNuevo: saldoNuevo,
        saldoAnterior: transaccion.saldoAnterior,
        estado: transaccion.estado,
        comprobanteUrl: transaccion.infoPago?.comprobanteUrl,
        timestamp: new Date().toISOString(),
      };

      io.to(`transaccion-${transaccionId}`).emit("retiro-completado", {
        ...notificacion,
        target: "cajero",
      });

      const telegramIdJugador = transaccion.telegramId || (jugadorConSesion && jugadorConSesion.telegramId);
    const jugadorSocketId =
      socketManager && telegramIdJugador
        ? buscarJugadorConectado(socketManager, telegramIdJugador)
        : null;
    if (jugadorSocketId) {
        io.to(jugadorSocketId).emit("retiro-completado", {
          ...notificacion,
          target: "jugador",
          mensaje: "¡Retiro completado exitosamente!",
          saldoAnterior: transaccion.saldoAnterior,
        });
      }
    }

    // Notificación interna y al bot
    const jugador = await Jugador.findById(transaccion.jugadorId._id || transaccion.jugadorId);
    if (jugador) {
      await crearNotificacionInterna({
        destinatarioId: jugador._id,
        destinatarioTipo: "jugador",
        telegramId: jugador.telegramId,
        tipo: "retiro_aprobado",
        titulo: "Retiro Completado ✅",
        mensaje: `Tu retiro de ${(transaccion.monto / 100).toFixed(2)} Bs se completó correctamente.\n\nNuevo saldo: ${(saldoNuevo / 100).toFixed(2)} Bs`,
        datos: {
          transaccionId: transaccion._id.toString(),
          monto: transaccion.monto,
          saldoNuevo,
          comprobanteUrl: transaccion.infoPago?.comprobanteUrl,
        },
        eventoId: `retiro-completado-${transaccion._id}`,
      });

      if (socketManager) {
        const context = {
          socketManager,
          io: socketManager.io,
          roomsManager: socketManager.roomsManager,
        };
        await notificarBotRetiroCompletado(
          context,
          transaccion,
          jugador,
          saldoNuevo,
          transaccion.infoPago?.comprobanteUrl
        );
      }
    }

    await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);

    res.json({
      mensaje: "Transferencia reportada exitosamente",
      transaccion: {
        _id: transaccion._id,
        estado: transaccion.estado,
        saldoNuevo: saldoNuevo,
        fechaProcesamiento: transaccion.fechaProcesamiento,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ Error reportando transferencia:", error);
    res.status(500).json({
      mensaje: "Error reportando transferencia",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
}

module.exports = {
  reportarTransferencia,
};
