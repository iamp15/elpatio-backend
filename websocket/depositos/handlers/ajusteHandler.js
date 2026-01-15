/**
 * Handler para ajuste de monto de depósito
 */

const Transaccion = require("../../../models/Transaccion");
const mongoose = require("mongoose");
const { registrarLog } = require("../../../utils/logHelper");
const { notificarJugadorAjusteMonto } = require("../notificaciones/notificacionesJugador");

/**
 * Ajustar monto de depósito
 * Evento: 'ajustar-monto-deposito'
 * @param {Object} context - Contexto con socketManager, io, roomsManager, processingTransactions
 * @param {Object} socket - Socket del cajero
 * @param {Object} data - Datos del ajuste
 */
async function ajustarMontoDeposito(context, socket, data) {
  const session = await mongoose.startSession();

  try {
    console.log("💰 [DEPOSITO] Ajustar monto:", data);

    const { transaccionId, montoReal, razon } = data;

    // Validar datos requeridos
    if (!transaccionId || !montoReal) {
      socket.emit("error", {
        message: "ID de transacción y monto real requeridos",
      });
      return;
    }

    // Validar que el socket esté autenticado como cajero
    if (!socket.userType || socket.userType !== "cajero") {
      socket.emit("error", {
        message: "Solo los cajeros pueden ajustar montos",
      });
      return;
    }

    // Verificar si ya se está procesando esta transacción
    if (context.processingTransactions.has(transaccionId)) {
      socket.emit("error", {
        message: "La transacción ya está siendo procesada",
      });
      return;
    }

    // Marcar como procesando
    context.processingTransactions.add(transaccionId);

    await session.startTransaction();

    // Buscar la transacción
    const transaccion = await Transaccion.findById(transaccionId).session(
      session
    );

    if (!transaccion) {
      await session.abortTransaction();
      context.processingTransactions.delete(transaccionId);
      socket.emit("error", {
        message: "Transacción no encontrada",
      });
      return;
    }

    // Verificar que la transacción esté en estado "realizada"
    if (transaccion.estado !== "realizada") {
      await session.abortTransaction();
      context.processingTransactions.delete(transaccionId);
      socket.emit("error", {
        message: `La transacción debe estar en estado "realizada". Estado actual: ${transaccion.estado}`,
      });
      return;
    }

    // Obtener configuración de monto mínimo
    const ConfiguracionSistema = require("../../../models/ConfiguracionSistema");
    const montoMinimoBs =
      (await ConfiguracionSistema.obtenerValor("deposito_monto_minimo")) || 10;

    // Convertir monto mínimo de bolívares a centavos para comparar con montoReal
    const montoMinimoCentavos = montoMinimoBs * 100;

    console.log(
      `💰 [DEPOSITO] Validando monto ajustado: montoReal=${montoReal} centavos (${(
        montoReal / 100
      ).toFixed(
        2
      )} Bs), montoMinimo=${montoMinimoCentavos} centavos (${montoMinimoBs} Bs)`
    );

    // Validar que el monto real sea mayor o igual al mínimo
    if (montoReal < montoMinimoCentavos) {
      console.log(
        `❌ [DEPOSITO] Monto ajustado rechazado: ${montoReal} centavos < ${montoMinimoCentavos} centavos (mínimo)`
      );
      await session.abortTransaction();
      context.processingTransactions.delete(transaccionId);
      socket.emit("error", {
        message: `El monto real debe ser mayor o igual al mínimo (${montoMinimoBs} Bs)`,
        montoMinimo: montoMinimoBs,
      });
      return;
    }

    console.log(
      `✅ [DEPOSITO] Monto ajustado válido: ${montoReal} centavos >= ${montoMinimoCentavos} centavos (mínimo)`
    );

    // Guardar información del ajuste
    transaccion.ajusteMonto = {
      montoOriginal: transaccion.monto,
      montoReal: montoReal,
      razon: razon || "Ajuste de monto por discrepancia",
      fechaAjuste: new Date(),
      ajustadoPor: socket.cajeroId,
    };

    // Actualizar el monto de la transacción
    const montoOriginal = transaccion.monto;
    transaccion.monto = montoReal;

    await transaccion.save({ session });

    console.log(
      `✅ [DEPOSITO] Monto ajustado para ${transaccionId}: ${montoOriginal} -> ${montoReal}`
    );

    // Notificar al cajero que puede continuar con la confirmación
    const datosAjuste = {
      transaccionId: transaccion._id.toString(), // Convertir ObjectId a string
      montoOriginal,
      montoReal,
      razon: razon || "Ajuste de monto por discrepancia",
      mensaje: "Monto ajustado exitosamente. Ahora puedes confirmar el pago.",
      timestamp: new Date().toISOString(),
    };
    console.log(
      `💰 [DEPOSITO] Enviando evento monto-ajustado al cajero ${socket.cajeroId} (socket ${socket.id}):`,
      datosAjuste
    );
    console.log(
      `💰 [DEPOSITO] Socket conectado: ${socket.connected}, Socket ID: ${socket.id}`
    );
    socket.emit("monto-ajustado", datosAjuste);
    console.log(
      `💰 [DEPOSITO] Evento monto-ajustado enviado al cajero ${socket.cajeroId}`
    );

    // Notificar al jugador sobre el ajuste de monto
    await notificarJugadorAjusteMonto(
      context,
      transaccion,
      montoOriginal,
      montoReal,
      razon
    );

    // Registrar log
    await registrarLog({
      accion: "Monto de depósito ajustado",
      usuario: socket.cajeroId,
      rol: "cajero",
      detalle: {
        transaccionId: transaccion._id,
        jugadorId: transaccion.jugadorId,
        montoOriginal,
        montoReal,
        razon,
        socketId: socket.id,
      },
    });

    await session.commitTransaction();
    context.processingTransactions.delete(transaccionId);
    await session.endSession();
  } catch (error) {
    await session.abortTransaction();
    await session.endSession();
    console.error("❌ [DEPOSITO] Error en ajustarMontoDeposito:", error);
    context.processingTransactions.delete(data.transaccionId);
    socket.emit("error", {
      message: "Error interno del servidor",
      details: error.message,
    });
  }
}

module.exports = {
  ajustarMontoDeposito,
};
