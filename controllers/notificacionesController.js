const Notificacion = require("../models/Notificacion");
const { registrarLog } = require("../utils/logHelper");

/**
 * Obtener notificaciones de un destinatario
 * @param {String} destinatarioId - ID del destinatario
 * @param {String} destinatarioTipo - Tipo: 'cajero' o 'jugador'
 * @param {Number} limit - Cantidad máxima de notificaciones (default: 10)
 */
exports.obtenerNotificaciones = async (req, res) => {
  try {
    const { destinatarioId, destinatarioTipo } = req.query;
    const limit = parseInt(req.query.limit) || 10;

    if (!destinatarioId || !destinatarioTipo) {
      return res.status(400).json({
        mensaje: "Se requiere destinatarioId y destinatarioTipo",
      });
    }

    if (!["cajero", "jugador"].includes(destinatarioTipo)) {
      return res.status(400).json({
        mensaje: "destinatarioTipo debe ser 'cajero' o 'jugador'",
      });
    }

    const notificaciones = await Notificacion.find({
      destinatarioId,
      destinatarioTipo,
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      mensaje: "Notificaciones obtenidas exitosamente",
      notificaciones,
      total: notificaciones.length,
    });
  } catch (error) {
    console.error("❌ Error obteniendo notificaciones:", error);
    return res.status(500).json({
      mensaje: "Error obteniendo notificaciones",
      error: error.message,
    });
  }
};

/**
 * Obtener notificaciones de un jugador por telegramId
 */
exports.obtenerNotificacionesJugador = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const limit = parseInt(req.query.limit) || 10;

    if (!telegramId) {
      return res.status(400).json({
        mensaje: "Se requiere telegramId",
      });
    }

    const notificaciones = await Notificacion.find({
      telegramId,
      destinatarioTipo: "jugador",
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.status(200).json({
      mensaje: "Notificaciones obtenidas exitosamente",
      notificaciones,
      total: notificaciones.length,
    });
  } catch (error) {
    console.error(
      "❌ Error obteniendo notificaciones de jugador:",
      error.message
    );
    return res.status(500).json({
      mensaje: "Error obteniendo notificaciones",
      error: error.message,
    });
  }
};

/**
 * Crear una notificación
 * Verifica duplicados por eventoId si está presente
 */
exports.crearNotificacion = async (req, res) => {
  try {
    const {
      destinatarioId,
      destinatarioTipo,
      telegramId,
      tipo,
      titulo,
      mensaje,
      datos,
      eventoId,
    } = req.body;

    // Validaciones
    if (!destinatarioId || !destinatarioTipo || !tipo || !titulo || !mensaje) {
      return res.status(400).json({
        mensaje:
          "Se requiere destinatarioId, destinatarioTipo, tipo, titulo y mensaje",
      });
    }

    // Verificar duplicados por eventoId
    if (eventoId) {
      const existente = await Notificacion.findOne({ eventoId });
      if (existente) {
        console.log(
          `⚠️ Notificación duplicada detectada para eventoId: ${eventoId}`
        );
        return res.status(200).json({
          mensaje: "Notificación ya existe",
          notificacion: existente,
          duplicada: true,
        });
      }
    }

    // Crear notificación
    const notificacion = new Notificacion({
      destinatarioId,
      destinatarioTipo,
      telegramId,
      tipo,
      titulo,
      mensaje,
      datos: datos || {},
      eventoId,
    });

    await notificacion.save();

    console.log(
      `✅ Notificación creada: ${tipo} para ${destinatarioTipo} ${destinatarioId}`
    );

    return res.status(201).json({
      mensaje: "Notificación creada exitosamente",
      notificacion,
    });
  } catch (error) {
    console.error("❌ Error creando notificación:", error.message);
    return res.status(500).json({
      mensaje: "Error creando notificación",
      error: error.message,
    });
  }
};

/**
 * Crear notificación (función interna para usar en el backend)
 * No requiere req/res, retorna la notificación o null si hay error
 */
