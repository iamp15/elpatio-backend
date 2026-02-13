/**
 * Handler para confirmación de pago por jugador
 */

const Transaccion = require("../../../models/Transaccion");
const { registrarLog } = require("../../../utils/logHelper");
const {
  crearNotificacionInterna,
} = require("../../../controllers/notificacionesController");
const { notificarBotPagoConfirmado } = require("../notificaciones/notificacionesBot");

/**
 * Manejar confirmación de pago por jugador
 * Evento: 'confirmar-pago-jugador'
 * @param {Object} context - Contexto con socketManager, io, roomsManager
 * @param {Object} socket - Socket del jugador
 * @param {Object} data - Datos de la confirmación
 */
async function confirmarPagoJugador(context, socket, data) {
  try {
    console.log("💳 [DEPOSITO] Jugador confirmando pago:", data);

    // Validar datos requeridos
    const { transaccionId, datosPago } = data;
    if (!transaccionId || !datosPago) {
      socket.emit("error", {
        message: "ID de transacción y datos de pago requeridos",
      });
      return;
    }

    // Validar que el socket esté autenticado como jugador
    if (!socket.userType || socket.userType !== "jugador") {
      socket.emit("error", {
        message: "Solo los jugadores pueden confirmar pagos",
      });
      return;
    }

    // Buscar la transacción
    const transaccion = await Transaccion.findById(transaccionId)
      .populate("jugadorId", "telegramId nickname firstName")
      .populate("cajeroId", "nombreCompleto email");

    if (!transaccion) {
      socket.emit("error", {
        message: "Transacción no encontrada",
      });
      return;
    }

    if (transaccion.estado !== "en_proceso") {
      socket.emit("error", {
        message: "La transacción no está en proceso",
      });
      return;
    }

    // 1. ACTUALIZAR BASE DE DATOS PRIMERO
    console.log("🔍 [DEBUG] datosPago recibidos:", datosPago);
    console.log("🔍 [DEBUG] infoPago actual:", transaccion.infoPago);

    // Mapear los campos del frontend a los campos del modelo
    const infoPagoActualizado = {
      ...transaccion.infoPago,
      metodoPago: datosPago.metodoPago || transaccion.infoPago.metodoPago,
      numeroReferencia: datosPago.referencia || datosPago.numeroReferencia,
      bancoOrigen: datosPago.banco || datosPago.bancoOrigen,
      telefonoOrigen: datosPago.telefono || datosPago.telefonoOrigen,
      fechaPago: datosPago.fecha ? new Date(datosPago.fecha) : new Date(),
    };

    transaccion.infoPago = infoPagoActualizado;

    // Cambiar estado a "realizada" cuando el usuario confirma que hizo el pago
    transaccion.cambiarEstado("realizada");

    console.log("🔍 [DEBUG] infoPago actualizado:", transaccion.infoPago);
    console.log("🔍 [DEBUG] Estado cambiado a: realizada");

    await transaccion.save();

    console.log(
      `✅ [DEPOSITO] Pago confirmado por jugador para transacción ${transaccionId}`
    );

    // Notificar a admins del dashboard sobre cambio de estado
    if (context.roomsManager) {
      context.roomsManager.notificarAdmins("transaction-update", {
        transaccionId: transaccion._id,
        estado: transaccion.estado,
        categoria: transaccion.categoria,
        tipo: "estado-cambiado",
        monto: transaccion.monto,
        jugadorId: transaccion.jugadorId,
      });
    }

    // ASEGURAR QUE EL JUGADOR ESTÉ EN EL ROOM DE LA TRANSACCIÓN
    const jugadorSocketId =
      await context.socketManager.roomsManager.obtenerSocketJugador(
        transaccion.telegramId
      );

    if (jugadorSocketId) {
      // Verificar si ya está en el room
      const enRoom = await context.socketManager.roomsManager.jugadorEnRoom(
        transaccion.telegramId,
        `transaccion-${transaccionId}`
      );

      if (!enRoom) {
        console.log(
          `📢 [DEPOSITO] Jugador no estaba en room, agregándolo: ${transaccionId}`
        );
        context.socketManager.roomsManager.agregarParticipanteTransaccion(
          transaccionId,
          jugadorSocketId
        );
      }
    }

    // 2. USAR ROOMS PARA NOTIFICAR A TODOS LOS PARTICIPANTES
    const notificacion = {
      transaccionId: transaccion._id,
      estado: "esperando_verificacion",
      timestamp: new Date().toISOString(),
    };

    // Enviar a la room de la transacción (todos reciben)
    context.io.to(`transaccion-${transaccionId}`).emit("verificar-pago", {
      ...notificacion,
      target: "cajero", // Solo cajero procesa
      jugador: {
        id: transaccion.jugadorId._id || transaccion.jugadorId,
        telegramId: transaccion.telegramId,
        nombre:
          (transaccion.jugadorId && transaccion.jugadorId.nickname) ||
          (transaccion.jugadorId && transaccion.jugadorId.firstName) ||
          "Usuario",
      },
      monto: transaccion.monto,
      datosPago: {
        banco: transaccion.infoPago.bancoOrigen,
        telefono: transaccion.infoPago.telefonoOrigen,
        referencia: transaccion.infoPago.numeroReferencia,
        fecha: transaccion.infoPago.fechaPago,
        monto: transaccion.monto,
      },
    });

    // Confirmar al jugador
    context.io.to(`transaccion-${transaccionId}`).emit("pago-confirmado", {
      ...notificacion,
      target: "jugador", // Solo jugador procesa
    });

    // Crear y emitir notificación al bot sobre confirmación de pago
    await notificarBotPagoConfirmado(context, transaccion);

    // Crear notificación persistente para el cajero
    try {
      if (transaccion.cajeroId) {
        const cajeroId = transaccion.cajeroId._id || transaccion.cajeroId;
        await crearNotificacionInterna({
          destinatarioId: cajeroId,
          destinatarioTipo: "cajero",
          tipo: "pago_realizado",
          titulo: "Pago realizado",
          mensaje: `${
            transaccion.jugadorId.nickname ||
            transaccion.jugadorId.firstName ||
            "Usuario"
          } confirmó el pago de ${(transaccion.monto / 100).toFixed(2)} Bs`,
          datos: {
            transaccionId: transaccion._id.toString(),
            monto: transaccion.monto,
            jugadorNombre:
              transaccion.jugadorId.nickname ||
              transaccion.jugadorId.firstName ||
              "Usuario",
            referencia: transaccion.infoPago.numeroReferencia,
          },
          eventoId: `pago-${transaccion._id}`,
        });

        // Emitir evento de nueva notificación al cajero
        context.io.to(`transaccion-${transaccionId}`).emit("nuevaNotificacion", {
          tipo: "pago_realizado",
          titulo: "Pago realizado",
          mensaje: `${
            transaccion.jugadorId.nickname ||
            transaccion.jugadorId.firstName ||
            "Usuario"
          } confirmó el pago de ${(transaccion.monto / 100).toFixed(2)} Bs`,
          transaccionId: transaccion._id.toString(),
          target: "cajero",
        });
      }
    } catch (error) {
      console.error(
        "❌ Error creando notificación de pago realizado:",
        error.message
      );
    }

    // Registrar log
    await registrarLog({
      accion: "Pago confirmado por jugador via WebSocket",
      usuario: transaccion.jugadorId,
      rol: "jugador",
      detalle: {
        transaccionId: transaccion._id,
        datosPago: datosPago,
        socketId: socket.id,
      },
    });
  } catch (error) {
    console.error("❌ [DEPOSITO] Error en confirmarPagoJugador:", error);
    socket.emit("error", {
      message: "Error interno del servidor",
      details: error.message,
    });
  }
}

module.exports = {
  confirmarPagoJugador,
};
