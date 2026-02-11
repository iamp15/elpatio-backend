/**
 * Controlador de transacciones
 * Refactorizado: Handlers extraídos a módulos separados
 * 
 * Este archivo re-exporta todas las funciones para mantener compatibilidad
 * con las rutas existentes y otros controladores.
 */

// ===== HANDLERS =====
const { crearSolicitudCajero } = require("./transacciones/handlers/solicitudHandler");
const { obtenerCajerosDisponibles, asignarCajero } = require("./transacciones/handlers/asignacionHandler");
const { obtenerTransaccionesCajero, obtenerPendientesCajero, obtenerEstadoTransaccion } = require("./transacciones/handlers/consultaHandler");
const { confirmarPagoUsuario, confirmarPorCajero } = require("./transacciones/handlers/confirmacionHandler");
const { cancelarTransaccionJugador } = require("./transacciones/handlers/cancelacionHandler");
const { rechazarTransaccion } = require("./transacciones/handlers/rechazoHandler");
const { reportarTransferencia } = require("./transacciones/handlers/reportarTransferenciaHandler");
const { obtenerHistorial, obtenerEstadisticas } = require("./transacciones/handlers/historialHandler");

// ===== PROCESAMIENTO =====
const { procesarTransaccionAutomatica } = require("./transacciones/procesamiento/procesamientoAutomatico");
const { procesarReembolso, procesarReembolsosMasivos } = require("./transacciones/procesamiento/reembolsos");

// ===== RE-EXPORTAR TODAS LAS FUNCIONES PARA COMPATIBILIDAD =====

// Endpoints para solicitudes de cajero
exports.crearSolicitudCajero = crearSolicitudCajero;

// Endpoints para administradores
exports.obtenerCajerosDisponibles = obtenerCajerosDisponibles;
exports.obtenerTransaccionesCajero = obtenerTransaccionesCajero;
exports.obtenerPendientesCajero = obtenerPendientesCajero;
exports.asignarCajero = asignarCajero;

// Endpoints para jugadores
exports.confirmarPagoUsuario = confirmarPagoUsuario;
exports.cancelarTransaccionJugador = cancelarTransaccionJugador;

// Endpoints para cajeros
exports.confirmarPorCajero = confirmarPorCajero;
exports.rechazarTransaccion = rechazarTransaccion;

// Endpoint para admin reportar transferencia (cuando se asigna como cajero)
exports.reportarTransferencia = reportarTransferencia;

// Endpoints de consulta
exports.obtenerHistorial = obtenerHistorial;
exports.obtenerEstadisticas = obtenerEstadisticas;
exports.obtenerEstadoTransaccion = obtenerEstadoTransaccion;

// Procesamiento automático
exports.procesarTransaccionAutomatica = procesarTransaccionAutomatica;

// Funciones auxiliares (usadas por otros controladores)
exports.procesarReembolso = procesarReembolso;
exports.procesarReembolsosMasivos = procesarReembolsosMasivos;
