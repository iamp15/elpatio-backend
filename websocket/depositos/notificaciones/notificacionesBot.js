/**
 * Módulo de notificaciones al bot de Telegram
 */

const Jugador = require("../../../models/Jugador");
const {
  crearNotificacionBot,
} = require("../../../controllers/notificacionesBotController");

/**
 * Notificar al bot sobre solicitud aceptada (depósito o retiro)
 * Distingue el tipo de transacción para enviar el mensaje adecuado.
 * No envía Telegram si el jugador tiene la app abierta (depósitos o retiros).
 *
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 * @param {Object} cajero - Cajero
 */
async function notificarBotSolicitudAceptada(context, transaccion, cajero) {
  try {
    const jugador = await Jugador.findById(transaccion.jugadorId);
    if (!jugador) {
      console.error("❌ [BOT] Jugador no encontrado para notificación");
      return;
    }

    // No enviar Telegram si el jugador tiene la app abierta (depósitos o retiros)
    const tieneAppAbierta = context.socketManager.connectedPlayers.has(
      jugador.telegramId
    );

    if (tieneAppAbierta) {
      console.log(
        `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app de depósitos o retiros abierta, no enviar notificación a Telegram`
      );
      return;
    }

    const esRetiro = transaccion.categoria === "retiro";
    const montoFormato = (transaccion.monto / 100).toFixed(2);

    const notificacion = await crearNotificacionBot({
      transaccionId: transaccion._id,
      jugadorTelegramId: jugador.telegramId,
      tipo: esRetiro ? "retiro_aceptado" : "deposito_aceptado",
      titulo: esRetiro
        ? "Solicitud de retiro aceptada"
        : "Solicitud de depósito aceptada",
      mensaje: esRetiro
        ? `El cajero ${cajero.nombreCompleto} aceptó tu solicitud de retiro por ${montoFormato} Bs. Abre la app de retiros para ver los detalles y esperar la transferencia.`
        : `El cajero ${cajero.nombreCompleto} aceptó tu solicitud de depósito por ${montoFormato} Bs. Para continuar abre la app de depósitos y haz el pago.`,
      datos: {
        monto: transaccion.monto,
        cajeroNombre: cajero.nombreCompleto,
        referencia: transaccion.referencia,
        categoria: transaccion.categoria,
      },
      eventoId: esRetiro
        ? `retiro-aceptado-${transaccion._id}`
        : `deposito-aceptado-${transaccion._id}`,
    });

    if (!notificacion) return;

    if (context.socketManager.connectedBots.size > 0) {
      context.io.emit("bot-notificacion", {
        notificacionId: notificacion._id.toString(),
        tipo: notificacion.tipo,
        titulo: notificacion.titulo,
        mensaje: notificacion.mensaje,
        jugadorTelegramId: notificacion.jugadorTelegramId,
        datos: notificacion.datos,
      });
    }
  } catch (error) {
    console.error("❌ [BOT] Error notificando aceptación:", error.message);
  }
}

/**
 * Notificar al bot sobre pago confirmado
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 */
async function notificarBotPagoConfirmado(context, transaccion) {
  try {
    const jugador = await Jugador.findById(transaccion.jugadorId);
    if (!jugador) {
      console.error("❌ [BOT] Jugador no encontrado para notificación");
      return;
    }

    // Verificar si el jugador tiene la app de depósitos abierta
    const tieneAppAbierta = context.socketManager.connectedPlayers.has(
      jugador.telegramId
    );

    if (tieneAppAbierta) {
      console.log(
        `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app de depósitos abierta, no enviar notificación a Telegram`
      );
      return; // No enviar notificación a Telegram si tiene la app abierta
    }

    const notificacion = await crearNotificacionBot({
      transaccionId: transaccion._id,
      jugadorTelegramId: jugador.telegramId,
      tipo: "pago_confirmado",
      titulo: "Pago confirmado",
      mensaje: `Los datos de tu pago con referencia ${transaccion.infoPago.numeroReferencia} se enviaron al cajero. Te notificaremos cuando tu deposito se haya completado.`,
      datos: {
        monto: transaccion.monto,
        referencia: transaccion.infoPago.numeroReferencia,
      },
      eventoId: `pago-confirmado-${transaccion._id}`,
    });

    if (!notificacion) return;

    if (context.socketManager.connectedBots.size > 0) {
      context.io.emit("bot-notificacion", {
        notificacionId: notificacion._id.toString(),
        tipo: notificacion.tipo,
        titulo: notificacion.titulo,
        mensaje: notificacion.mensaje,
        jugadorTelegramId: notificacion.jugadorTelegramId,
        datos: notificacion.datos,
      });
    }
  } catch (error) {
    console.error(
      "❌ [BOT] Error notificando pago confirmado:",
      error.message
    );
  }
}

