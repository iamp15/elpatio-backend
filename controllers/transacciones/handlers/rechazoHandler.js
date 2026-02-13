const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const websocketHelper = require("../../../utils/websocketHelper");
const { registrarLog } = require("../../../utils/logHelper");
const { notificarTransaccionRechazada } = require("../../../websocket/depositos/notificaciones/notificacionesAdmin");

/**
 * Rechazar transacción
 */
async function rechazarTransaccion(req, res) {
  try {
    const { transaccionId } = req.params;
    const { motivo } = req.body;

    const transaccion = await Transaccion.findById(transaccionId);
    if (!transaccion) {
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    if (
      !["pendiente", "en_proceso", "realizada"].includes(transaccion.estado)
    ) {
      return res.status(400).json({
        mensaje:
          "Solo se pueden rechazar transacciones pendientes, en proceso o realizadas",
      });
    }

    transaccion.cambiarEstado("rechazada", motivo);
    await transaccion.save();

    // Registrar log
    await registrarLog({
      accion: "Transacción rechazada",
      usuario: req.user?._id,
      rol: req.user?.rol || "cajero",
      detalle: {
        transaccionId: transaccion._id,
        motivo: motivo,
        cajeroId: req.user?._id,
      },
    });

    // Emitir evento WebSocket si hay usuarios conectados
    websocketHelper.initialize(req.app.get("socketManager"));
    websocketHelper.logWebSocketStats("Transacción rechazada");

    // Solo emitir si es una transacción de depósito/retiro
    if (["deposito", "retiro"].includes(transaccion.categoria)) {
      const jugador = await Jugador.findById(transaccion.jugadorId);
      if (jugador) {
        await websocketHelper.emitTransaccionRechazada(
          transaccion,
          jugador,
          motivo
        );
      }

      // Notificar a admins del dashboard sobre cambio de estado (tiempo real + persistente)
      const socketManager = req.app.get("socketManager");
      if (socketManager?.roomsManager) {
        socketManager.roomsManager.notificarAdmins("transaction-update", {
          transaccionId: transaccion._id,
          estado: transaccion.estado,
          categoria: transaccion.categoria,
          tipo: "estado-cambiado",
          monto: transaccion.monto,
          jugadorId: transaccion.jugadorId,
        });
      }
      if (jugador) {
        await notificarTransaccionRechazada(transaccion, jugador, motivo);
      }
    }

    // Limpiar room de transacción cuando finaliza
    await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);

    res.json({
      mensaje: "Transacción rechazada exitosamente",
      transaccion: {
        _id: transaccion._id,
        estado: transaccion.estado,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error rechazando transacción",
      error: error.message,
    });
  }
}

module.exports = { rechazarTransaccion };
