/**
 * Módulo de notificaciones para administradores (dashboard)
 * Crea notificaciones persistentes cuando ocurren eventos relevantes
 */

const Admin = require("../../../models/Admin");
const {
  crearNotificacionInterna,
} = require("../../../controllers/notificacionesController");

/**
 * Notificar a todos los admins activos creando una notificación persistente para cada uno
 * @param {Object} opts - { tipo, titulo, mensaje, datos, eventoIdPrefix }
 * @returns {Promise<number>} Cantidad de notificaciones creadas
 */
async function notificarATodosLosAdmins(opts) {
  const { tipo, titulo, mensaje, datos = {}, eventoIdPrefix } = opts;

  try {
    const admins = await Admin.find({ estado: "activo" }).select("_id");

    let creadas = 0;
    for (const admin of admins) {
      const eventoId = eventoIdPrefix
        ? `${eventoIdPrefix}-${admin._id}`
        : undefined;

      const notif = await crearNotificacionInterna({
        destinatarioId: admin._id,
        destinatarioTipo: "admin",
        tipo,
        titulo,
        mensaje,
        datos,
        eventoId,
      });
      if (notif) creadas++;
    }

    if (creadas > 0) {
      console.log(
        `✅ [NOTIFICACIONES-ADMIN] ${tipo}: ${creadas} notificación(es) creada(s)`
      );
    }
    return creadas;
  } catch (err) {
    console.error("❌ [NOTIFICACIONES-ADMIN] Error notificando admins:", err.message);
    return 0;
  }
}

/**
 * Nueva solicitud de depósito creada (desde jugador o desde sistema)
 */
async function notificarNuevaSolicitudDeposito(transaccion, jugador) {
  const montoBs = (transaccion.monto / 100).toFixed(2);
  const nombre = jugador?.nickname || jugador?.firstName || "Usuario";

  return notificarATodosLosAdmins({
    tipo: "nueva_solicitud_deposito",
    titulo: "Nueva solicitud de depósito",
    mensaje: `${nombre} solicitó depositar ${montoBs} Bs`,
    datos: {
      transaccionId: transaccion._id.toString(),
      monto: transaccion.monto,
      jugadorNombre: nombre,
      jugadorTelegramId: jugador?.telegramId,
      categoria: "deposito",
    },
    eventoIdPrefix: `deposito-${transaccion._id}`,
  });
}

/**
 * Nueva solicitud de retiro creada
 */
async function notificarNuevaSolicitudRetiro(transaccion, jugador) {
  const montoBs = (transaccion.monto / 100).toFixed(2);
  const nombre = jugador?.nickname || jugador?.firstName || "Usuario";

  return notificarATodosLosAdmins({
    tipo: "nueva_solicitud_retiro",
    titulo: "Nueva solicitud de retiro",
    mensaje: `${nombre} solicitó retirar ${montoBs} Bs`,
    datos: {
      transaccionId: transaccion._id.toString(),
      monto: transaccion.monto,
      jugadorNombre: nombre,
      jugadorTelegramId: jugador?.telegramId,
      categoria: "retiro",
      estado: transaccion.estado,
    },
    eventoIdPrefix: `retiro-${transaccion._id}`,
  });
}

/**
 * Retiro pendiente de asignación (sin cajeros con saldo)
 */
async function notificarRetiroPendienteAsignacion(transaccion, jugador) {
  const montoBs = (transaccion.monto / 100).toFixed(2);
  const nombre = jugador?.nickname || jugador?.firstName || "Usuario";

  return notificarATodosLosAdmins({
    tipo: "retiro_requiere_revision",
    titulo: "Retiro pendiente por falta de saldo en cajeros",
    mensaje: `Retiro de ${montoBs} Bs de ${nombre} requiere asignación manual. Ningún cajero tiene saldo suficiente.`,
    datos: {
      transaccionId: transaccion._id.toString(),
      monto: transaccion.monto,
      jugadorNombre: nombre,
      jugadorTelegramId: jugador?.telegramId,
    },
    eventoIdPrefix: `retiro-revision-${transaccion._id}`,
  });
}