/**
 * Notificar al bot sobre depósito completado
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 * @param {Object} jugador - Jugador
 * @param {number} saldoNuevo - Nuevo saldo del jugador
 */
async function notificarBotDepositoCompletado(
  context,
  transaccion,
  jugador,
  saldoNuevo
) {
  try {
    // Verificar si el jugador tiene la app de depósitos abierta
    const tieneAppAbierta = context.socketManager.connectedPlayers.has(
      jugador.telegramId
    );

    if (tieneAppAbierta) {
      console.log(
        `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app de depósitos abierta, no enviar notificación a Telegram`
      );
      return; // No enviar notificación a Telegram si tiene la app abierta
    }

    // Verificar si hay ajuste de monto
    let mensaje;
    if (transaccion.ajusteMonto && transaccion.ajusteMonto.montoOriginal) {
      const montoOriginal = (
        transaccion.ajusteMonto.montoOriginal / 100
      ).toFixed(2);
      const montoAcreditado = (transaccion.monto / 100).toFixed(2);
      const saldo = (saldoNuevo / 100).toFixed(2);
      const razon = transaccion.ajusteMonto.razon;

      mensaje = `Tu depósito se completó con un ajuste de monto.\n\n💰 Monto reportado: ${montoOriginal} Bs\n💰 Monto acreditado: ${montoAcreditado} Bs`;

      if (razon) {
        mensaje += `\n📌 Motivo: ${razon}`;
      }

      mensaje += `\n\nNuevo saldo: ${saldo} Bs\n\nSi crees que hay un error, ponte en contacto con un Admin.`;
    } else {
      // Mensaje sin ajuste (actual)
      mensaje = `Tu depósito por ${(transaccion.monto / 100).toFixed(
        2
      )} Bs se completó correctamente\n\nNuevo saldo: ${(saldoNuevo / 100).toFixed(
        2
      )} Bs`;
    }

    const notificacion = await crearNotificacionBot({
      transaccionId: transaccion._id,
      jugadorTelegramId: jugador.telegramId,
      tipo: "deposito_completado",
      titulo: "Depósito completado",
      mensaje: mensaje,
      datos: {
        monto: transaccion.monto,
        saldoNuevo,
      },
      eventoId: `deposito-completado-${transaccion._id}`,
    });

    if (!notificacion) return;

    if (context.socketManager.connectedBots.size > 0) {
      context.io.emit("bot-notificacion", {
        notificacionId: notificacion._id.toString(),
        tipo: notificacion.tipo,
        titulo: notificacion.titulo,
        mensaje: notificacion.mensaje,
        jugadorTelegramId: notificacion.jugadorTelegramId,
        datos: notificacion.datos,
      });
    }
  } catch (error) {
    console.error(
      "❌ [BOT] Error notificando depósito completado:",
      error.message
    );
  }
}

/**
 * Notificar al bot sobre depósito rechazado
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 * @param {Object} jugador - Jugador
 * @param {string} motivo - Motivo del rechazo
 */
async function notificarBotDepositoRechazado(
  context,
  transaccion,
  jugador,
  motivo
) {
  try {
    // Verificar si el jugador tiene la app de depósitos abierta
    const tieneAppAbierta = context.socketManager.connectedPlayers.has(
      jugador.telegramId
    );

    if (tieneAppAbierta) {
      console.log(
        `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app de depósitos abierta, no enviar notificación a Telegram`
      );
      return; // No enviar notificación a Telegram si tiene la app abierta
    }

    const notificacion = await crearNotificacionBot({
      transaccionId: transaccion._id,
      jugadorTelegramId: jugador.telegramId,
      tipo: "deposito_rechazado",
      titulo: "Depósito rechazado",
      mensaje: `Tu solicitud de depósito por ${(
        transaccion.monto / 100
      ).toFixed(2)} Bs fue rechazada por el cajero\n\nMotivo: ${
        motivo || "No especificado"
      }`,
      datos: {
        monto: transaccion.monto,
        motivo,
      },
      eventoId: `deposito-rechazado-${transaccion._id}`,
    });

    if (!notificacion) return;

    if (context.socketManager.connectedBots.size > 0) {
      context.io.emit("bot-notificacion", {
        notificacionId: notificacion._id.toString(),
        tipo: notificacion.tipo,
        titulo: notificacion.titulo,
        mensaje: notificacion.mensaje,
        jugadorTelegramId: notificacion.jugadorTelegramId,
        datos: notificacion.datos,
      });
    }
  } catch (error) {
    console.error(
      "❌ [BOT] Error notificando depósito rechazado:",
      error.message
    );
  }
}

