const Transaccion = require("../../../models/Transaccion");
const websocketHelper = require("../../../utils/websocketHelper");
const { registrarLog } = require("../../../utils/logHelper");
const { notificarTransaccionCancelada } = require("../../../websocket/depositos/notificaciones/notificacionesAdmin");

/**
 * Cancelar transacción por jugador
 */
async function cancelarTransaccionJugador(req, res) {
  try {
    console.log("🔴 [CANCELAR] Solicitud de cancelación recibida");
    console.log("🔴 [CANCELAR] Params:", req.params);
    console.log("🔴 [CANCELAR] Body:", req.body);
    console.log(
      "🔴 [CANCELAR] Headers telegramId:",
      req.headers["x-telegram-id"]
    );
    console.log("🔴 [CANCELAR] req.telegramId:", req.telegramId);

    const { transaccionId } = req.params;
    const { motivo } = req.body;

    const transaccion = await Transaccion.findById(transaccionId)
      .populate("jugadorId", "telegramId nickname firstName")
      .populate("cajeroId", "nombreCompleto email");

    if (!transaccion) {
      console.log("🔴 [CANCELAR] Transacción no encontrada:", transaccionId);
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    console.log("🔴 [CANCELAR] Transacción encontrada:", {
      id: transaccion._id,
      estado: transaccion.estado,
      telegramId: transaccion.telegramId,
    });

    // Validar que sea el jugador dueño de la transacción
    // El middleware telegramIdAuth pone el ID en req.telegramId
    const telegramIdFromRequest = req.telegramId || req.user?.telegramId;

    if (!telegramIdFromRequest) {
      return res.status(401).json({
        mensaje: "No se pudo verificar tu identidad",
      });
    }

    if (transaccion.telegramId !== telegramIdFromRequest) {
      return res.status(403).json({
        mensaje: "No tienes permiso para cancelar esta transacción",
      });
    }

    // Solo se pueden cancelar transacciones en estados pendiente, en_proceso o retiro_pendiente_asignacion
    if (!["pendiente", "en_proceso", "retiro_pendiente_asignacion"].includes(transaccion.estado)) {
      return res.status(400).json({
        mensaje: `No se puede cancelar una transacción en estado ${transaccion.estado}. Solo se pueden cancelar transacciones pendientes, en proceso o pendientes de asignación.`,
      });
    }

    transaccion.cambiarEstado(
      "cancelada",
      motivo || "Cancelada por el usuario"
    );
    await transaccion.save();

    // Registrar log
    await registrarLog({
      accion: "Transacción cancelada por jugador",
      usuario: transaccion.jugadorId._id || transaccion.jugadorId,
      rol: "jugador",
      detalle: {
        transaccionId: transaccion._id,
        motivo: motivo || "Cancelada por el usuario",
        estadoAnterior: "en_proceso", // Estado antes de cancelar
        telegramId: telegramIdFromRequest,
      },
    });

    // Notificación persistente para admins
    const motivoCancelacion = motivo || "Cancelada por el usuario";
    await notificarTransaccionCancelada(transaccion, motivoCancelacion);

    // Emitir evento WebSocket para notificar al cajero (o cajeros disponibles)
    websocketHelper.initialize(req.app.get("socketManager"));
    websocketHelper.logWebSocketStats("Transacción cancelada por jugador");

    // Siempre notificar (la lógica de a quién notificar está en el helper)
    await websocketHelper.emitTransaccionCanceladaPorJugador(
      transaccion,
      motivo || "Cancelada por el usuario"
    );

    // Limpiar room de transacción cuando finaliza
    await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);

    res.json({
      mensaje: "Transacción cancelada exitosamente",
      transaccion: {
        _id: transaccion._id,
        estado: transaccion.estado,
        motivo: motivo || "Cancelada por el usuario",
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error cancelando transacción",
      error: error.message,
    });
  }
}

module.exports = { cancelarTransaccionJugador };
