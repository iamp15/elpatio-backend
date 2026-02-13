const Cajero = require("../../../models/Cajero");
const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const websocketHelper = require("../../../utils/websocketHelper");
const { registrarLog } = require("../../../utils/logHelper");
const {
  crearNotificacionInterna,
} = require("../../../controllers/notificacionesController");
const { buscarCajeroConectado } = require("../../../websocket/depositos/utils/socketUtils");

/**
 * Obtener cajeros disponibles para asignar
 */
async function obtenerCajerosDisponibles(req, res) {
  try {
    const cajeros = await Cajero.find(
      { estado: "activo" },
      "nombreCompleto email telefonoContacto datosPagoMovil saldo"
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

    const estadosPermitidos = ["pendiente", "retiro_pendiente_asignacion"];
    if (!estadosPermitidos.includes(transaccion.estado)) {
      return res.status(400).json({
        mensaje:
          "Solo se pueden asignar cajeros a transacciones pendientes o pendientes de asignación",
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
    if (["admin", "superadmin"].includes(req.user?.rol)) {
      transaccion.asignadoPorAdmin = true;
    }
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
      const socketManager = req.app.get("socketManager");
      const jugador = await Jugador.findById(transaccion.jugadorId).select(
        "telegramId nickname firstName"
      );

      if (jugador) {
        // Notificar al jugador (app de retiros/depósitos) para que cambie de pantalla
        await websocketHelper.emitCajeroAsignado(transaccion, cajero);

        // Notificar al bot si el jugador no tiene la app abierta
        if (socketManager?.depositoController) {
          const context = socketManager.depositoController.getContext();
          const {
            notificarBotSolicitudAceptada,
          } = require("../../../websocket/depositos/notificaciones/notificacionesBot");
          await notificarBotSolicitudAceptada(context, transaccion, cajero);
        }

        // Agregar cajero al room de la transacción si está conectado
        if (socketManager?.roomsManager) {
          const cajeroSocketId = buscarCajeroConectado(
            socketManager,
            cajero._id
          );
          if (cajeroSocketId) {
            socketManager.roomsManager.agregarParticipanteTransaccion(
              transaccion._id.toString(),
              cajeroSocketId
            );
          }

          // Notificar a admins del dashboard sobre cambio de estado
          socketManager.roomsManager.notificarAdmins("transaction-update", {
            transaccionId: transaccion._id,
            estado: transaccion.estado,
            categoria: transaccion.categoria,
            tipo: "estado-cambiado",
            monto: transaccion.monto,
            jugadorId: transaccion.jugadorId,
          });
        }

        // Crear notificación persistente para el cajero
        try {
          await crearNotificacionInterna({
            destinatarioId: cajero._id,
            destinatarioTipo: "cajero",
            tipo: "solicitud_asignada",
            titulo:
              transaccion.categoria === "retiro"
                ? "Retiro asignado"
                : "Solicitud asignada",
            mensaje: `Se te asignó la solicitud de ${
              jugador.nickname || jugador.firstName || "Usuario"
            } por ${(transaccion.monto / 100).toFixed(2)} Bs`,
            datos: {
              transaccionId: transaccion._id.toString(),
              monto: transaccion.monto,
              jugadorNombre:
                jugador.nickname || jugador.firstName || "Usuario",
            },
            eventoId: `asignada-${transaccion._id}-${cajero._id}`,
          });

          // Emitir evento en tiempo real al cajero si está conectado
          const cajeroSocketId = socketManager
            ? buscarCajeroConectado(socketManager, cajero._id)
            : null;
          if (cajeroSocketId && socketManager?.io) {
            const socket = socketManager.io.sockets.sockets.get(cajeroSocketId);
            if (socket) {
              socket.emit("nuevaNotificacion", {
                tipo: "solicitud_asignada",
                titulo:
                  transaccion.categoria === "retiro"
                    ? "Retiro asignado"
                    : "Solicitud asignada",
                mensaje: `Se te asignó la solicitud de ${
                  jugador.nickname || jugador.firstName || "Usuario"
                } por ${(transaccion.monto / 100).toFixed(2)} Bs`,
                transaccionId: transaccion._id.toString(),
              });
            }
          }
        } catch (notifError) {
          console.error(
            "❌ Error creando notificación de asignación:",
            notifError?.message
          );
        }
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
