/**
 * Script para diagnosticar y limpiar rooms de transacciones
 * Se conecta al servidor remoto en Fly.io mediante endpoints REST
 *
 * Uso:
 *   node scripts/diagnosticarRooms.js [diagnostico|limpiar|ambos]
 *
 * Ejemplos:
 *   node scripts/diagnosticarRooms.js diagnostico  # Solo diagnostico
 *   node scripts/diagnosticarRooms.js limpiar       # Solo limpieza
 *   node scripts/diagnosticarRooms.js ambos         # Diagnostico y limpieza
 *   node scripts/diagnosticarRooms.js               # Por defecto: ambos
 *
 * Variables de entorno requeridas:
 *   BACKEND_URL - URL del servidor backend (ej: https://elpatio-backend.fly.dev)
 */

// Cargar variables de entorno
try {
  require("dotenv").config();
} catch (error) {
  // dotenv no es crítico, continuar sin él
}

const axios = require("axios");

// Obtener URL del servidor desde variables de entorno
const BACKEND_URL = process.env.BACKEND_URL || "https://elpatio-backend.fly.dev";

/**
 * Diagnosticar rooms de transacciones desde el servidor remoto
 */
async function diagnosticarRooms() {
  try {
    console.log("\n🔍 ===== DIAGNÓSTICO DE ROOMS DE TRANSACCIONES =====");
    console.log(`📅 Fecha: ${new Date().toLocaleString("es-ES")}`);
    console.log(`🌐 Servidor: ${BACKEND_URL}\n`);

    const response = await axios.get(`${BACKEND_URL}/api/websocket/diagnosticar-rooms`);

    if (!response.data.success) {
      throw new Error(response.data.message || "Error en la respuesta del servidor");
    }

    const diagnostico = response.data.diagnostico;

    console.log("📊 RESUMEN:");
    console.log(`   Total de rooms: ${diagnostico.totalRooms}`);
    console.log(`   Rooms con participantes: ${diagnostico.roomsConParticipantes}`);
    console.log(`   Rooms vacíos: ${diagnostico.roomsVacios}`);
    console.log(`   Rooms protegidos: ${diagnostico.roomsProtegidos}`);
    console.log(`   Rooms huérfanos: ${diagnostico.roomsHuerfanos}`);

    if (diagnostico.detalles && diagnostico.detalles.length > 0) {
      console.log("\n📋 DETALLES:");
      diagnostico.detalles.forEach((room, index) => {
        const estado = room.huerfano
          ? "🔴 HUÉRFANO"
          : room.protegido
          ? "🛡️ PROTEGIDO"
          : room.participantes > 0
          ? "✅ ACTIVO"
          : "⚪ VACÍO";

        console.log(
          `   ${index + 1}. ${room.transaccionId} | ${estado} | Participantes: ${room.participantes}`
        );

        // Mostrar detalles de participantes si existen
        if (room.participantesDetalle && room.participantesDetalle.length > 0) {
          room.participantesDetalle.forEach((participante, pIndex) => {
            const tipoUsuario =
              participante.userType === "jugador"
                ? "👤 Jugador"
                : participante.userType === "cajero"
                ? "🏦 Cajero"
                : participante.userType === "bot"
                ? "🤖 Bot"
                : "❓ Desconocido";

            const estadoConexion = participante.conectado ? "🟢" : "🔴";
            const userId = participante.userId
              ? ` (${participante.userId})`
              : "";

            console.log(
              `      ${pIndex + 1}. ${tipoUsuario}${userId} | Socket: ${participante.socketId.substring(0, 8)}... | ${estadoConexion}`
            );
          });
        } else if (room.socketIds && room.socketIds.length > 0) {
          // Fallback si no hay detalles de participantes
          room.socketIds.forEach((socketId, sIndex) => {
            console.log(
              `      ${sIndex + 1}. Socket: ${socketId.substring(0, 8)}...`
            );
          });
        }
      });
    }

    console.log("\n✅ Diagnóstico completado\n");

    return diagnostico;
  } catch (error) {
    if (error.response) {
      console.error(
        `❌ Error del servidor (${error.response.status}):`,
        error.response.data?.message || error.response.statusText
      );
    } else if (error.request) {
      console.error("❌ Error de conexión: No se pudo conectar al servidor");
      console.error(`   URL: ${BACKEND_URL}`);
      console.error("   Verifica que el servidor esté activo y la URL sea correcta");
    } else {
      console.error("❌ Error en diagnóstico:", error.message);
    }
    throw error;
  }
}

/**
 * Limpiar rooms huérfanos en el servidor remoto
 */
async function limpiarRoomsHuerfanos() {
  try {
    console.log("\n🧹 ===== LIMPIEZA DE ROOMS HUÉRFANOS =====");
    console.log(`📅 Fecha: ${new Date().toLocaleString("es-ES")}`);
    console.log(`🌐 Servidor: ${BACKEND_URL}\n`);

    const response = await axios.post(`${BACKEND_URL}/api/websocket/limpiar-rooms`);

    if (!response.data.success) {
      throw new Error(response.data.message || "Error en la respuesta del servidor");
    }

    const resultado = response.data.resultado;

    console.log("📊 RESULTADO:");
    console.log(`   Rooms limpiados: ${resultado.limpiados}`);
    console.log(`   Rooms protegidos (no limpiados): ${resultado.protegidos}`);
    console.log(`   Rooms con participantes: ${resultado.conParticipantes}`);

    if (resultado.detalles && resultado.detalles.length > 0) {
      console.log("\n📋 DETALLES:");
      resultado.detalles.forEach((detalle, index) => {
        console.log(
          `   ${index + 1}. ${detalle.transaccionId.substring(0, 8)}... | ${detalle.razon}`
        );
      });
    }

    console.log("\n✅ Limpieza completada\n");

    return resultado;
  } catch (error) {
    if (error.response) {
      console.error(
        `❌ Error del servidor (${error.response.status}):`,
        error.response.data?.message || error.response.statusText
      );
    } else if (error.request) {
      console.error("❌ Error de conexión: No se pudo conectar al servidor");
      console.error(`   URL: ${BACKEND_URL}`);
      console.error("   Verifica que el servidor esté activo y la URL sea correcta");
    } else {
      console.error("❌ Error en limpieza:", error.message);
    }
    throw error;
  }
}

async function main() {
  const accion = process.argv[2] || "ambos";

  try {
    switch (accion.toLowerCase()) {
      case "diagnostico":
        await diagnosticarRooms();
        break;

      case "limpiar":
        await limpiarRoomsHuerfanos();
        break;

      case "ambos":
        const diagnostico = await diagnosticarRooms();

        if (diagnostico.roomsHuerfanos > 0) {
          console.log(
            `\n⚠️ Se encontraron ${diagnostico.roomsHuerfanos} rooms huérfanos`
          );
          console.log("Limpiando automáticamente...\n");

          await limpiarRoomsHuerfanos();
        } else {
          console.log("\n✅ No hay rooms huérfanos para limpiar\n");
        }
        break;

      default:
        console.error(`❌ Acción desconocida: ${accion}`);
        console.log("Uso: node scripts/diagnosticarRooms.js [diagnostico|limpiar|ambos]");
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error fatal:", error.message);
    process.exit(1);
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main();
}

module.exports = { diagnosticarRooms, limpiarRoomsHuerfanos };
