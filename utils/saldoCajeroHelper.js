/**
 * Utilidad para actualizar saldo de cajero
 * Maneja la actualización del saldo y la creación del historial
 */

const Cajero = require("../models/Cajero");
const SaldoCajero = require("../models/SaldoCajero");

/**
 * Actualizar saldo del cajero y crear registro en historial
 * @param {ObjectId} cajeroId - ID del cajero
 * @param {Number} monto - Monto a agregar (positivo) o restar (negativo) en centavos
 * @param {String} tipo - Tipo de operación: "deposito", "retiro", "ajuste_manual"
 * @param {ObjectId} transaccionId - ID de la transacción (opcional, solo para depósitos/retiros)
 * @param {String} descripcion - Descripción de la operación (opcional)
 * @param {Object} session - Sesión de MongoDB para transacciones (opcional)
 * @returns {Promise<Object>} Objeto con saldoAnterior, saldoNuevo y registro de historial
 */
async function actualizarSaldoCajero(
  cajeroId,
  monto,
  tipo,
  transaccionId = null,
  descripcion = null,
  session = null
) {
  try {
    // Obtener cajero con o sin sesión
    const cajero = session
      ? await Cajero.findById(cajeroId).session(session)
      : await Cajero.findById(cajeroId);

    if (!cajero) {
      throw new Error(`Cajero con ID ${cajeroId} no encontrado`);
    }

    // Obtener saldo actual (si no existe, usar 0)
    const saldoAnterior = cajero.saldo || 0;

    // Calcular nuevo saldo
    const saldoNuevo = saldoAnterior + monto;

    // Validar que el saldo no sea negativo
    if (saldoNuevo < 0) {
      throw new Error(
        `El saldo resultante sería negativo: ${saldoAnterior} + ${monto} = ${saldoNuevo}`
      );
    }

    // Actualizar saldo del cajero
    cajero.saldo = saldoNuevo;
    if (session) {
      await cajero.save({ session });
    } else {
      await cajero.save();
    }

    // Crear descripción por defecto si no se proporciona
    let descripcionFinal = descripcion;
    if (!descripcionFinal) {
      switch (tipo) {
        case "deposito":
          descripcionFinal = `Depósito procesado exitosamente`;
          break;
        case "retiro":
          descripcionFinal = `Retiro procesado exitosamente`;
          break;
        case "ajuste_manual":
          descripcionFinal = `Ajuste manual de saldo`;
          break;
        default:
          descripcionFinal = `Actualización de saldo`;
      }
    }

    // Crear registro en historial
    const historialData = {
      cajeroId: cajeroId,
      monto: monto,
      saldoAnterior: saldoAnterior,
      saldoNuevo: saldoNuevo,
      tipo: tipo,
      descripcion: descripcionFinal,
    };

    if (transaccionId) {
      historialData.transaccionId = transaccionId;
    }

    const registroHistorial = new SaldoCajero(historialData);
    if (session) {
      await registroHistorial.save({ session });
    } else {
      await registroHistorial.save();
    }

    console.log(
      `✅ [SALDO CAJERO] Saldo actualizado para cajero ${cajeroId}: ${saldoAnterior} -> ${saldoNuevo} (${tipo}, monto: ${monto})`
    );

    return {
      saldoAnterior,
      saldoNuevo,
      registroHistorial,
    };
  } catch (error) {
    console.error(
      `❌ [SALDO CAJERO] Error actualizando saldo del cajero ${cajeroId}:`,
      error
    );
    throw error;
  }
}

module.exports = {
  actualizarSaldoCajero,
};
