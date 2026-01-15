/**
 * Módulo de notificaciones a cajeros
 */

const Jugador = require("../../../models/Jugador");
const {
  crearNotificacionInterna,
} = require("../../../controllers/notificacionesController");
const { buscarCajeroConectado } = require("../utils/socketUtils");

/**
 * Notificar a todos los cajeros sobre nueva solicitud
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 * @param {Object} jugador - Jugador
 */
async function notificarCajerosNuevaSolicitud(context, transaccion, jugador) {
  const notificacion = {
    transaccionId: transaccion._id,
    jugador: {
      id: jugador._id,
      telegramId: jugador.telegramId,
      nombre: jugador.nickname || jugador.firstName || "Usuario",
    },
    monto: transaccion.monto,
    metodoPago: transaccion.infoPago.metodoPago,
    descripcion: transaccion.descripcion,
    timestamp: new Date().toISOString(),
  };

  // Usar rooms para notificar solo a cajeros disponibles
  context.socketManager.roomsManager.notificarCajerosDisponibles(
    "nueva-solicitud-deposito",
    notificacion
  );

  console.log(
    `📢 [DEPOSITO] Nueva solicitud notificada a cajeros disponibles`
  );

  // Crear notificaciones persistentes para todos los cajeros conectados
  try {
    const cajerosConectados = Array.from(
      context.socketManager.connectedCajeros.keys()
    );

    console.log(
      `🔍 [NOTIFICACIONES] Cajeros conectados: ${cajerosConectados.length}`
    );

    for (const cajeroId of cajerosConectados) {
      await crearNotificacionInterna({
        destinatarioId: cajeroId,
        destinatarioTipo: "cajero",
        tipo: "nueva_solicitud",
        titulo: "Nueva solicitud de depósito",
        mensaje: `${notificacion.jugador.nombre} solicita depositar ${(
          transaccion.monto / 100
        ).toFixed(2)} Bs`,
        datos: {
          transaccionId: transaccion._id.toString(),
          monto: transaccion.monto,
          jugadorNombre: notificacion.jugador.nombre,
          metodoPago: notificacion.metodoPago,
        },
        eventoId: `solicitud-${transaccion._id}`,
      });

      // Emitir evento de nueva notificación al cajero específico
      const socketId = context.socketManager.connectedCajeros.get(cajeroId);
      if (socketId) {
        const socket = context.socketManager.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit("nuevaNotificacion", {
            tipo: "nueva_solicitud",
            titulo: "Nueva solicitud de depósito",
            mensaje: `${notificacion.jugador.nombre} solicita depositar ${(
              transaccion.monto / 100
            ).toFixed(2)} Bs`,
            transaccionId: transaccion._id.toString(),
          });
        }
      }
    }

    console.log(
      `✅ [NOTIFICACIONES] Creadas ${cajerosConectados.length} notificaciones de nueva solicitud`
    );
  } catch (error) {
    console.error(
      "❌ Error creando notificaciones persistentes:",
      error.message
    );
  }
}

/**
 * Notificar al cajero que debe verificar el pago
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 */
async function notificarCajeroVerificarPago(context, transaccion) {
  // Extraer el ID del cajero (puede ser un objeto o un ID)
  let cajeroId = transaccion.cajeroId;
  if (typeof cajeroId === "object" && cajeroId._id) {
    cajeroId = cajeroId._id;
  }

  const cajeroSocketId = buscarCajeroConectado(
    context.socketManager,
    cajeroId
  );

  if (!cajeroSocketId) {
    console.log(
      "⚠️ [DEPOSITO] Cajero no conectado para notificar verificación"
    );
    console.log(
      `🔍 [DEPOSITO] Buscando cajero con cajeroId: ${cajeroId} (tipo: ${typeof cajeroId})`
    );
    console.log(
      `🔍 [DEPOSITO] Cajeros conectados: ${Array.from(
        context.socketManager.connectedCajeros.keys()
      )}`
    );
    return;
  }

  // Obtener datos del jugador (puede ser un ID o un objeto poblado)
  let jugadorData;
  if (
    typeof transaccion.jugadorId === "object" &&
    transaccion.jugadorId._id
  ) {
    // Ya está poblado
    jugadorData = transaccion.jugadorId;
  } else {
    // Necesitamos obtener los datos del jugador
    jugadorData = await Jugador.findById(transaccion.jugadorId);
    if (!jugadorData) {
      console.log("⚠️ [DEPOSITO] Jugador no encontrado para notificación");
      return;
    }
  }

  const notificacion = {
    transaccionId: transaccion._id,
    jugador: {
      id: jugadorData._id,
      telegramId: jugadorData.telegramId,
      nombre: jugadorData.nickname || jugadorData.firstName || "Usuario",
    },
    monto: transaccion.monto,
    datosPago: transaccion.infoPago,
    timestamp: new Date().toISOString(),
  };

  context.io.to(cajeroSocketId).emit("verificar-pago", notificacion);
  console.log(
    `📢 [DEPOSITO] Solicitud de verificación enviada al cajero ${transaccion.cajeroId}`
  );
}

module.exports = {
  notificarCajerosNuevaSolicitud,
  notificarCajeroVerificarPago,
};
