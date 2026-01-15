/**
 * Módulo de notificaciones a jugadores
 */

const { buscarJugadorConectado } = require("../utils/socketUtils");

/**
 * Notificar al jugador que su solicitud fue aceptada
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 * @param {Object} cajero - Cajero
 */
async function notificarJugadorSolicitudAceptada(context, transaccion, cajero) {
  // Verificar si el jugador está conectado usando rooms
  const jugadorConectado =
    context.socketManager.roomsManager.rooms.jugadores.has(
      transaccion.telegramId
    );

  if (!jugadorConectado) {
    console.log(
      "⚠️ [DEPOSITO] Jugador no conectado para notificar aceptación"
    );
    return;
  }

  const notificacion = {
    transaccionId: transaccion._id,
    cajero: {
      id: cajero._id,
      nombre: cajero.nombreCompleto,
      telefono: cajero.telefonoContacto,
      datosPago: {
        banco: cajero.datosPagoMovil.banco,
        cedula: {
          prefijo: cajero.datosPagoMovil.cedula.prefijo,
          numero: cajero.datosPagoMovil.cedula.numero,
        },
        telefono: cajero.datosPagoMovil.telefono,
      },
    },
    monto: transaccion.monto,
    timestamp: new Date().toISOString(),
  };

  // Agregar jugador al room de la transacción
  console.log(
    `🔍 [DEPOSITO] Buscando jugador en rooms: ${transaccion.telegramId}`
  );
  const jugadorSocketSet =
    context.socketManager.roomsManager.rooms.jugadores.get(
      transaccion.telegramId
    );
  const jugadorSocketId = jugadorSocketSet
    ? Array.from(jugadorSocketSet)[0]
    : null;
  console.log(
    `🔍 [DEPOSITO] Jugador socket ID encontrado: ${jugadorSocketId}`
  );

  if (jugadorSocketId) {
    console.log(
      `🔍 [DEPOSITO] Agregando jugador a room transaccion-${transaccion._id}`
    );
    context.socketManager.roomsManager.agregarParticipanteTransaccion(
      transaccion._id.toString(),
      jugadorSocketId
    );
  } else {
    console.error(
      `❌ [DEPOSITO] Jugador ${transaccion.telegramId} no encontrado en rooms`
    );
  }

  // Usar rooms para notificar al jugador
  context.socketManager.roomsManager.notificarJugador(
    transaccion.telegramId,
    "solicitud-aceptada",
    notificacion
  );
  console.log(
    `📢 [DEPOSITO] Datos bancarios enviados al jugador ${transaccion.telegramId}`
  );
}

/**
 * Notificar al jugador sobre el ajuste de monto
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 * @param {number} montoOriginal - Monto original
 * @param {number} montoReal - Monto real
 * @param {string} razon - Razón del ajuste
 */
async function notificarJugadorAjusteMonto(
  context,
  transaccion,
  montoOriginal,
  montoReal,
  razon
) {
  // Verificar si el jugador está conectado usando rooms
  const jugadorConectado =
    context.socketManager.roomsManager.rooms.jugadores.has(
      transaccion.telegramId
    );

  if (!jugadorConectado) {
    console.log(
      "⚠️ [DEPOSITO] Jugador no conectado para notificar ajuste de monto"
    );
    return;
  }

  const notificacion = {
    transaccionId: transaccion._id,
    montoOriginal,
    montoReal,
    razon: razon || "Ajuste de monto por discrepancia",
    timestamp: new Date().toISOString(),
  };

  // Agregar jugador al room de la transacción si no está
  const jugadorSocketSet =
    context.socketManager.roomsManager.rooms.jugadores.get(
      transaccion.telegramId
    );
  const jugadorSocketId = jugadorSocketSet
    ? Array.from(jugadorSocketSet)[0]
    : null;

  if (jugadorSocketId) {
    context.socketManager.roomsManager.agregarParticipanteTransaccion(
      transaccion._id.toString(),
      jugadorSocketId
    );
  }

  // Enviar notificación usando rooms
  context.socketManager.roomsManager.notificarJugador(
    transaccion.telegramId,
    "monto-ajustado",
    notificacion
  );

  // También enviar directamente a la room de la transacción
  context.io.to(`transaccion-${transaccion._id}`).emit("monto-ajustado", {
    ...notificacion,
    target: "jugador",
  });

  console.log(
    `📢 [DEPOSITO] Notificación de ajuste de monto enviada al jugador ${transaccion.telegramId}`
  );
}

/**
 * Notificar al jugador que su depósito fue completado
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 * @param {number} saldoNuevo - Nuevo saldo del jugador
 */
async function notificarJugadorDepositoCompletado(
  context,
  transaccion,
  saldoNuevo
) {
  const jugadorSocketId = buscarJugadorConectado(
    context.socketManager,
    transaccion.telegramId
  );

  if (!jugadorSocketId) {
    console.log(
      "⚠️ [DEPOSITO] Jugador no conectado para notificar completado"
    );
    return;
  }

  const notificacion = {
    transaccionId: transaccion._id,
    monto: transaccion.monto,
    saldoAnterior: transaccion.saldoAnterior,
    saldoNuevo: saldoNuevo,
    mensaje: "¡Depósito completado exitosamente! Gracias por tu confianza.",
    timestamp: new Date().toISOString(),
  };

  context.io.to(jugadorSocketId).emit("deposito-completado", notificacion);
  console.log(
    `📢 [DEPOSITO] Confirmación de depósito enviada al jugador ${transaccion.telegramId}`
  );
}

/**
 * Notificar al jugador que su depósito fue rechazado
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 * @param {string} motivo - Motivo del rechazo
 */
async function notificarJugadorDepositoRechazado(
  context,
  transaccion,
  motivo
) {
  const jugadorSocketId = buscarJugadorConectado(
    context.socketManager,
    transaccion.telegramId
  );

  if (!jugadorSocketId) {
    console.log("⚠️ [DEPOSITO] Jugador no conectado para notificar rechazo");
    return;
  }

  const notificacion = {
    transaccionId: transaccion._id,
    monto: transaccion.monto,
    motivo: motivo || "Pago no verificado",
    timestamp: new Date().toISOString(),
  };

  context.io.to(jugadorSocketId).emit("deposito-rechazado", notificacion);
  console.log(
    `📢 [DEPOSITO] Rechazo de depósito enviado al jugador ${transaccion.telegramId}`
  );
}

module.exports = {
  notificarJugadorSolicitudAceptada,
  notificarJugadorAjusteMonto,
  notificarJugadorDepositoCompletado,
  notificarJugadorDepositoRechazado,
};
