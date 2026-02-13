/**
 * Handler para solicitud de depósito desde jugador
 */

const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const { registrarLog } = require("../../../utils/logHelper");
const { notificarCajerosNuevaSolicitud } = require("../notificaciones/notificacionesCajero");
const { notificarBotNuevoDeposito } = require("../notificaciones/notificacionesBot");
const { notificarNuevaSolicitudDeposito } = require("../notificaciones/notificacionesAdmin");

/**
 * Manejar solicitud de depósito desde jugador
 * Evento: 'solicitar-deposito'
 * @param {Object} context - Contexto con socketManager, io, roomsManager
 * @param {Object} socket - Socket del jugador
 * @param {Object} data - Datos de la solicitud
 */
async function solicitarDeposito(context, socket, data) {
  try {
    console.log("💰 [DEPOSITO] Nueva solicitud de depósito:", data);

    // Validar datos requeridos
    const { monto, metodoPago, descripcion } = data;
    if (!monto || !metodoPago || !descripcion) {
      socket.emit("error", {
        message: "Faltan datos requeridos: monto, metodoPago, descripcion",
      });
      return;
    }

    // Validar que el socket esté autenticado como jugador
    if (!socket.userType || socket.userType !== "jugador") {
      socket.emit("error", {
        message: "Solo los jugadores pueden solicitar depósitos",
      });
      return;
    }

    // Obtener datos del jugador desde la conexión
    const jugadorId = socket.jugadorId;
    const telegramId = socket.telegramId;

    if (!jugadorId || !telegramId) {
      socket.emit("error", {
        message: "Datos de jugador no encontrados",
      });
      return;
    }

    // Verificar que el jugador existe
    const jugador = await Jugador.findById(jugadorId);
    if (!jugador) {
      socket.emit("error", {
        message: "Jugador no encontrado",
      });
      return;
    }

    // Crear transacción de depósito
    const transaccion = new Transaccion({
      jugadorId,
      telegramId,
      tipo: "credito",
      categoria: "deposito",
      monto: parseFloat(monto),
      saldoAnterior: jugador.saldo || 0,
      descripcion,
      referencia: Transaccion.generarReferencia("deposito", jugadorId),
      estado: "pendiente",
      infoPago: {
        metodoPago: metodoPago,
      },
      metadata: {
        procesadoPor: "websocket",
        tipoOperacion: "solicitud_deposito",
        socketId: socket.id,
      },
    });

    await transaccion.save();

    console.log(`✅ [DEPOSITO] Transacción creada: ${transaccion._id}`);

    // AGREGAR JUGADOR AL ROOM DE LA TRANSACCIÓN INMEDIATAMENTE
    // Esto permite que el sistema de recovery detecte la transacción activa
    context.roomsManager.crearRoomTransaccion(transaccion._id, [
      { socketId: socket.id },
    ]);

    console.log(
      `📢 [DEPOSITO] Jugador agregado al room de transacción ${transaccion._id}`
    );

    // Notificar al jugador que la solicitud fue creada
    socket.emit("solicitud-creada", {
      transaccionId: transaccion._id,
      referencia: transaccion.referencia,
      monto: transaccion.monto,
      estado: transaccion.estado,
      timestamp: new Date().toISOString(),
    });

    // Notificar a todos los cajeros conectados
    await notificarCajerosNuevaSolicitud(context, transaccion, jugador);

    // Crear y emitir notificación al bot para el jugador
    await notificarBotNuevoDeposito(context, transaccion, jugador);

    // Notificar a admins del dashboard sobre nueva transacción (tiempo real + persistente)
    if (context.roomsManager) {
      context.roomsManager.notificarAdmins("transaction-update", {
        transaccionId: transaccion._id,
        estado: transaccion.estado,
        categoria: transaccion.categoria,
        tipo: "nueva-transaccion",
        monto: transaccion.monto,
        jugadorId: transaccion.jugadorId,
      });
    }
    await notificarNuevaSolicitudDeposito(transaccion, jugador);

    // Registrar log
    await registrarLog({
      accion: "Solicitud de depósito creada via WebSocket",
      usuario: jugadorId,
      rol: "jugador",
      detalle: {
        transaccionId: transaccion._id,
        monto: transaccion.monto,
        metodoPago: metodoPago,
        socketId: socket.id,
      },
    });
  } catch (error) {
    console.error("❌ [DEPOSITO] Error en solicitarDeposito:", error);
    socket.emit("error", {
      message: "Error interno del servidor",
      details: error.message,
    });
  }
}

module.exports = {
  solicitarDeposito,
};