/**
 * Transacción completada (depósito o retiro)
 */
async function notificarTransaccionCompletada(transaccion, jugador) {
  const montoBs = (transaccion.monto / 100).toFixed(2);
  const nombre = jugador?.nickname || jugador?.firstName || "Usuario";
  const categoria =
    transaccion.categoria === "deposito" ? "Depósito" : "Retiro";

  return notificarATodosLosAdmins({
    tipo: "transaccion_completada_admin",
    titulo: `${categoria} completado`,
    mensaje: `${categoria} de ${montoBs} Bs para ${nombre} fue completado.`,
    datos: {
      transaccionId: transaccion._id.toString(),
      monto: transaccion.monto,
      jugadorNombre: nombre,
      estado: transaccion.estado,
      categoria: transaccion.categoria,
    },
    eventoIdPrefix: `completada-${transaccion._id}`,
  });
}

/**
 * Transacción rechazada
 */
async function notificarTransaccionRechazada(transaccion, jugador, motivo) {
  const montoBs = (transaccion.monto / 100).toFixed(2);
  const nombre = jugador?.nickname || jugador?.firstName || "Usuario";

  return notificarATodosLosAdmins({
    tipo: "transaccion_rechazada_admin",
    titulo: "Transacción rechazada",
    mensaje: `${transaccion.categoria} de ${montoBs} Bs (${nombre}) fue rechazado. ${motivo || ""}`.trim(),
    datos: {
      transaccionId: transaccion._id.toString(),
      monto: transaccion.monto,
      jugadorNombre: nombre,
      estado: transaccion.estado,
      motivo: motivo || null,
    },
    eventoIdPrefix: `rechazada-${transaccion._id}`,
  });
}

/**
 * Transacción cancelada (por jugador o timeout)
 */
async function notificarTransaccionCancelada(transaccion, motivo) {
  const montoBs = (transaccion.monto / 100).toFixed(2);
  const jugador = transaccion.jugadorId;
  const nombre =
    jugador?.nickname || jugador?.firstName || jugador?.username || "Usuario";

  return notificarATodosLosAdmins({
    tipo: "transaccion_cancelada_admin",
    titulo: "Transacción cancelada",
    mensaje: `${transaccion.categoria} de ${montoBs} Bs (${nombre}) fue cancelado. ${motivo || ""}`.trim(),
    datos: {
      transaccionId: transaccion._id.toString(),
      monto: transaccion.monto,
      jugadorNombre: nombre,
      estado: transaccion.estado,
      motivo: motivo || null,
    },
    eventoIdPrefix: `cancelada-${transaccion._id}`,
  });
}

/**
 * Transacción requiere revisión (referida a admin por cajero/jugador)
 */
async function notificarTransaccionRequiereRevision(transaccion, jugador, detalle) {
  const montoBs = (transaccion.monto / 100).toFixed(2);
  const nombre = jugador?.nickname || jugador?.firstName || "Usuario";

  return notificarATodosLosAdmins({
    tipo: "transaccion_requiere_revision",
    titulo: "Transacción requiere revisión",
    mensaje:
      detalle ||
      `${transaccion.categoria} de ${montoBs} Bs (${nombre}) requiere revisión de un administrador.`,
    datos: {
      transaccionId: transaccion._id.toString(),
      monto: transaccion.monto,
      jugadorNombre: nombre,
      estado: transaccion.estado,
      categoria: transaccion.categoria,
    },
    eventoIdPrefix: `revision-${transaccion._id}`,
  });
}

module.exports = {
  notificarATodosLosAdmins,
  notificarNuevaSolicitudDeposito,
  notificarNuevaSolicitudRetiro,
  notificarRetiroPendienteAsignacion,
  notificarTransaccionCompletada,
  notificarTransaccionRechazada,
  notificarTransaccionCancelada,
  notificarTransaccionRequiereRevision,
};
