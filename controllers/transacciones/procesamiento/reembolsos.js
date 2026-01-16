const { _procesarTransaccionInterna } = require("./procesamientoAutomatico");
const mongoose = require("mongoose");

/**
 * Procesa reembolso automático por diferentes motivos
 * FUNCIÓN AUXILIAR - Se llama desde otros controladores
 * @param {string} jugadorId - ID del jugador
 * @param {number} monto - Monto a reembolsar en centavos
 * @param {string} motivo - Descripción del motivo del reembolso
 * @param {Object} referenciaExterna - Datos adicionales (salaId, etc.)
 * @param {Object} metadata - Información del contexto
 * @returns {Object} Resultado del reembolso
 */
async function procesarReembolso(
  jugadorId,
  monto,
  motivo,
  referenciaExterna = {},
  metadata = {}
) {
  const session = await mongoose.startSession();

  try {
    // Validaciones basicas
    if (!jugadorId || !monto || monto <= 0) {
      throw new Error("Parámetros inválidos para reembolso");
    }

    await session.startTransaction();

    // Preparar datos de la transacción
    const datosTransaccion = {
      jugadorId,
      tipo: "credito",
      categoria: "reembolso",
      monto: Number(monto),
      descripcion: motivo,
      referenciaExterna,
      metadata: {
        procesadoPor: "backend",
        tipoOperacion: "reembolso_automatico",
        rol: metadata.rol || "sistema",
        ...metadata,
      },
    };

    // Procesar usando la función interna directamente
    const resultado = await _procesarTransaccionInterna(
      datosTransaccion,
      session,
      metadata.usuarioAccion || null
    );

    await session.commitTransaction();

    return {
      exito: true,
      monto,
      referencia: resultado.transaccion?.referencia,
      saldoAnterior: resultado.saldoAnterior,
      saldoNuevo: resultado.saldoNuevo,
      transaccionId: resultado.transaccion?._id,
      descripcion: motivo,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("❌ [AUXILIAR] Error procesando reembolso:", error.message);

    return {
      exito: false,
      error: error.message,
      monto,
      jugadorId,
    };
  } finally {
    await session.endSession();
  }
}

/**
 * Procesa múltiples reembolsos (para cancelación de salas)
 * FUNCIÓN AUXILIAR - Reutilizable para operaciones masivas
 */
async function procesarReembolsosMasivos(
  jugadores,
  monto,
  motivo,
  referenciaExterna = {},
  metadata = {}
) {
  console.log(
    `💰 [AUXILIAR] Procesando ${jugadores.length} reembolsos masivos`
  );

  const resultados = [];
  const errores = [];

  for (const jugadorId of jugadores) {
    try {
      const resultado = await procesarReembolso(
        jugadorId,
        monto,
        motivo,
        { ...referenciaExterna, jugadorId },
        metadata
      );

      resultados.push({ jugadorId, resultado });
    } catch (error) {
      errores.push({ jugadorId, error: error.message });
    }
  }

  return {
    exitosos: resultados.filter((r) => r.resultado.exito),
    fallidos: [...resultados.filter((r) => !r.resultado.exito), ...errores],
    totalProcesados: resultados.length,
    totalErrores: errores.length,
  };
}

module.exports = {
  procesarReembolso,
  procesarReembolsosMasivos,
};
