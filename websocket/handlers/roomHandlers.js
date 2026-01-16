/**
 * Handlers relacionados con rooms de WebSocket
 * Maneja operaciones de rooms de transacciones y cajeros
 */

/**
 * Manejar cambio de estado de cajero
 */
function handleCambiarEstadoCajero(context, socket, data) {
  const { roomsManager } = context;

  if (socket.userType !== "cajero") {
    socket.emit("error", {
      message: "Solo cajeros pueden cambiar su estado",
    });
    return;
  }

  const { estado } = data; // "disponible" o "ocupado"

  if (estado === "disponible") {
    roomsManager.agregarCajeroDisponible(socket.cajeroId, socket.id);
    socket.emit("estado-cambiado", {
      estado: "disponible",
      message: "Estado cambiado a disponible",
    });
  } else if (estado === "ocupado") {
    roomsManager.moverCajeroAOcupado(socket.cajeroId, socket.id);
    socket.emit("estado-cambiado", {
      estado: "ocupado",
      message: "Estado cambiado a ocupado",
    });
  } else {
    socket.emit("error", {
      message: "Estado inválido. Use 'disponible' o 'ocupado'",
    });
  }
}

/**
 * Manejar unirse a room de transacción
 */
function handleUnirseTransaccion(context, socket, data) {
  const { roomsManager } = context;
  const { transaccionId } = data;

  if (!transaccionId) {
    socket.emit("error", {
      message: "ID de transacción requerido",
    });
    return;
  }

  roomsManager.agregarParticipanteTransaccion(transaccionId, socket.id);
  socket.emit("unido-transaccion", {
    transaccionId,
    message: `Unido a transacción ${transaccionId}`,
  });
}

/**
 * Manejar salir de room de transacción
 */
function handleSalirTransaccion(context, socket, data) {
  const { io } = context;
  const { transaccionId } = data;

  if (!transaccionId) {
    socket.emit("error", {
      message: "ID de transacción requerido",
    });
    return;
  }

  const socketObj = io.sockets.sockets.get(socket.id);
  if (socketObj) {
    socketObj.leave(`transaccion-${transaccionId}`);
  }

  socket.emit("salido-transaccion", {
    transaccionId,
    message: `Salido de transacción ${transaccionId}`,
  });
}

/**
 * Manejar obtener estadísticas de rooms
 */
function handleObtenerStatsRooms(context, socket) {
  const { roomsManager } = context;
  const stats = roomsManager.getStats();
  socket.emit("stats-rooms", stats);
}

/**
 * Manejar diagnóstico de rooms de transacciones
 */
function handleDiagnosticarRoomsTransacciones(context, socket) {
  const { roomsManager } = context;

  // Verificar permisos (solo admins/cajeros)
  if (socket.userType !== "cajero" && socket.userType !== "admin") {
    socket.emit("error", {
      message: "Solo cajeros y administradores pueden diagnosticar rooms",
    });
    return;
  }

  const diagnostico = roomsManager.diagnosticarRoomsTransacciones();
  socket.emit("diagnostico-rooms-transacciones", diagnostico);

  console.log(
    `🔍 [DIAGNOSTICO] Diagnóstico de rooms enviado a ${socket.id}:`,
    {
      total: diagnostico.totalRooms,
      conParticipantes: diagnostico.roomsConParticipantes,
      vacios: diagnostico.roomsVacios,
      protegidos: diagnostico.roomsProtegidos,
      huerfanos: diagnostico.roomsHuerfanos,
    }
  );
}

/**
 * Manejar limpieza de rooms huérfanos
 */
function handleLimpiarRoomsHuerfanos(context, socket) {
  const { roomsManager } = context;

  // Verificar permisos (solo admins/cajeros)
  if (socket.userType !== "cajero" && socket.userType !== "admin") {
    socket.emit("error", {
      message: "Solo cajeros y administradores pueden limpiar rooms",
    });
    return;
  }

  const resultado = roomsManager.limpiarRoomsVacios();
  socket.emit("limpieza-rooms-completada", resultado);

  console.log(
    `🧹 [LIMPIEZA] Limpieza de rooms completada por ${socket.id}:`,
    {
      limpiados: resultado.limpiados,
      protegidos: resultado.protegidos,
      conParticipantes: resultado.conParticipantes,
    }
  );
}

/**
 * Manejar unirse a room de transacción (para reconexión)
 */
function handleUnirseRoomTransaccion(context, socket, data) {
  const { roomsManager } = context;

  try {
    const { transaccionId } = data;

    // Verificar que el socket esté autenticado
    if (!socket.userType) {
      socket.emit("error", {
        message: "Debe estar autenticado para unirse a rooms",
      });
      return;
    }

    console.log(
      `🔄 [ROOM] ${socket.userType} ${socket.id} se une a room de transacción ${transaccionId}`
    );

    // Agregar al room de transacción
    roomsManager.agregarParticipanteTransaccion(
      transaccionId,
      socket.id,
      socket.userType
    );

    // Confirmar unión al room
    socket.emit("room-transaccion-unido", {
      transaccionId,
      message: `Unido a room de transacción ${transaccionId}`,
    });
  } catch (error) {
    console.error("❌ Error uniéndose a room de transacción:", error);
    socket.emit("error", {
      message: "Error uniéndose a room de transacción",
    });
  }
}

module.exports = {
  handleCambiarEstadoCajero,
  handleUnirseTransaccion,
  handleSalirTransaccion,
  handleObtenerStatsRooms,
  handleDiagnosticarRoomsTransacciones,
  handleLimpiarRoomsHuerfanos,
  handleUnirseRoomTransaccion,
};
