const NotificacionBot = require("../models/NotificacionBot");
const { registrarLog } = require("../utils/logHelper");

/**
 * Crear notificación pendiente para el bot
 */
exports.crearNotificacionBot = async (data) => {
  try {
    const notificacion = await NotificacionBot.create(data);
    console.log(
      `✅ [BOT-NOTIFICACION] Creada: ${notificacion.tipo} para ${data.jugadorTelegramId}`
    );
    return notificacion;
  } catch (error) {
    if (error.code === 11000) {
      // Duplicado - ya existe una notificación para este eventoId
      console.log(
        `⚠️ [BOT-NOTIFICACION] Notificación duplicada para eventoId: ${data.eventoId}`
      );
      return null;
    }
    console.error(
      `❌ [BOT-NOTIFICACION] Error creando notificación:`,
      error.message
    );
    throw error;
  }
};

/**
 * Obtener notificaciones pendientes (no enviadas)
 */
exports.obtenerPendientes = async (query = {}) => {
  try {
    const notificaciones = await NotificacionBot.find({
      enviada: false,
      ...query,
    })
      .sort({ fechaCreacion: 1 })
      .limit(50)
      .lean();

    console.log(
      `✅ [BOT-NOTIFICACION] Obtener pendientes: ${notificaciones.length} encontradas`
    );
    return notificaciones;
  } catch (error) {
    console.error(
      `❌ [BOT-NOTIFICACION] Error obteniendo pendientes:`,
      error.message
    );
    throw error;
  }
};

/**
 * Marcar una notificación como enviada
 */
exports.marcarEnviada = async (notificacionId) => {
  try {
    const notificacion = await NotificacionBot.findByIdAndUpdate(
      notificacionId,
      {
        enviada: true,
        fechaEnvio: new Date(),
      },
      { new: true }
    );

    if (!notificacion) {
      throw new Error("Notificación no encontrada");
    }

    console.log(
      `✅ [BOT-NOTIFICACION] Marcada como enviada: ${notificacion._id}`
    );
    return notificacion;
  } catch (error) {
    console.error(
      `❌ [BOT-NOTIFICACION] Error marcando como enviada:`,
      error.message
    );
    throw error;
  }
};

/**
 * Marcar múltiples notificaciones como enviadas (batch update)
 */
exports.marcarVariasEnviadas = async (notificacionIds) => {
  try {
    const result = await NotificacionBot.updateMany(
      { _id: { $in: notificacionIds } },
      {
        enviada: true,
        fechaEnvio: new Date(),
      }
    );

    console.log(
      `✅ [BOT-NOTIFICACION] ${result.modifiedCount} notificaciones marcadas como enviadas`
    );
    return result;
  } catch (error) {
    console.error(
      `❌ [BOT-NOTIFICACION] Error marcando múltiples como enviadas:`,
      error.message
    );
    throw error;
  }
};

/**
 * Incrementar contador de intentos (para reintentos)
 */
exports.incrementarIntentos = async (notificacionId) => {
  try {
    const notificacion = await NotificacionBot.findByIdAndUpdate(
      notificacionId,
      { $inc: { intentos: 1 } },
      { new: true }
    );

    console.log(
      `⚠️ [BOT-NOTIFICACION] Intentos incrementados: ${notificacion._id} (${notificacion.intentos})`
    );
    return notificacion;
  } catch (error) {
    console.error(
      `❌ [BOT-NOTIFICACION] Error incrementando intentos:`,
      error.message
    );
    throw error;
  }
};

/**
 * Limpiar notificaciones antiguas (enviadas hace más de 30 días)
 */
exports.limpiarAntiguas = async () => {
  try {
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - 30);

    const result = await NotificacionBot.deleteMany({
      enviada: true,
      fechaEnvio: { $lt: fechaLimite },
    });

    console.log(
      `🗑️ [BOT-NOTIFICACION] Limpieza: ${result.deletedCount} notificaciones eliminadas`
    );
    return result;
  } catch (error) {
    console.error(`❌ [BOT-NOTIFICACION] Error en limpieza:`, error.message);
    throw error;
  }
};