exports.crearNotificacionInterna = async (data) => {
  try {
    const {
      destinatarioId,
      destinatarioTipo,
      telegramId,
      tipo,
      titulo,
      mensaje,
      datos,
      eventoId,
    } = data;

    // Validaciones básicas
    if (!destinatarioId || !destinatarioTipo || !tipo || !titulo || !mensaje) {
      console.error("❌ Datos incompletos para crear notificación");
      return null;
    }

    // Verificar duplicados por eventoId
    if (eventoId) {
      const existente = await Notificacion.findOne({ eventoId });
      if (existente) {
        console.log(
          `⚠️ Notificación duplicada detectada para eventoId: ${eventoId}`
        );
        return existente;
      }
    }

    // Crear notificación
    const notificacion = new Notificacion({
      destinatarioId,
      destinatarioTipo,
      telegramId,
      tipo,
      titulo,
      mensaje,
      datos: datos || {},
      eventoId,
    });

    await notificacion.save();

    console.log(
      `✅ Notificación creada: ${tipo} para ${destinatarioTipo} ${destinatarioId}`
    );

    return notificacion;
  } catch (error) {
    console.error("❌ Error creando notificación interna:", error.message);
    return null;
  }
};

/**
 * Eliminar una notificación por ID
 */
exports.eliminarNotificacion = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        mensaje: "Se requiere ID de notificación",
      });
    }

    const notificacion = await Notificacion.findByIdAndDelete(id);

    if (!notificacion) {
      return res.status(404).json({
        mensaje: "Notificación no encontrada",
      });
    }

    console.log(`🗑️ Notificación eliminada: ${id}`);

    return res.status(200).json({
      mensaje: "Notificación eliminada exitosamente",
      notificacion,
    });
  } catch (error) {
    console.error("❌ Error eliminando notificación:", error.message);
    return res.status(500).json({
      mensaje: "Error eliminando notificación",
      error: error.message,
    });
  }
};

/**
 * Obtener notificaciones del admin autenticado (para dashboard)
 * GET /api/notificaciones?leida=&tipo=&fechaDesde=&fechaHasta=&limite=
 */
exports.obtenerNotificacionesAdmin = async (req, res) => {
  try {
    const adminId = req.user._id || req.user.id;
    const { leida, tipo, fechaDesde, fechaHasta, limite = 50 } = req.query;

    const filtro = {
      destinatarioId: adminId,
      destinatarioTipo: "admin",
    };

    if (leida !== undefined && leida !== null && leida !== "") {
      filtro.leida = leida === "true";
    }
    if (tipo) filtro.tipo = tipo;
    if (fechaDesde || fechaHasta) {
      filtro.createdAt = {};
      if (fechaDesde) filtro.createdAt.$gte = new Date(fechaDesde);
      if (fechaHasta) filtro.createdAt.$lte = new Date(fechaHasta);
    }

    const notificaciones = await Notificacion.find(filtro)
      .sort({ createdAt: -1 })
      .limit(parseInt(limite, 10))
      .lean();

    return res.status(200).json({
      mensaje: "Notificaciones obtenidas exitosamente",
      notificaciones,
      total: notificaciones.length,
    });
  } catch (error) {
    console.error("❌ Error obteniendo notificaciones admin:", error);
    return res.status(500).json({
      mensaje: "Error obteniendo notificaciones",
      error: error.message,
    });
  }
};

/**
 * Marcar una notificación como leída (solo si pertenece al admin)
 * PUT /api/notificaciones/:id/marcar-leida
 */
exports.marcarNotificacionLeida = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id || req.user.id;

    const notificacion = await Notificacion.findOneAndUpdate(
      { _id: id, destinatarioId: adminId, destinatarioTipo: "admin" },
      { leida: true },
      { new: true }
    );

    if (!notificacion) {
      return res.status(404).json({
        mensaje: "Notificación no encontrada o no pertenece al usuario",
      });
    }

    return res.status(200).json({
      mensaje: "Notificación marcada como leída",
      notificacion,
    });
  } catch (error) {
    console.error("❌ Error marcando notificación como leída:", error);
    return res.status(500).json({
      mensaje: "Error al actualizar la notificación",
      error: error.message,
    });
  }
};

/**
 * Marcar todas las notificaciones del admin como leídas
 * PUT /api/notificaciones/marcar-todas-leidas
 */