/**
 * Notificar al bot sobre retiro completado
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción de retiro
 * @param {Object} jugador - Jugador
 * @param {number} saldoNuevo - Nuevo saldo del jugador
 * @param {string} comprobanteUrl - URL de la imagen del comprobante (opcional)
 */
async function notificarBotRetiroCompletado(
  context,
  transaccion,
  jugador,
  saldoNuevo,
  comprobanteUrl
) {
  try {
    const tieneAppAbierta = context.socketManager.connectedPlayers.has(
      jugador.telegramId
    );

    if (tieneAppAbierta) {
      console.log(
        `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app abierta, no enviar notificación de retiro a Telegram`
      );
      return;
    }

    let mensaje = `Tu retiro por ${(transaccion.monto / 100).toFixed(
      2
    )} Bs se completó correctamente.\n\n💰 Nuevo saldo: ${(saldoNuevo / 100).toFixed(
      2
    )} Bs`;

    if (comprobanteUrl) {
      mensaje += `\n\n📷 Ver comprobante: ${comprobanteUrl}`;
    }

    const notificacion = await crearNotificacionBot({
      transaccionId: transaccion._id,
      jugadorTelegramId: jugador.telegramId,
      tipo: "retiro_completado",
      titulo: "Retiro completado ✅",
      mensaje: mensaje,
      datos: {
        monto: transaccion.monto,
        saldoNuevo,
        comprobanteUrl: comprobanteUrl || null,
      },
      eventoId: `retiro-completado-${transaccion._id}`,
    });

    if (!notificacion) return;

    if (context.socketManager.connectedBots.size > 0) {
      context.io.emit("bot-notificacion", {
        notificacionId: notificacion._id.toString(),
        tipo: notificacion.tipo,
        titulo: notificacion.titulo,
        mensaje: notificacion.mensaje,
        jugadorTelegramId: notificacion.jugadorTelegramId,
        datos: notificacion.datos,
      });
    }
  } catch (error) {
    console.error(
      "❌ [BOT] Error notificando retiro completado:",
      error.message
    );
  }
}

/**
 * Notificar al bot sobre nuevo depósito
 * @param {Object} context - Contexto con socketManager e io
 * @param {Object} transaccion - Transacción
 * @param {Object} jugador - Jugador
 */
async function notificarBotNuevoDeposito(context, transaccion, jugador) {
  try {
    // Verificar si el jugador tiene la app de depósitos abierta
    const tieneAppAbierta = context.socketManager.connectedPlayers.has(
      jugador.telegramId
    );

    if (tieneAppAbierta) {
      console.log(
        `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app de depósitos abierta, no enviar notificación a Telegram`
      );
      return; // No enviar notificación a Telegram si tiene la app abierta
    }

    // Crear notificación persistente
    const notificacion = await crearNotificacionBot({
      transaccionId: transaccion._id,
      jugadorTelegramId: jugador.telegramId,
      tipo: "deposito_creado",
      titulo: "Solicitud de depósito creada",
      mensaje: `Has solicitado hacer un depósito por ${(
        transaccion.monto / 100
      ).toFixed(2)} Bs`,
      datos: {
        monto: transaccion.monto,
        referencia: transaccion.referencia,
      },
      eventoId: `deposito-creado-${transaccion._id}`,
    });

    if (!notificacion) {
      console.log(
        "⚠️ [BOT] Notificación duplicada o no creada para nuevo depósito"
      );
      return;
    }

    // Si hay bot conectado, emitir evento WebSocket
    if (context.socketManager.connectedBots.size > 0) {
      context.io.emit("bot-notificacion", {
        notificacionId: notificacion._id.toString(),
        tipo: notificacion.tipo,
        titulo: notificacion.titulo,
        mensaje: notificacion.mensaje,
        jugadorTelegramId: notificacion.jugadorTelegramId,
        datos: notificacion.datos,
      });
      console.log(`📬 [BOT] Notificación enviada vía WebSocket al bot`);
    } else {
      console.log(
        "⚠️ [BOT] No hay bot conectado, la notificación quedará pendiente para polling"
      );
    }
  } catch (error) {
    console.error(
      "❌ [BOT] Error creando/emitiendo notificación de nuevo depósito:",
      error.message
    );
  }
}

module.exports = {
  notificarBotSolicitudAceptada,
  notificarBotPagoConfirmado,
  notificarBotDepositoCompletado,
  notificarBotDepositoRechazado,
  notificarBotRetiroCompletado,
  notificarBotNuevoDeposito,
};
