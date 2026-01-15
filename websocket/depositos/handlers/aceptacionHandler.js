/**
 * Handler para aceptación de solicitud de depósito por cajero
 */

const Transaccion = require("../../../models/Transaccion");
const Cajero = require("../../../models/Cajero");
const { registrarLog } = require("../../../utils/logHelper");
const {
  crearNotificacionInterna,
} = require("../../../controllers/notificacionesController");
const { notificarJugadorSolicitudAceptada } = require("../notificaciones/notificacionesJugador");
const { notificarBotSolicitudAceptada } = require("../notificaciones/notificacionesBot");

/**
 * Manejar aceptación de solicitud por cajero
 * Evento: 'aceptar-solicitud'
 * @param {Object} context - Contexto con socketManager, io, roomsManager
 * @param {Object} socket - Socket del cajero
 * @param {Object} data - Datos de la aceptación
 */
async function aceptarSolicitud(context, socket, data) {
  try {
    console.log("🏦 [DEPOSITO] Cajero aceptando solicitud:", data);

    // Validar datos requeridos
    const { transaccionId } = data;
    if (!transaccionId) {
      socket.emit("error", {
        message: "ID de transacción requerido",
      });
      return;
    }

    // Validar que el socket esté autenticado como cajero
    if (!socket.userType || socket.userType !== "cajero") {
      socket.emit("error", {
        message: "Solo los cajeros pueden aceptar solicitudes",
      });
      return;
    }

    const cajeroId = socket.cajeroId;
    if (!cajeroId) {
      socket.emit("error", {
        message: "Datos de cajero no encontrados",
      });
      return;
    }

    // Buscar la transacción
    const transaccion = await Transaccion.findById(transaccionId)
      .populate("jugadorId", "telegramId nickname firstName")
      .populate(
        "cajeroId",
        "nombreCompleto email telefonoContacto datosPagoMovil"
      );

    if (!transaccion) {
      socket.emit("error", {
        message: "Transacción no encontrada",
      });
      return;
    }

    // No validar estado ni cambiar transacción - el HTTP API ya lo hizo
    // Solo verificar que el cajero esté disponible
    const cajero = await Cajero.findById(cajeroId);
    if (!cajero || cajero.estado !== "activo") {
      socket.emit("error", {
        message: "Cajero no disponible",
      });
      return;
    }

    console.log(
      `✅ [DEPOSITO] Cajero ${cajero.nombreCompleto} acepta transacción ${transaccionId}`
    );

    // Agregar cajero al room de la transacción (el room ya fue creado cuando el jugador hizo la solicitud)
    context.roomsManager.agregarParticipanteTransaccion(
      transaccionId,
      socket.id
    );

    // Notificar al cajero que la asignación fue exitosa
    socket.emit("solicitud-aceptada-confirmacion", {
      transaccionId: transaccion._id,
      message: "Solicitud aceptada y notificada al jugador",
      timestamp: new Date().toISOString(),
    });

    // Notificar al jugador que su solicitud fue aceptada
    await notificarJugadorSolicitudAceptada(context, transaccion, cajero);

    // Crear y emitir notificación al bot sobre aceptación de solicitud
    await notificarBotSolicitudAceptada(context, transaccion, cajero);

    // Crear notificación persistente para el cajero
    try {
      await crearNotificacionInterna({
        destinatarioId: cajeroId,
        destinatarioTipo: "cajero",
        tipo: "solicitud_asignada",
        titulo: "Solicitud asignada",
        mensaje: `Se te asignó la solicitud de ${
          transaccion.jugadorId.nickname ||
          transaccion.jugadorId.firstName ||
          "Usuario"
        } por ${(transaccion.monto / 100).toFixed(2)} Bs`,
        datos: {
          transaccionId: transaccion._id.toString(),
          monto: transaccion.monto,
          jugadorNombre:
            transaccion.jugadorId.nickname ||
            transaccion.jugadorId.firstName ||
            "Usuario",
        },
        eventoId: `asignada-${transaccion._id}-${cajeroId}`,
      });

      // Emitir evento de nueva notificación al cajero
      socket.emit("nuevaNotificacion", {
        tipo: "solicitud_asignada",
        titulo: "Solicitud asignada",
        mensaje: `Se te asignó la solicitud de ${
          transaccion.jugadorId.nickname ||
          transaccion.jugadorId.firstName ||
          "Usuario"
        } por ${(transaccion.monto / 100).toFixed(2)} Bs`,
        transaccionId: transaccion._id.toString(),
      });
    } catch (error) {
      console.error(
        "❌ Error creando notificación de asignación:",
        error.message
      );
    }

    // Registrar log
    await registrarLog({
      accion: "Solicitud de depósito aceptada via WebSocket",
      usuario: cajeroId,
      rol: "cajero",
      detalle: {
        transaccionId: transaccion._id,
        jugadorId: transaccion.jugadorId._id,
        monto: transaccion.monto,
        socketId: socket.id,
      },
    });
  } catch (error) {
    console.error("❌ [DEPOSITO] Error en aceptarSolicitud:", error);
    socket.emit("error", {
      message: "Error interno del servidor",
      details: error.message,
    });
  }
}

module.exports = {
  aceptarSolicitud,
};
