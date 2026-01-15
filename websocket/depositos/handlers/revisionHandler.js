/**
 * Handler para gestión de revisiones administrativas
 */

const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const mongoose = require("mongoose");
const { registrarLog } = require("../../../utils/logHelper");
const {
  crearNotificacionInterna,
} = require("../../../controllers/notificacionesController");

/**
 * Referir transacción a administrador
 * Evento: 'referir-a-admin'
 * @param {Object} context - Contexto con socketManager, io, roomsManager, processingTransactions
 * @param {Object} socket - Socket del cajero
 * @param {Object} data - Datos de la referencia
 */
async function referirAAdmin(context, socket, data) {
  const session = await mongoose.startSession();

  try {
    console.log("🔍 [DEPOSITO] Referir a admin:", data);

    const { transaccionId, motivo, descripcion } = data;

    // Validar datos requeridos
    if (!transaccionId) {
      socket.emit("error", {
        message: "ID de transacción requerido",
      });
      return;
    }

    // Validar que el socket esté autenticado como cajero
    if (!socket.userType || socket.userType !== "cajero") {
      socket.emit("error", {
        message: "Solo los cajeros pueden referir transacciones",
      });
      return;
    }

    // Verificar si ya se está procesando esta transacción
    if (context.processingTransactions.has(transaccionId)) {
      socket.emit("error", {
        message: "La transacción ya está siendo procesada",
      });
      return;
    }

    // Marcar como procesando
    context.processingTransactions.add(transaccionId);

    await session.startTransaction();

    // Buscar la transacción
    const transaccion = await Transaccion.findById(transaccionId).session(
      session
    );

    if (!transaccion) {
      await session.abortTransaction();
      context.processingTransactions.delete(transaccionId);
      socket.emit("error", {
        message: "Transacción no encontrada",
      });
      return;
    }

    // Verificar que la transacción esté en estado "realizada"
    if (transaccion.estado !== "realizada") {
      await session.abortTransaction();
      context.processingTransactions.delete(transaccionId);
      socket.emit("error", {
        message: `La transacción debe estar en estado "realizada". Estado actual: ${transaccion.estado}`,
      });
      return;
    }

    // Cambiar estado a requiere_revision_admin
    transaccion.cambiarEstado("requiere_revision_admin");

    // Guardar información del motivo
    transaccion.motivoRechazo = {
      categoria: "pago_no_recibido",
      descripcionDetallada:
        descripcion || motivo || "Requiere revisión administrativa",
      fechaRechazo: new Date(),
    };

    await transaccion.save({ session });
    await session.commitTransaction();

    console.log(
      `⚠️ [DEPOSITO] Transacción ${transaccionId} referida a admin`
    );

    // Notificar al cajero
    socket.emit("transaccion-referida-admin", {
      transaccionId: transaccion._id,
      mensaje: "La transacción ha sido referida a un administrador",
      timestamp: new Date().toISOString(),
    });

    // Notificar al jugador
    context.io
      .to(`transaccion-${transaccionId}`)
      .emit("transaccion-en-revision", {
        transaccionId: transaccion._id,
        mensaje:
          "Tu transacción está siendo revisada por un administrador. Te contactaremos pronto.",
        timestamp: new Date().toISOString(),
      });

    // Crear notificación para el jugador
    try {
      const jugador = await Jugador.findById(transaccion.jugadorId);
      if (jugador) {
        await crearNotificacionInterna({
          destinatarioId: jugador._id,
          destinatarioTipo: "jugador",
          telegramId: jugador.telegramId,
          tipo: "transaccion_en_revision",
          titulo: "Transacción en Revisión ⏳",
          mensaje: `Tu depósito de ${(transaccion.monto / 100).toFixed(
            2
          )} Bs está siendo revisado por un administrador. Te contactaremos pronto para resolver cualquier inconveniente.`,
          datos: {
            transaccionId: transaccion._id.toString(),
            monto: transaccion.monto,
          },
          eventoId: `transaccion-revision-${transaccion._id}`,
        });
      }
    } catch (error) {
      console.error(
        "❌ Error creando notificación para jugador:",
        error.message
      );
    }

    // Registrar log
    await registrarLog({
      accion: "Transacción referida a administrador",
      usuario: socket.cajeroId,
      rol: "cajero",
      detalle: {
        transaccionId: transaccion._id,
        jugadorId: transaccion.jugadorId,
        motivo: descripcion || motivo,
        socketId: socket.id,
      },
    });

    // Limpiar room de transacción cuando finaliza (requiere_revision_admin es estado final)
    const websocketHelper = require("../../../utils/websocketHelper");
    websocketHelper.initialize(context.socketManager);
    await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);

    context.processingTransactions.delete(transaccionId);
    await session.endSession();
  } catch (error) {
    await session.abortTransaction();
    await session.endSession();
    console.error("❌ [DEPOSITO] Error en referirAAdmin:", error);
    context.processingTransactions.delete(data.transaccionId);
    socket.emit("error", {
      message: "Error interno del servidor",
      details: error.message,
    });
  }
}

