/**
 * Handlers de pruebas y diagnóstico
 * Maneja eventos de prueba de notificaciones
 */

/**
 * Manejar prueba de notificación a cajeros disponibles
 */
function handleTestNotificationCajeros(context, socket, data) {
  const { roomsManager } = context;

  if (!socket.userType) {
    socket.emit("error", {
      message: "Debe estar autenticado para enviar notificaciones de prueba",
    });
    return;
  }

  const notificacion = {
    tipo: "prueba",
    mensaje: data.message || "Notificación de prueba a cajeros disponibles",
    timestamp: data.timestamp || new Date().toISOString(),
    enviadoPor:
      socket.userType === "cajero" ? socket.cajeroId : socket.telegramId,
  };

  // Enviar a todos los cajeros disponibles
  roomsManager.notificarCajerosDisponibles(
    "notificacion-prueba",
    notificacion
  );

  // Confirmar al emisor
  socket.emit("notificacion-enviada", {
    tipo: "cajeros-disponibles",
    destinatarios: roomsManager.rooms.cajerosDisponibles.size,
    mensaje: "Notificación enviada a cajeros disponibles",
  });

  console.log(
    `🧪 [TEST] Notificación de prueba enviada a ${roomsManager.rooms.cajerosDisponibles.size} cajeros disponibles`
  );
}

/**
 * Manejar prueba de notificación a jugador específico
 */
function handleTestNotificationJugador(context, socket, data) {
  const { roomsManager } = context;

  if (!socket.userType) {
    socket.emit("error", {
      message: "Debe estar autenticado para enviar notificaciones de prueba",
    });
    return;
  }

  const { telegramId } = data;
  if (!telegramId) {
    socket.emit("error", {
      message: "telegramId requerido para notificar jugador específico",
    });
    return;
  }

  const notificacion = {
    tipo: "prueba",
    mensaje: data.message || "Notificación de prueba a jugador específico",
    timestamp: data.timestamp || new Date().toISOString(),
    enviadoPor:
      socket.userType === "cajero" ? socket.cajeroId : socket.telegramId,
  };

  // Enviar al jugador específico
  roomsManager.notificarJugador(
    telegramId,
    "notificacion-prueba",
    notificacion
  );

  // Confirmar al emisor
  socket.emit("notificacion-enviada", {
    tipo: "jugador-especifico",
    destinatario: telegramId,
    mensaje: `Notificación enviada a jugador ${telegramId}`,
  });

  console.log(
    `🧪 [TEST] Notificación de prueba enviada a jugador ${telegramId}`
  );
}

/**
 * Manejar prueba de notificación a transacción
 */
function handleTestNotificationTransaccion(context, socket, data) {
  const { roomsManager } = context;

  if (!socket.userType) {
    socket.emit("error", {
      message: "Debe estar autenticado para enviar notificaciones de prueba",
    });
    return;
  }

  const { transaccionId } = data;
  if (!transaccionId) {
    socket.emit("error", {
      message: "transaccionId requerido para notificar transacción",
    });
    return;
  }

  const notificacion = {
    tipo: "prueba",
    mensaje: data.message || "Notificación de prueba a transacción",
    timestamp: data.timestamp || new Date().toISOString(),
    transaccionId: transaccionId,
    enviadoPor:
      socket.userType === "cajero" ? socket.cajeroId : socket.telegramId,
  };

  // Enviar a participantes de la transacción
  roomsManager.notificarTransaccion(
    transaccionId,
    "notificacion-prueba",
    notificacion
  );

  // Confirmar al emisor
  const participantes =
    roomsManager.rooms.transacciones.get(transaccionId);
  socket.emit("notificacion-enviada", {
    tipo: "transaccion",
    transaccionId: transaccionId,
    destinatarios: participantes ? participantes.size : 0,
    mensaje: `Notificación enviada a transacción ${transaccionId}`,
  });

  console.log(
    `🧪 [TEST] Notificación de prueba enviada a transacción ${transaccionId}`
  );
}

module.exports = {
  handleTestNotificationCajeros,
  handleTestNotificationJugador,
  handleTestNotificationTransaccion,
};
