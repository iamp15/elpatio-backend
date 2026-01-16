/**
 * Handlers del dashboard de administración
 * Maneja eventos relacionados con el dashboard de estado en tiempo real
 */

/**
 * Manejar obtener estado completo del sistema
 */
function handleObtenerEstadoCompleto(context, socket) {
  const { connectionStateManager } = context;
  const estado = connectionStateManager.getEstadoCompleto();
  socket.emit("estado-completo", estado);
  console.log(`📊 [DASHBOARD] Estado completo enviado a ${socket.id}`);
}

/**
 * Manejar obtener solo estadísticas
 */
function handleObtenerEstadisticas(context, socket) {
  const { connectionStateManager } = context;
  const estadisticas = connectionStateManager.getEstadisticas();
  socket.emit("estadisticas", estadisticas);
  console.log(`📊 [DASHBOARD] Estadísticas enviadas a ${socket.id}`);
}

/**
 * Manejar obtener estado de cajeros
 */
function handleObtenerEstadoCajeros(context, socket) {
  const { connectionStateManager } = context;
  const cajeros = connectionStateManager.getEstadoCajeros();
  socket.emit("estado-cajeros", cajeros);
  console.log(`🏦 [DASHBOARD] Estado de cajeros enviado a ${socket.id}`);
}

/**
 * Manejar obtener estado de jugadores
 */
function handleObtenerEstadoJugadores(context, socket) {
  const { connectionStateManager } = context;
  const jugadores = connectionStateManager.getEstadoJugadores();
  socket.emit("estado-jugadores", jugadores);
  console.log(`👤 [DASHBOARD] Estado de jugadores enviado a ${socket.id}`);
}

/**
 * Manejar obtener estado de transacciones
 */
function handleObtenerEstadoTransacciones(context, socket) {
  const { connectionStateManager } = context;
  const transacciones = connectionStateManager.getEstadoTransacciones();
  socket.emit("estado-transacciones", transacciones);
  console.log(
    `💰 [DASHBOARD] Estado de transacciones enviado a ${socket.id}`
  );
}

/**
 * Manejar unirse al dashboard de administración
 */
function handleUnirseDashboard(context, socket) {
  const { roomsManager, connectionStateManager } = context;

  // Verificar si el usuario tiene permisos de administración
  if (socket.userType !== "cajero" && socket.userType !== "admin" && socket.userType !== "superadmin") {
    socket.emit("error", {
      message: "Solo cajeros y administradores pueden acceder al dashboard",
    });
    return;
  }

  // Unirse al room de administración
  roomsManager.agregarAdmin(socket.id);

  // Enviar estado actual
  const estado = connectionStateManager.getEstadoCompleto();
  socket.emit("dashboard-conectado", {
    message: "Conectado al dashboard de administración",
    estado: estado,
  });

  console.log(
    `👑 [DASHBOARD] Usuario ${socket.userType} se unió al dashboard`
  );
}

module.exports = {
  handleObtenerEstadoCompleto,
  handleObtenerEstadisticas,
  handleObtenerEstadoCajeros,
  handleObtenerEstadoJugadores,
  handleObtenerEstadoTransacciones,
  handleUnirseDashboard,
};
