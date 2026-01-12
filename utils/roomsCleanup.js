/**
 * Script de limpieza automática de rooms huérfanos
 * Limpia rooms de transacciones que están vacíos y no protegidos
 * Se ejecuta automáticamente según configuración de cron
 */

const cron = require("node-cron");

// Variables de entorno
const CLEANUP_ENABLED =
  process.env.ROOMS_CLEANUP_ENABLED === "true" || false; // Por defecto deshabilitado
const CLEANUP_CRON =
  process.env.ROOMS_CLEANUP_CRON || "0 */6 * * *"; // Cada 6 horas por defecto

/**
 * Iniciar tarea de limpieza automática
 * @param {Object} socketManager - Instancia del SocketManager
 */
function iniciarLimpiezaAutomatica(socketManager) {
  if (!socketManager) {
    console.log("⚠️ [ROOMS-CLEANUP] SocketManager no disponible");
    return null;
  }

  if (!CLEANUP_ENABLED) {
    console.log("🧹 [ROOMS-CLEANUP] Limpieza automática de rooms: DESHABILITADA");
    return null;
  }

  console.log("🧹 [ROOMS-CLEANUP] Limpieza automática de rooms: HABILITADA");
  console.log(`📅 Cron expression: ${CLEANUP_CRON}`);
  console.log(`⏰ Se ejecutará cada 6 horas (configurable via ROOMS_CLEANUP_CRON)`);

  // Validar expresión cron
  if (!cron.validate(CLEANUP_CRON)) {
    console.error(
      `❌ [ROOMS-CLEANUP] Expresión cron inválida: ${CLEANUP_CRON}. Deshabilitando limpieza automática.`
    );
    return null;
  }

  // Programar tarea
  const tarea = cron.schedule(
    CLEANUP_CRON,
    async () => {
      console.log("\n🧹 ===== INICIANDO LIMPIEZA AUTOMÁTICA DE ROOMS =====");
      console.log(`📅 Fecha: ${new Date().toLocaleString("es-ES")}`);

      try {
        if (!socketManager.roomsManager) {
          console.error("❌ [ROOMS-CLEANUP] RoomsManager no disponible");
          return;
        }

        // Primero diagnosticar
        const diagnostico = socketManager.roomsManager.diagnosticarRoomsTransacciones();
        console.log(
          `📊 Estado antes de limpieza: ${diagnostico.totalRooms} rooms totales, ${diagnostico.roomsHuerfanos} huérfanos`
        );

        // Limpiar solo si hay huérfanos
        if (diagnostico.roomsHuerfanos > 0) {
          const resultado = socketManager.roomsManager.limpiarRoomsVacios();

          console.log(
            `✅ Limpieza completada: ${resultado.limpiados} rooms limpiados, ${resultado.protegidos} protegidos, ${resultado.conParticipantes} con participantes`
          );
        } else {
          console.log("✅ No hay rooms huérfanos para limpiar");
        }
      } catch (error) {
        console.error("❌ [ROOMS-CLEANUP] Error en limpieza automática:", error.message);
      }

      console.log("🧹 ===== LIMPIEZA AUTOMÁTICA FINALIZADA =====\n");
    },
    {
      scheduled: true,
      timezone: "America/Caracas", // Ajustar según la zona horaria del proyecto
    }
  );

  console.log("✅ [ROOMS-CLEANUP] Tarea de limpieza programada correctamente");

  return tarea;
}

/**
 * Ejecutar limpieza manual
 * Útil para testing o ejecución manual
 * @param {Object} socketManager - Instancia del SocketManager
 */
async function ejecutarLimpiezaManual(socketManager) {
  console.log("\n🧹 ===== LIMPIEZA MANUAL DE ROOMS =====");
  console.log(`📅 Fecha: ${new Date().toLocaleString("es-ES")}`);

  if (!socketManager || !socketManager.roomsManager) {
    console.error("❌ SocketManager o RoomsManager no disponible");
    return null;
  }

  try {
    const resultado = socketManager.roomsManager.limpiarRoomsVacios();

    console.log(
      `✅ Limpieza manual completada: ${resultado.limpiados} rooms limpiados`
    );

    return resultado;
  } catch (error) {
    console.error("❌ Error en limpieza manual:", error.message);
    throw error;
  }
}

module.exports = {
  iniciarLimpiezaAutomatica,
  ejecutarLimpiezaManual,
};
