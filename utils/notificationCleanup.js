/**
 * Script de limpieza automática de notificaciones antiguas
 * Elimina notificaciones con más de X días de antigüedad
 * Se ejecuta automáticamente según configuración de cron
 */

const cron = require("node-cron");
const notificacionesController = require("../controllers/notificacionesController");

// Variables de entorno
const CLEANUP_ENABLED =
  process.env.NOTIFICATIONS_CLEANUP_ENABLED === "true" || true;
const CLEANUP_DAYS = parseInt(process.env.NOTIFICATIONS_CLEANUP_DAYS) || 7;
const CLEANUP_CRON = process.env.NOTIFICATIONS_CLEANUP_CRON || "0 0 1 * *"; // Primer día del mes a medianoche

/**
 * Iniciar tarea de limpieza automática
 */
function iniciarLimpiezaAutomatica() {
  if (!CLEANUP_ENABLED) {
    console.log("🧹 Limpieza automática de notificaciones: DESHABILITADA");
    return;
  }

  console.log("🧹 Limpieza automática de notificaciones: HABILITADA");
  console.log(`📅 Cron expression: ${CLEANUP_CRON}`);
  console.log(`🗓️ Días de retención: ${CLEANUP_DAYS}`);

  // Validar expresión cron
  if (!cron.validate(CLEANUP_CRON)) {
    console.error(
      `❌ Expresión cron inválida: ${CLEANUP_CRON}. Usando valor por defecto.`
    );
    return;
  }

  // Programar tarea
  const tarea = cron.schedule(
    CLEANUP_CRON,
    async () => {
      console.log("\n🧹 ===== INICIANDO LIMPIEZA DE NOTIFICACIONES =====");
      console.log(`📅 Fecha: ${new Date().toLocaleString("es-ES")}`);

      try {
        const resultado =
          await notificacionesController.limpiarNotificacionesAntiguas(
            CLEANUP_DAYS
          );

        if (resultado) {
          console.log(
            `✅ Limpieza completada: ${resultado.eliminadas} notificaciones eliminadas`
          );
        } else {
          console.log("⚠️ La limpieza no retornó resultados");
        }
      } catch (error) {
        console.error("❌ Error en limpieza automática:", error.message);
      }

      console.log("🧹 ===== LIMPIEZA FINALIZADA =====\n");
    },
    {
      scheduled: true,
      timezone: "America/Caracas", // Ajustar según la zona horaria del proyecto
    }
  );

  console.log("✅ Tarea de limpieza programada correctamente");

  return tarea;
}

/**
 * Ejecutar limpieza manual
 * Útil para testing o ejecución manual
 */
async function ejecutarLimpiezaManual(dias = CLEANUP_DAYS) {
  console.log("\n🧹 ===== LIMPIEZA MANUAL DE NOTIFICACIONES =====");
  console.log(`📅 Fecha: ${new Date().toLocaleString("es-ES")}`);
  console.log(`🗓️ Eliminando notificaciones con más de ${dias} días`);

  try {
    const resultado =
      await notificacionesController.limpiarNotificacionesAntiguas(dias);

    if (resultado) {
      console.log(
        `✅ Limpieza completada: ${resultado.eliminadas} notificaciones eliminadas`
      );
      return resultado;
    } else {
      console.log("⚠️ La limpieza no retornó resultados");
      return null;
    }
  } catch (error) {
    console.error("❌ Error en limpieza manual:", error.message);
    return null;
  }
}

module.exports = {
  iniciarLimpiezaAutomatica,
  ejecutarLimpiezaManual,
};
