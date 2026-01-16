/**
 * Handlers legacy para compatibilidad hacia atrás
 * Estos handlers mantienen compatibilidad con versiones anteriores
 * Algunos delegan a depositoController para el flujo oficial
 */

/**
 * Manejar solicitud de depósito (legacy)
 */
function handleSolicitarDeposito(context, socket, data) {
  const { io, socketManager } = context;

  if (socket.userType !== "jugador") {
    socket.emit("error", {
      message: "Solo jugadores pueden solicitar depósitos",
    });
    return;
  }

  console.log(
    `💰 Solicitud de depósito de jugador ${socket.telegramId}:`,
    data
  );

  // Notificar a todos los cajeros conectados
  socketManager.connectedCajeros.forEach((cajeroSocketId, cajeroId) => {
    const cajeroSocket = io.sockets.sockets.get(cajeroSocketId);
    if (cajeroSocket) {
      cajeroSocket.emit("nueva-solicitud-deposito", {
        jugadorId: socket.telegramId,
        socketId: socket.id,
        ...data,
      });
    }
  });

  socket.emit("solicitud-enviada", {
    message: "Solicitud enviada a cajeros",
  });
}

/**
 * Manejar atención de depósito por cajero (legacy)
 */
function handleAtenderDeposito(context, socket, data) {
  const { io } = context;

  if (socket.userType !== "cajero") {
    socket.emit("error", {
      message: "Solo cajeros pueden atender depósitos",
    });
    return;
  }

  const { jugadorSocketId } = data;
  const jugadorSocket = io.sockets.sockets.get(jugadorSocketId);

  if (jugadorSocket) {
    jugadorSocket.emit("deposito-atendido", {
      cajeroId: socket.cajeroId,
      message: "Tu solicitud está siendo atendida",
    });
  }

  console.log(`🏦 Cajero ${socket.cajeroId} atendiendo depósito de jugador`);
}

/**
 * Manejar confirmación de depósito (legacy)
 */
function handleConfirmarDeposito(context, socket, data) {
  const { io, depositoController } = context;

  if (socket.userType !== "cajero") {
    socket.emit("error", {
      message: "Solo cajeros pueden confirmar depósitos",
    });
    return;
  }

  const { jugadorSocketId, transaccionId, notas } = data || {};

  // Compatibilidad hacia atrás: antes solo notificábamos al jugador.
  // Ahora delegamos al flujo oficial que CONFIRMA y COMPLETA la transacción,
  // acredita saldo y emite los eventos correspondientes.
  try {
    console.log(
      "🔄 [BACKCOMPAT] Delegando confirmar-deposito -> verificar-pago-cajero (confirmar)",
      { transaccionId, socketId: socket.id }
    );
    depositoController.verificarPagoCajero(socket, {
      transaccionId,
      accion: "confirmar",
      notas: notas || "Confirmado vía confirmar-deposito (compatibilidad)",
    });
  } catch (error) {
    console.error("❌ Error delegando confirmar-deposito:", error);
    socket.emit("error", { message: "Error confirmando depósito" });
  }

  // Además, mantener la notificación directa al jugador por compatibilidad
  if (jugadorSocketId) {
    const jugadorSocket = io.sockets.sockets.get(jugadorSocketId);
    if (jugadorSocket) {
      jugadorSocket.emit("deposito-confirmado", {
        transaccionId,
        message: "Depósito confirmado exitosamente",
      });
    }
  }

  console.log(`✅ Depósito confirmado por cajero ${socket.cajeroId}`);
}

/**
 * Manejar rechazo de depósito (legacy)
 */
function handleRechazarDeposito(context, socket, data) {
  const { io } = context;

  if (socket.userType !== "cajero") {
    socket.emit("error", {
      message: "Solo cajeros pueden rechazar depósitos",
    });
    return;
  }

  const { jugadorSocketId, motivo } = data;
  const jugadorSocket = io.sockets.sockets.get(jugadorSocketId);

  if (jugadorSocket) {
    jugadorSocket.emit("deposito-rechazado", {
      motivo,
      message: "Depósito rechazado",
    });
  }

  console.log(
    `❌ Depósito rechazado por cajero ${socket.cajeroId}: ${motivo}`
  );
}

module.exports = {
  handleSolicitarDeposito,
  handleAtenderDeposito,
  handleConfirmarDeposito,
  handleRechazarDeposito,
};
