const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const mongoose = require("mongoose");
const { registrarLog } = require("../../../utils/logHelper");

/**
 * Función interna para procesar transacciones automáticas
 * Puede ser llamada desde HTTP o desde otras funciones auxiliares
 * @param {Object} datosTransaccion - Datos de la transacción
 * @param {mongoose.ClientSession} session - Sesión de MongoDB
 * @param {string|null} usuarioId - ID del usuario que ejecuta la acción (opcional)
 * @returns {Promise<Object>} Resultado del procesamiento
 */
async function _procesarTransaccionInterna(datosTransaccion, session, usuarioId = null) {
  const {
    jugadorId,
    tipo,
    categoria,
    monto,
    descripcion,
    referenciaExterna = {},
    metadata = {},
  } = datosTransaccion;

  console.log("🔍 [DEBUG] Validaciones básicas");

  // Validaciones básicas
  if (!jugadorId || !tipo || !categoria || !monto || !descripcion) {
    throw new Error(
      "Faltan campos requeridos: jugadorId, tipo, categoria, monto, descripcion"
    );
  }

  // Validar monto
  const montoNumerico = Number(monto);
  if (isNaN(montoNumerico) || montoNumerico <= 0) {
    throw new Error("El monto debe ser un número positivo");
  }

  // Validar tipo
  if (!["debito", "credito"].includes(tipo)) {
    throw new Error('El tipo debe ser "debito" o "credito"');
  }

  console.log("🔍 [DEBUG] Verificando jugador");
  // Verificar jugador
  const jugador = await Jugador.findById(jugadorId).session(session);
  if (!jugador) {
    throw new Error("Jugador no encontrado");
  }

  console.log("🔍 [DEBUG] Obteniendo saldo actual");
  const saldoActual = jugador.saldo || 0;

  console.log("🔍 [DEBUG] Validando saldo para débito");
  // Para débitos, verificar saldo suficiente
  if (tipo === "debito" && saldoActual < montoNumerico) {
    throw new Error("Saldo insuficiente");
  }

  console.log("🔍 [DEBUG] Calculando nuevo saldo");
  // Calcular nuevo saldo
  const nuevoSaldo =
    tipo === "debito"
      ? saldoActual - montoNumerico
      : saldoActual + montoNumerico;

  console.log("🔍 [DEBUG] Generando referencia");
  // Generar referencia única
  const referencia = await Transaccion.generarReferencia(
    categoria,
    jugadorId
  );

  console.log("🔍 [DEBUG] Creando transacción");
  // Crear la transacción
  const nuevaTransaccion = new Transaccion({
    jugadorId,
    telegramId: jugador.telegramId,
    tipo,
    categoria,
    monto: montoNumerico,
    descripcion,
    referencia,
    saldoAnterior: saldoActual,
    saldoNuevo: nuevoSaldo,
    estado: "completada", // Automáticas se completan inmediatamente
    referenciaExterna,
    metadata: {
      ...metadata,
      procesadoPor: "sistema",
      tipoOperacion: "automatica",
    },
    creadoPor: usuarioId || null,
  });

  console.log("🔍 [DEBUG] Guardando transacción");
  await nuevaTransaccion.save({ session });

  console.log("🔍 [DEBUG] Actualizando saldo del jugador");
  // Actualizar saldo del jugador
  await Jugador.findByIdAndUpdate(
    jugadorId,
    { saldo: nuevoSaldo },
    { session }
  );

  console.log("🔍 [DEBUG] Registrando log");
  // Registrar log (ajustar según tu sistema de logs)
  try {
    await registrarLog({
      accion: `Transacción ${tipo} procesada`,
      usuario: usuarioId || null,
      rol: metadata.rol || "sistema",
      detalle: {
        transaccionId: nuevaTransaccion._id,
        jugadorId,
        categoria,
        monto: montoNumerico,
        saldoAnterior: saldoActual,
        saldoNuevo: nuevoSaldo,
        referencia,
      },
    });
  } catch (logError) {
    console.warn("Error registrando log:", logError.message);
    // No fallar la transacción por error de log
  }

  return {
    exito: true,
    mensaje: "Transacción procesada exitosamente",
    transaccion: {
      _id: nuevaTransaccion._id,
      referencia: nuevaTransaccion.referencia,
      tipo: nuevaTransaccion.tipo,
      categoria: nuevaTransaccion.categoria,
      monto: nuevaTransaccion.monto,
      estado: nuevaTransaccion.estado,
      createdAt: nuevaTransaccion.createdAt,
    },
    saldoAnterior: saldoActual,
    saldoNuevo: nuevoSaldo,
  };
}

/**
 * Procesar transacción automática (desde bot o sistema)
 * POST /api/transacciones/procesar-automatica
 */
async function procesarTransaccionAutomatica(req, res) {
  console.log("🔍 [DEBUG] Iniciando procesarTransaccionAutomatica");
  console.log("🔍 [DEBUG] Body recibido:", req.body);

  const session = await mongoose.startSession();

  try {
    console.log("🔍 [DEBUG] Iniciando transacción de BD");
    await session.startTransaction();

    const resultado = await _procesarTransaccionInterna(
      req.body,
      session,
      req.user?._id || null
    );

    console.log("🔍 [DEBUG] Confirmando transacción");
    await session.commitTransaction();

    console.log("🔍 [DEBUG] Enviando respuesta exitosa");
    res.json(resultado);
  } catch (error) {
    console.log("🔍 [DEBUG] Error capturado:", error.message);
    console.error("Error procesando transacción automática:", error);

    await session.abortTransaction();

    // Determinar código de estado según el tipo de error
    let statusCode = 500;
    if (error.message.includes("Faltan campos requeridos") || 
        error.message.includes("debe ser") ||
        error.message.includes("Saldo insuficiente")) {
      statusCode = 400;
    } else if (error.message.includes("no encontrado")) {
      statusCode = 404;
    }

    res.status(statusCode).json({
      exito: false,
      mensaje: error.message || "Error interno procesando transacción",
      error: error.message,
    });
  } finally {
    console.log("🔍 [DEBUG] Cerrando sesión");
    await session.endSession();
  }
}

module.exports = {
  procesarTransaccionAutomatica,
  _procesarTransaccionInterna,
};