/**
 * Solicitar revisión administrativa de una transacción rechazada (desde jugador)
 * Evento: 'solicitar-revision-admin'
 * @param {Object} context - Contexto con socketManager, io, roomsManager
 * @param {Object} socket - Socket del jugador
 * @param {Object} data - Datos de la solicitud
 */
async function solicitarRevisionAdmin(context, socket, data) {
  const session = await mongoose.startSession();

  try {
    console.log("📞 [DEPOSITO] Solicitar revisión admin:", data);

    const { transaccionId, motivo } = data;

    // Validar datos requeridos
    if (!transaccionId) {
      socket.emit("error", {
        message: "ID de transacción requerido",
      });
      return;
    }

    // Validar que el socket esté autenticado como jugador
    if (!socket.userType || socket.userType !== "jugador") {
      socket.emit("error", {
        message: "Solo los jugadores pueden solicitar revisión",
      });
      return;
    }

    await session.startTransaction();

    // Buscar la transacción
    const transaccion = await Transaccion.findById(transaccionId).session(
      session
    );

    if (!transaccion) {
      await session.abortTransaction();
      socket.emit("error", {
        message: "Transacción no encontrada",
      });
      return;
    }

    // Verificar que la transacción esté rechazada
    if (transaccion.estado !== "rechazada") {
      await session.abortTransaction();
      socket.emit("error", {
        message: `Solo se pueden solicitar revisiones de transacciones rechazadas. Estado actual: ${transaccion.estado}`,
      });
      return;
    }

    // Verificar que el jugador sea el dueño de la transacción
    const jugadorId = socket.jugadorId || socket.userId;
    if (transaccion.jugadorId.toString() !== jugadorId.toString()) {
      await session.abortTransaction();
      socket.emit("error", {
        message: "No tienes permiso para solicitar revisión de esta transacción",
      });
      return;
    }

    // Cambiar estado a requiere_revision_admin
    transaccion.cambiarEstado("requiere_revision_admin");

    // Agregar nota de solicitud de revisión
    if (!transaccion.motivoRechazo) {
      transaccion.motivoRechazo = {};
    }
    transaccion.motivoRechazo.solicitudRevision = {
      fecha: new Date(),
      motivo: motivo || "El jugador solicita revisión del depósito rechazado",
      solicitadoPor: "jugador",
    };

    await transaccion.save({ session });
    await session.commitTransaction();

    console.log(
      `📞 [DEPOSITO] Transacción ${transaccionId} enviada a revisión administrativa por solicitud del jugador`
    );

    // Notificar al jugador
    socket.emit("revision-solicitada", {
      transaccionId: transaccion._id,
      mensaje: "Tu solicitud de revisión ha sido enviada. Un administrador revisará tu caso pronto.",
      timestamp: new Date().toISOString(),
    });

    // Notificar a la room de la transacción
    context.io
      .to(`transaccion-${transaccionId}`)
      .emit("transaccion-en-revision", {
        transaccionId: transaccion._id,
        mensaje:
          "Tu transacción está siendo revisada por un administrador. Te contactaremos pronto.",
        timestamp: new Date().toISOString(),
      });

    // Crear notificación para administradores
    try {
      const Admin = require("../../../models/Admin");
      const admins = await Admin.find({ estado: "activo" });

      for (const admin of admins) {
        await crearNotificacionInterna({
          destinatarioId: admin._id,
          destinatarioTipo: "admin",
          tipo: "revision_solicitada",
          titulo: "Revisión Solicitada 📞",
          mensaje: `Un jugador solicitó revisión de depósito rechazado. Transacción: ${transaccion.referencia}`,
          datos: {
            transaccionId: transaccion._id.toString(),
            jugadorId: transaccion.jugadorId.toString(),
            motivo: motivo || "El jugador solicita revisión",
          },
          eventoId: `revision-solicitada-${transaccion._id}`,
        });
      }
    } catch (error) {
      console.error("❌ Error creando notificaciones para admins:", error);
    }

    // Registrar log
    await registrarLog({
      accion: "Revisión administrativa solicitada por jugador",
      usuario: jugadorId,
      rol: "jugador",
      detalle: {
        transaccionId: transaccion._id,
        motivo: motivo || "El jugador solicita revisión",
        socketId: socket.id,
      },
    });

    // Limpiar room de transacción cuando finaliza
    const websocketHelper = require("../../../utils/websocketHelper");
    websocketHelper.initialize(context.socketManager);
    await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);

    await session.endSession();
  } catch (error) {
    await session.abortTransaction();
    await session.endSession();
    console.error("❌ [DEPOSITO] Error en solicitarRevisionAdmin:", error);
    socket.emit("error", {
      message: "Error interno del servidor",
      details: error.message,
    });
  }
}

module.exports = {
  referirAAdmin,
  solicitarRevisionAdmin,
};
