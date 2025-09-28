const Transaccion = require("../models/Transaccion");
const Jugador = require("../models/Jugador");
const Cajero = require("../models/Cajero");
const mongoose = require("mongoose");
const { registrarLog } = require("../utils/logHelper");
const websocketHelper = require("../utils/websocketHelper");

// ===== ENDPOINTS PARA SOLICITUDES DE CAJERO =====

/**
 * Crear solicitud de depósito/retiro (para cajero)
 */
exports.crearSolicitudCajero = async (req, res) => {
  try {
    const {
      jugadorId,
      tipo, // 'credito' para depósito, 'debito' para retiro
      categoria, // 'deposito' o 'retiro'
      monto,
      descripcion,
      metodoPago,
    } = req.body;

    // Validaciones básicas
    if (!["deposito", "retiro"].includes(categoria)) {
      return res.status(400).json({
        mensaje: "Categoría debe ser deposito o retiro",
      });
    }

    if (!["credito", "debito"].includes(tipo)) {
      return res.status(400).json({
        mensaje: "Tipo debe ser credito o debito",
      });
    }

    // Validar consistencia tipo-categoría
    if (
      (categoria === "deposito" && tipo !== "credito") ||
      (categoria === "retiro" && tipo !== "debito")
    ) {
      return res.status(400).json({
        mensaje: "Tipo y categoría no son consistentes",
      });
    }

    const jugador = await Jugador.findById(jugadorId);
    if (!jugador) {
      return res.status(404).json({ mensaje: "Jugador no encontrado" });
    }

    // Para retiros, validar saldo suficiente
    if (categoria === "retiro" && jugador.saldo < monto) {
      return res.status(400).json({
        mensaje: "Saldo insuficiente para el retiro",
      });
    }

    const transaccion = new Transaccion({
      jugadorId,
      telegramId: jugador.telegramId,
      tipo,
      categoria,
      monto,
      saldoAnterior: jugador.saldo,
      descripcion,
      referencia: Transaccion.generarReferencia(categoria, jugadorId),
      estado: "pendiente",
      metadata: {
        metodoPago: metodoPago,
        ipOrigen: req.ip,
      },
      creadoPor: req.user?._id,
    });

    await transaccion.save();

    // Emitir evento WebSocket si hay usuarios conectados
    websocketHelper.initialize(req.app.get('socketManager'));
    websocketHelper.logWebSocketStats("Nueva solicitud creada");
    
    // Solo emitir si es una transacción de depósito/retiro
    if (["deposito", "retiro"].includes(transaccion.categoria)) {
      await websocketHelper.emitNuevaSolicitudDeposito(transaccion, jugador);
    }

    res.status(201).json({
      mensaje: "Solicitud creada exitosamente",
      transaccion: {
        _id: transaccion._id,
        referencia: transaccion.referencia,
        tipo: transaccion.tipo,
        categoria: transaccion.categoria,
        monto: transaccion.monto,
        estado: transaccion.estado,
        fechaCreacion: transaccion.fechaCreacion,
        fechaVencimiento: transaccion.fechaVencimiento,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error creando solicitud",
      error: error.message,
    });
  }
};

// ===== ENDPOINTS PARA ADMINISTRADORES =====

/**
 * Obtener cajeros disponibles para asignar
 */
exports.obtenerCajerosDisponibles = async (req, res) => {
  try {
    const cajeros = await Cajero.find(
      { estado: "activo" },
      "nombreCompleto email telefonoContacto datosPagoMovil"
    ).sort({ nombreCompleto: 1 });

    res.json({
      cajeros,
      total: cajeros.length,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo cajeros disponibles",
      error: error.message,
    });
  }
};

/**
 * Obtener transacciones pendientes para cajeros
 */
exports.obtenerPendientesCajero = async (req, res) => {
  try {
    const { tipo, cajeroId, limite = 50 } = req.query;

    const filtros = {
      categoria: { $in: ["deposito", "retiro"] },
      estado: { $in: ["pendiente", "en_proceso"] },
    };

    if (tipo) filtros.categoria = tipo;
    if (cajeroId) filtros.cajeroId = cajeroId;

    const transacciones = await Transaccion.find(filtros)
      .populate("jugadorId", "username nickname telegramId")
      .populate("cajeroId", "nombreCompleto email telefonoContacto estado")
      .sort({ fechaCreacion: 1 })
      .limit(parseInt(limite));

    res.json({
      transacciones,
      total: transacciones.length,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo transacciones pendientes",
      error: error.message,
    });
  }
};

/**
 * Asignar cajero a transacción
 */
exports.asignarCajero = async (req, res) => {
  try {
    const { transaccionId } = req.params;

    // Si es un cajero autenticado, usar su ID
    // Si es un admin, permitir especificar cajeroId en el body
    const cajeroId =
      req.user.rol === "cajero" ? req.user.id : req.body.cajeroId;

    if (!cajeroId) {
      return res.status(400).json({ mensaje: "ID del cajero requerido" });
    }

    // Validar transacción
    const transaccion = await Transaccion.findById(transaccionId);
    if (!transaccion) {
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    if (!["deposito", "retiro"].includes(transaccion.categoria)) {
      return res.status(400).json({
        mensaje: "Solo se pueden asignar cajeros a depósitos y retiros",
      });
    }

    if (transaccion.estado !== "pendiente") {
      return res.status(400).json({
        mensaje: "Solo se pueden asignar cajeros a transacciones pendientes",
      });
    }

    // Validar cajero
    const cajero = await Cajero.findById(cajeroId);
    if (!cajero || cajero.estado !== "activo") {
      return res.status(400).json({ mensaje: "El cajero no está disponible" });
    }

    // Asignar cajero
    transaccion.cajeroId = cajeroId;
    transaccion.fechaAsignacionCajero = new Date();
    transaccion.cambiarEstado("en_proceso");
    await transaccion.save();

    // Registrar log
    await registrarLog({
      accion: "Cajero asignado a transacción",
      usuario: req.user?._id,
      rol: req.user?.rol || "admin",
      detalle: {
        transaccionId: transaccion._id,
        cajeroId: cajero._id,
        categoria: transaccion.categoria,
      },
    });

    // Emitir evento WebSocket si hay usuarios conectados
    websocketHelper.initialize(req.app.get('socketManager'));
    websocketHelper.logWebSocketStats("Cajero asignado");
    
    // Solo emitir si es una transacción de depósito/retiro
    if (["deposito", "retiro"].includes(transaccion.categoria)) {
      // Obtener datos del jugador para la notificación
      const jugador = await Jugador.findById(transaccion.jugadorId);
      if (jugador) {
        await websocketHelper.emitCajeroAsignado(transaccion, cajero);
      }
    }

    res.json({
      mensaje: "Cajero asignado exitosamente",
      transaccion: {
        _id: transaccion._id,
        estado: transaccion.estado,
        fechaAsignacion: transaccion.fechaAsignacionCajero,
      },
      cajero: {
        _id: cajero._id,
        nombreCompleto: cajero.nombreCompleto,
        email: cajero.email,
        telefonoContacto: cajero.telefonoContacto,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error asignando cajero",
      error: error.message,
    });
  }
};

//Confirmar pago por el usuario (solo para depósitos/retiros)
exports.confirmarPagoUsuario = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      bancoOrigen,
      telefonoOrigen,
      numeroReferencia,
      fechaPago,
      metodoPago,
    } = req.body;

    const transaccion = await Transaccion.findById(id);
    if (!transaccion) {
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    if (transaccion.estado !== "en_proceso") {
      return res.status(400).json({
        mensaje: "Solo se pueden confirmar pagos en transacciones en proceso",
      });
    }

    // Actualizar información de pago
    transaccion.infoPago = {
      ...transaccion.infoPago,
      bancoOrigen,
      telefonoOrigen,
      numeroReferencia,
      fechaPago,
      metodoPago,
    };

    await transaccion.save();

    // Emitir evento WebSocket si hay usuarios conectados
    websocketHelper.initialize(req.app.get('socketManager'));
    websocketHelper.logWebSocketStats("Pago confirmado por usuario");
    
    // Solo emitir si es una transacción de depósito/retiro
    if (["deposito", "retiro"].includes(transaccion.categoria)) {
      await websocketHelper.emitPagoConfirmadoUsuario(transaccion);
    }

    res.json({
      mensaje: "Pago confirmado por el usuario",
      transaccion: {
        _id: transaccion._id,
        estado: transaccion.estado,
        infoPago: transaccion.infoPago,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error confirmando pago",
      error: error.message,
    });
  }
};

// ===== ENDPOINTS PARA CAJEROS =====

/**
 * Confirmar transacción por cajero
 */
exports.confirmarPorCajero = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const { transaccionId } = req.params;
    const datosConfirmacion = req.body;

    // Obtener transacción
    const transaccion = await Transaccion.findById(transaccionId).session(
      session
    );
    if (!transaccion) {
      await session.abortTransaction();
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    if (transaccion.estado !== "en_proceso") {
      await session.abortTransaction();
      return res.status(400).json({
        mensaje: "Solo se pueden confirmar transacciones en proceso",
      });
    }

    // Actualizar información de pago
    transaccion.fechaConfirmacionCajero = new Date();
    transaccion.infoPago = {
      metodoPago: datosConfirmacion.metodoPago,
      numeroReferencia: datosConfirmacion.numeroReferencia,
      bancoOrigen: datosConfirmacion.bancoOrigen,
      bancoDestino: datosConfirmacion.bancoDestino,
      comprobanteUrl: datosConfirmacion.comprobanteUrl,
      notasCajero: datosConfirmacion.notas,
      telefonoOrigen: datosConfirmacion.telefonoOrigen,
      cedulaOrigen: datosConfirmacion.cedulaOrigen,
    };

    transaccion.cambiarEstado("confirmada");
    await transaccion.save({ session });

    // Procesar saldo del jugador
    const jugador = await Jugador.findById(transaccion.jugadorId).session(
      session
    );
    let saldoNuevo;

    if (transaccion.tipo === "debito") {
      saldoNuevo = jugador.saldo - transaccion.monto;
    } else {
      saldoNuevo = jugador.saldo + transaccion.monto;
    }

    await Jugador.findByIdAndUpdate(
      transaccion.jugadorId,
      { saldo: saldoNuevo },
      { session }
    );

    // Completar transacción
    transaccion.cambiarEstado("completada");
    transaccion.saldoNuevo = saldoNuevo;
    transaccion.fechaProcesamiento = new Date();
    await transaccion.save({ session });

    // Registrar log
    await registrarLog(
      {
        accion: `Transacción ${transaccion.categoria} confirmada`,
        usuario: req.user?._id,
        rol: req.user?.rol || "cajero",
        detalle: {
          transaccionId: transaccion._id,
          jugadorId: transaccion.jugadorId,
          monto: transaccion.monto,
          saldoNuevo: saldoNuevo,
          cajeroId: transaccion.cajeroId,
        },
      },
      session
    );

    await session.commitTransaction();

    // Emitir evento WebSocket si hay usuarios conectados
    websocketHelper.initialize(req.app.get('socketManager'));
    websocketHelper.logWebSocketStats("Transacción completada por cajero");
    
    // Solo emitir si es una transacción de depósito/retiro
    if (["deposito", "retiro"].includes(transaccion.categoria)) {
      await websocketHelper.emitTransaccionCompletada(transaccion, jugador);
    }

    res.json({
      mensaje: "Transacción confirmada y procesada exitosamente",
      transaccion: {
        _id: transaccion._id,
        estado: transaccion.estado,
        saldoNuevo: saldoNuevo,
        fechaProcesamiento: transaccion.fechaProcesamiento,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({
      mensaje: "Error confirmando transacción",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
};

/**
 * Rechazar transacción
 */
exports.rechazarTransaccion = async (req, res) => {
  try {
    const { transaccionId } = req.params;
    const { motivo } = req.body;

    const transaccion = await Transaccion.findById(transaccionId);
    if (!transaccion) {
      return res.status(404).json({ mensaje: "Transacción no encontrada" });
    }

    if (!["pendiente", "en_proceso"].includes(transaccion.estado)) {
      return res.status(400).json({
        mensaje:
          "Solo se pueden rechazar transacciones pendientes o en proceso",
      });
    }

    transaccion.cambiarEstado("rechazada", motivo);
    await transaccion.save();

    // Registrar log
    await registrarLog({
      accion: "Transacción rechazada",
      usuario: req.user?._id,
      rol: req.user?.rol || "cajero",
      detalle: {
        transaccionId: transaccion._id,
        motivo: motivo,
        cajeroId: req.user?._id,
      },
    });

    // Emitir evento WebSocket si hay usuarios conectados
    websocketHelper.initialize(req.app.get('socketManager'));
    websocketHelper.logWebSocketStats("Transacción rechazada");
    
    // Solo emitir si es una transacción de depósito/retiro
    if (["deposito", "retiro"].includes(transaccion.categoria)) {
      const jugador = await Jugador.findById(transaccion.jugadorId);
      if (jugador) {
        await websocketHelper.emitTransaccionRechazada(transaccion, jugador, motivo);
      }
    }

    res.json({
      mensaje: "Transacción rechazada exitosamente",
      transaccion: {
        _id: transaccion._id,
        estado: transaccion.estado,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error rechazando transacción",
      error: error.message,
    });
  }
};

// ===== ENDPOINTS DE CONSULTA =====

/**
 * Obtener historial de transacciones de un jugador
 */
exports.obtenerHistorial = async (req, res) => {
  try {
    const { jugadorId } = req.params;
    const { limite = 50, tipo, categoria, estado } = req.query;

    const filtros = { jugadorId };
    if (tipo) filtros.tipo = tipo;
    if (categoria) filtros.categoria = categoria;
    if (estado) filtros.estado = estado;

    const transacciones = await Transaccion.find(filtros)
      .sort({ createdAt: -1 })
      .limit(parseInt(limite))
      .populate("referenciaExterna.salaId", "nombre")
      .populate("cajeroId", "nombreCompleto")
      .populate("creadoPor", "nickname username")
      .lean();

    const saldoActual = await Transaccion.obtenerBalance(jugadorId);

    res.json({
      transacciones,
      total: transacciones.length,
      saldoActual,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo historial",
      error: error.message,
    });
  }
};

/**
 * Obtener estadísticas de transacciones
 */
exports.obtenerEstadisticas = async (req, res) => {
  try {
    const { jugadorId } = req.params;
    const { fechaInicio, fechaFin } = req.query;

    const filtros = { jugadorId };

    if (fechaInicio || fechaFin) {
      filtros.createdAt = {};
      if (fechaInicio) filtros.createdAt.$gte = new Date(fechaInicio);
      if (fechaFin) filtros.createdAt.$lte = new Date(fechaFin);
    }

    const estadisticas = await Transaccion.aggregate([
      { $match: filtros },
      {
        $group: {
          _id: { tipo: "$tipo", categoria: "$categoria" },
          total: { $sum: 1 },
          montoTotal: { $sum: "$monto" },
        },
      },
      {
        $sort: { "_id.tipo": 1, "_id.categoria": 1 },
      },
    ]);

    res.json({ estadisticas });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo estadísticas",
      error: error.message,
    });
  }
};

/**
 * Procesar transacción automática (desde bot o sistema)
 * POST /api/transacciones/procesar-automatica
 */
exports.procesarTransaccionAutomatica = async (req, res) => {
  console.log("🔍 [DEBUG] Iniciando procesarTransaccionAutomatica");
  console.log("🔍 [DEBUG] Body recibido:", req.body);

  const session = await mongoose.startSession();

  try {
    const {
      jugadorId,
      tipo,
      categoria,
      monto,
      descripcion,
      referenciaExterna = {},
      metadata = {},
    } = req.body;

    console.log("🔍 [DEBUG] Validaciones básicas");

    // Validaciones básicas
    if (!jugadorId || !tipo || !categoria || !monto || !descripcion) {
      return res.status(400).json({
        exito: false,
        mensaje:
          "Faltan campos requeridos: jugadorId, tipo, categoria, monto, descripcion",
      });
    }

    // Validar monto
    const montoNumerico = Number(monto);
    if (isNaN(montoNumerico) || montoNumerico <= 0) {
      return res.status(400).json({
        exito: false,
        mensaje: "El monto debe ser un número positivo",
      });
    }

    // Validar tipo
    if (!["debito", "credito"].includes(tipo)) {
      return res.status(400).json({
        exito: false,
        mensaje: 'El tipo debe ser "debito" o "credito"',
      });
    }

    console.log("🔍 [DEBUG] Iniciando transacción de BD");
    await session.startTransaction();

    console.log("🔍 [DEBUG] Verificando jugador");
    // Verificar jugador
    const jugador = await Jugador.findById(jugadorId).session(session);
    if (!jugador) {
      await session.abortTransaction();
      return res.status(404).json({
        exito: false,
        mensaje: "Jugador no encontrado",
      });
    }

    console.log("🔍 [DEBUG] Obteniendo saldo actual");
    const saldoActual = jugador.saldo || 0;

    console.log("🔍 [DEBUG] Validando saldo para débito");
    // Para débitos, verificar saldo suficiente
    if (tipo === "debito" && saldoActual < montoNumerico) {
      await session.abortTransaction();
      return res.status(400).json({
        exito: false,
        mensaje: "Saldo insuficiente",
        saldoActual,
        montoRequerido: montoNumerico,
      });
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
      creadoPor: req.user?._id || null,
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
        usuario: req.user?._id || null,
        rol: req.user?.rol || "sistema",
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

    console.log("🔍 [DEBUG] Confirmando transacción");
    await session.commitTransaction();

    console.log("🔍 [DEBUG] Enviando respuesta exitosa");
    // Respuesta exitosa
    res.json({
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
    });
  } catch (error) {
    console.log("🔍 [DEBUG] Error capturado:", error.message);
    console.error("Error procesando transacción automática:", error);

    await session.abortTransaction();

    res.status(500).json({
      exito: false,
      mensaje: "Error interno procesando transacción",
      error: error.message,
    });
  } finally {
    console.log("🔍 [DEBUG] Cerrando sesión");
    await session.endSession();
  }
};

/**
 * Obtener estado de transacción con datos del cajero (para polling)
 * GET /api/transacciones/:transaccionId/estado
 */
exports.obtenerEstadoTransaccion = async (req, res) => {
  try {
    const { transaccionId } = req.params;
    const telegramId = req.headers["x-telegram-id"];

    if (!telegramId) {
      return res.status(401).json({
        mensaje: "X-Telegram-ID header requerido",
      });
    }

    // Buscar transacción con datos del cajero poblados
    const transaccion = await Transaccion.findById(transaccionId)
      .populate("cajeroId", "nombreCompleto telefonoContacto datosPagoMovil")
      .populate("jugadorId", "telegramId")
      .select(
        "estado cajeroId fechaAsignacionCajero monto referencia categoria tipo jugadorId"
      )
      .lean();

    if (!transaccion) {
      return res.status(404).json({
        mensaje: "Transacción no encontrada",
      });
    }

    // Verificar que la transacción pertenece al usuario
    if (
      transaccion.jugadorId &&
      transaccion.jugadorId.telegramId !== telegramId
    ) {
      return res.status(403).json({
        mensaje: "No tienes permisos para ver esta transacción",
      });
    }

    // Preparar respuesta base
    const respuesta = {
      estado: transaccion.estado,
      cajeroAsignado: !!transaccion.cajeroId,
      monto: transaccion.monto,
      referencia: transaccion.referencia,
      categoria: transaccion.categoria,
      tipo: transaccion.tipo,
      fechaAsignacion: transaccion.fechaAsignacionCajero,
    };

    // Si hay cajero asignado, incluir sus datos bancarios
    if (transaccion.cajeroId) {
      respuesta.cajero = {
        _id: transaccion.cajeroId._id,
        nombre: transaccion.cajeroId.nombreCompleto,
        telefono: transaccion.cajeroId.telefonoContacto,
        datosPago: {
          banco: transaccion.cajeroId.datosPagoMovil.banco,
          cedula: {
            prefijo: transaccion.cajeroId.datosPagoMovil.cedula.prefijo,
            numero: transaccion.cajeroId.datosPagoMovil.cedula.numero,
          },
          telefono: transaccion.cajeroId.datosPagoMovil.telefono,
        },
      };
    }

    res.json(respuesta);
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo estado de transacción",
      error: error.message,
    });
  }
};

//FUNCIONES AUXILIARES

//PROCESAR REEMBOLSO AUTOMATICO
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

exports.procesarReembolso = async (
  jugadorId,
  monto,
  motivo,
  referenciaExterna = {},
  metadata = {}
) => {
  try {
    // Validaciones basicas
    if (!jugadorId || !monto || monto <= 0) {
      throw new Error("Parámetros inválidos para reembolso");
    }

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
        ...metadata,
      },
    };

    // Crear request simulado para reutilizar procesarTransaccionAutomatica
    const mockReq = {
      body: datosTransaccion,
      user: null,
      ip: metadata.ipOrigen || "backend-interno",
    };

    // Procesar usando la función principal
    const resultado = await new Promise((resolve, reject) => {
      const mockRes = {
        status: () => mockRes,
        json: (data) => {
          if (data.exito) {
            resolve(data);
          } else {
            reject(new Error(data.mensaje || "Error procesando reembolso"));
          }
        },
      };

      this.procesarTransaccionAutomatica(mockReq, mockRes);
    });

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
    console.error("❌ [AUXILIAR] Error procesando reembolso:", error.message);

    return {
      exito: false,
      error: error.message,
      monto,
      jugadorId,
    };
  }
};

/**
 * Procesa múltiples reembolsos (para cancelación de salas)
 * FUNCIÓN AUXILIAR - Reutilizable para operaciones masivas
 */
exports.procesarReembolsosMasivos = async (
  jugadores,
  monto,
  motivo,
  referenciaExterna = {},
  metadata = {}
) => {
  console.log(
    `💰 [AUXILIAR] Procesando ${jugadores.length} reembolsos masivos`
  );

  const resultados = [];
  const errores = [];

  for (const jugadorId of jugadores) {
    try {
      const resultado = await this.procesarReembolso(
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
};
