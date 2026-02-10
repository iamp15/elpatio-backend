/**
 * Handler para solicitud de retiro desde jugador
 */

const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const Cajero = require("../../../models/Cajero");
const ConfiguracionSistema = require("../../../models/ConfiguracionSistema");
const { registrarLog } = require("../../../utils/logHelper");
const { notificarCajerosNuevaSolicitudRetiro } = require("../notificaciones/notificacionesCajero");
const {
  crearNotificacionInterna,
} = require("../../../controllers/notificacionesController");

/**
 * Manejar solicitud de retiro desde jugador
 * Evento: 'solicitar-retiro'
 * @param {Object} context - Contexto con socketManager, io, roomsManager
 * @param {Object} socket - Socket del jugador
 * @param {Object} data - Datos de la solicitud
 */
async function solicitarRetiro(context, socket, data) {
  try {
    console.log("💸 [RETIRO] Nueva solicitud de retiro:", data);

    // Validar datos requeridos
    const { monto, metodoPago, descripcion, datosPago } = data;
    if (!monto || !metodoPago || !descripcion || !datosPago) {
      socket.emit("error", {
        message:
          "Faltan datos requeridos: monto, metodoPago, descripcion, datosPago",
      });
      return;
    }

    const { banco, telefono, cedula } = datosPago;
    if (!banco || !telefono || !cedula) {
      socket.emit("error", {
        message:
          "Faltan datos de pago móvil: banco, telefono, cedula (donde recibir)",
      });
      return;
    }

    // Validar que el socket esté autenticado como jugador
    if (!socket.userType || socket.userType !== "jugador") {
      socket.emit("error", {
        message: "Solo los jugadores pueden solicitar retiros",
      });
      return;
    }

    const jugadorId = socket.jugadorId;
    const telegramId = socket.telegramId;

    if (!jugadorId || !telegramId) {
      socket.emit("error", {
        message: "Datos de jugador no encontrados",
      });
      return;
    }

    const jugador = await Jugador.findById(jugadorId);
    if (!jugador) {
      socket.emit("error", {
        message: "Jugador no encontrado",
      });
      return;
    }

    const montoNum = parseFloat(monto);

    // Validación 1: monto >= retiro_monto_minimo
    const montoMinimo =
      (await ConfiguracionSistema.obtenerValor("retiro_monto_minimo")) || 10;
    const montoMinimoCentavos = montoMinimo * 100; // Config está en Bs, monto en centavos
    if (montoNum < montoMinimoCentavos) {
      socket.emit("error", {
        message: `El monto mínimo para retiros es ${montoMinimo} Bs`,
      });
      return;
    }

    // Validación 2: jugador.saldo >= monto
    const saldoJugador = jugador.saldo || 0;
    if (saldoJugador < montoNum) {
      socket.emit("error", {
        message: "Saldo insuficiente para el retiro",
      });
      return;
    }

    // Crear transacción de retiro
    const transaccion = new Transaccion({
      jugadorId,
      telegramId,
      tipo: "debito",
      categoria: "retiro",
      monto: montoNum,
      saldoAnterior: saldoJugador,
      descripcion,
      referencia: Transaccion.generarReferencia("retiro", jugadorId),
      estado: "pendiente",
      infoPago: {
        metodoPago: metodoPago,
        bancoDestino: banco,
        telefonoOrigen: telefono,
        cedulaOrigen: cedula,
      },
      metadata: {
        procesadoPor: "websocket",
        tipoOperacion: "solicitud_retiro",
        socketId: socket.id,
      },
    });

    await transaccion.save();

    console.log(`✅ [RETIRO] Transacción creada: ${transaccion._id}`);

    // Agregar jugador al room de la transacción
    context.roomsManager.crearRoomTransaccion(transaccion._id, [
      { socketId: socket.id },
    ]);

    // Notificar al jugador que la solicitud fue creada (siempre, transparente para él)
    socket.emit("solicitud-creada", {
      transaccionId: transaccion._id,
      referencia: transaccion.referencia,
      monto: transaccion.monto,
      estado: transaccion.estado,
      timestamp: new Date().toISOString(),
    });

    // Consultar cajeros con saldo suficiente
    const cajerosConSaldo = await Cajero.find({
      estado: "activo",
      saldo: { $gte: montoNum },
    }).select("_id saldo");

    if (cajerosConSaldo.length > 0) {
      // Hay cajeros con saldo: notificar solo a esos
      await notificarCajerosNuevaSolicitudRetiro(
        context,
        transaccion,
        jugador,
        cajerosConSaldo
      );
      console.log(
        `📢 [RETIRO] Notificados ${cajerosConSaldo.length} cajeros con saldo suficiente`
      );
    } else {
      // No hay cajeros con saldo: marcar como retiro_pendiente_asignacion (transparente para jugador)
      transaccion.estado = "retiro_pendiente_asignacion";
      await transaccion.save();

      console.log(
        `⚠️ [RETIRO] No hay cajeros con saldo suficiente. Transacción ${transaccion._id} marcada como retiro_pendiente_asignacion`
      );

      // Notificar a administradores (crear notificación interna para cada admin)
      try {
        const Admin = require("../../../models/Admin");
        const admins = await Admin.find({ estado: "activo" });
        const mensajeNotif = `Retiro de ${(montoNum / 100).toFixed(2)} Bs de ${jugador.nickname || jugador.firstName || "Usuario"} requiere asignación manual. Ningún cajero tiene saldo suficiente.`;

        for (const admin of admins) {
          await crearNotificacionInterna({
            destinatarioId: admin._id,
            destinatarioTipo: "admin",
            tipo: "retiro_requiere_revision",
            titulo: "Retiro pendiente por falta de saldo en cajeros",
            mensaje: mensajeNotif,
            datos: {
              transaccionId: transaccion._id.toString(),
              monto: transaccion.monto,
              jugadorNombre: jugador.nickname || jugador.firstName || "Usuario",
              jugadorTelegramId: jugador.telegramId,
            },
            eventoId: `retiro-revision-${transaccion._id}-${admin._id}`,
          });
        }
      } catch (err) {
        console.error(
          "❌ [RETIRO] Error creando notificación admin:",
          err.message
        );
      }
    }

    await registrarLog({
      accion: "Solicitud de retiro creada via WebSocket",
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
    console.error("❌ [RETIRO] Error en solicitarRetiro:", error);
    socket.emit("error", {
      message: "Error interno del servidor",
      details: error.message,
    });
  }
}

module.exports = {
  solicitarRetiro,
};