exports.marcarTodasLeidasAdmin = async (req, res) => {
  try {
    const adminId = req.user._id || req.user.id;

    if (!adminId) {
      console.error("❌ [MARCAR-TODAS] adminId no encontrado en req.user:", req.user);
      return res.status(400).json({
        mensaje: "ID de administrador no encontrado",
      });
    }

    console.log(`✅ [MARCAR-TODAS] Marcando notificaciones para admin: ${adminId}`);

    // Convertir adminId a ObjectId si es necesario para asegurar comparación correcta
    const mongoose = require("mongoose");
    const adminIdObj = mongoose.Types.ObjectId.isValid(adminId) 
      ? new mongoose.Types.ObjectId(adminId) 
      : adminId;

    // Verificar cuántas notificaciones no leídas hay antes de actualizar
    const antes = await Notificacion.countDocuments({
      destinatarioId: adminIdObj,
      destinatarioTipo: "admin",
      leida: false,
    });
    console.log(`🔍 [MARCAR-TODAS] Notificaciones no leídas encontradas: ${antes}`);

    const resultado = await Notificacion.updateMany(
      { destinatarioId: adminIdObj, destinatarioTipo: "admin", leida: false },
      { leida: true }
    );

    console.log(`✅ [MARCAR-TODAS] ${resultado.modifiedCount} notificaciones marcadas como leídas`);

    return res.status(200).json({
      mensaje: "Todas las notificaciones marcadas como leídas",
      modificadas: resultado.modifiedCount,
    });
  } catch (error) {
    console.error("❌ Error marcando todas como leídas:", error);
    return res.status(500).json({
      mensaje: "Error al actualizar las notificaciones",
      error: error.message,
    });
  }
};

/**
 * Contador de notificaciones no leídas del admin
 * GET /api/notificaciones/contador-no-leidas
 */
exports.contadorNoLeidasAdmin = async (req, res) => {
  try {
    const adminId = req.user._id || req.user.id;

    const total = await Notificacion.countDocuments({
      destinatarioId: adminId,
      destinatarioTipo: "admin",
      leida: false,
    });

    return res.status(200).json({
      total,
    });
  } catch (error) {
    console.error("❌ Error obteniendo contador de notificaciones:", error);
    return res.status(500).json({
      mensaje: "Error obteniendo contador",
      error: error.message,
    });
  }
};

/**
 * Limpiar notificaciones antiguas
 * Elimina notificaciones con más de X días de antigüedad
 * @param {Number} dias - Número de días (default: 7)
 */
exports.limpiarNotificacionesAntiguas = async (dias = 7) => {
  try {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - dias);

    const resultado = await Notificacion.deleteMany({
      createdAt: { $lt: fechaLimite },
    });

    console.log(
      `🧹 Limpieza de notificaciones completada: ${resultado.deletedCount} notificaciones eliminadas (más de ${dias} días)`
    );

    // Registrar en logs
    await registrarLog({
      tipo: "sistema",
      accion: "limpieza_notificaciones",
      detalles: `Eliminadas ${resultado.deletedCount} notificaciones con más de ${dias} días`,
      resultado: "exitoso",
    });

    return {
      eliminadas: resultado.deletedCount,
      diasAntiguedad: dias,
      fechaLimite,
    };
  } catch (error) {
    console.error("❌ Error limpiando notificaciones antiguas:", error.message);

    // Registrar error en logs
    await registrarLog({
      tipo: "sistema",
      accion: "limpieza_notificaciones",
      detalles: `Error: ${error.message}`,
      resultado: "error",
    });

    return null;
  }
};

/**
 * Endpoint para ejecutar limpieza manual
 */
exports.ejecutarLimpieza = async (req, res) => {
  try {
    const dias = parseInt(req.query.dias) || 7;
    const resultado = await exports.limpiarNotificacionesAntiguas(dias);

    if (resultado) {
      return res.status(200).json({
        mensaje: "Limpieza ejecutada exitosamente",
        ...resultado,
      });
    } else {
      return res.status(500).json({
        mensaje: "Error ejecutando limpieza",
      });
    }
  } catch (error) {
    console.error("❌ Error en endpoint de limpieza:", error.message);
    return res.status(500).json({
      mensaje: "Error ejecutando limpieza",
      error: error.message,
    });
  }
};
