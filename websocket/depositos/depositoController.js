/**
 * Controlador WebSocket para manejo de depósitos en tiempo real
 *
 * Este controlador maneja toda la lógica de depósitos via WebSocket,
 * eliminando la necesidad de polling y proporcionando comunicación
 * en tiempo real entre jugadores y cajeros.
 *
 * Refactorizado: Dividido en módulos más pequeños para mejor mantenibilidad
 */

// Importar handlers
const { solicitarDeposito } = require("./handlers/solicitudHandler");
const { solicitarRetiro: solicitarRetiroHandler } = require("./handlers/solicitudRetiroHandler");
const { aceptarSolicitud } = require("./handlers/aceptacionHandler");
const { confirmarPagoJugador } = require("./handlers/confirmacionHandler");
const { verificarPagoCajero } = require("./handlers/verificacionHandler");
const {
  referirAAdmin,
  solicitarRevisionAdmin,
} = require("./handlers/revisionHandler");
const { ajustarMontoDeposito } = require("./handlers/ajusteHandler");

// Importar módulos de notificaciones
const {
  notificarCajerosNuevaSolicitud,
  notificarCajeroVerificarPago,
} = require("./notificaciones/notificacionesCajero");
const {
  notificarJugadorSolicitudAceptada,
  notificarJugadorAjusteMonto,
  notificarJugadorDepositoCompletado,
  notificarJugadorDepositoRechazado,
} = require("./notificaciones/notificacionesJugador");
const {
  notificarBotSolicitudAceptada,
  notificarBotPagoConfirmado,
  notificarBotDepositoCompletado,
  notificarBotDepositoRechazado,
  notificarBotNuevoDeposito,
} = require("./notificaciones/notificacionesBot");

// Importar utilidades
const {
  buscarJugadorConectado,
  buscarCajeroConectado,
} = require("./utils/socketUtils");

class DepositoWebSocketController {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.io = socketManager.io;
    this.roomsManager = socketManager.roomsManager;
    this.processingTransactions = new Set(); // Para evitar procesamiento duplicado
  }

  /**
   * Obtener contexto para pasar a los handlers
   * @private
   */
  getContext() {
    return {
      socketManager: this.socketManager,
      io: this.io,
      roomsManager: this.roomsManager,
      processingTransactions: this.processingTransactions,
    };
  }

  /**
   * Manejar solicitud de depósito desde jugador
   * Evento: 'solicitar-deposito'
   */
  async solicitarDeposito(socket, data) {
    return await solicitarDeposito(this.getContext(), socket, data);
  }

  /**
   * Manejar solicitud de retiro desde jugador
   * Evento: 'solicitar-retiro'
   */
  async solicitarRetiro(socket, data) {
    return await solicitarRetiroHandler(this.getContext(), socket, data);
  }

  /**
   * Manejar aceptación de solicitud por cajero
   * Evento: 'aceptar-solicitud'
   */
  async aceptarSolicitud(socket, data) {
    return await aceptarSolicitud(this.getContext(), socket, data);
  }

  /**
   * Manejar confirmación de pago por jugador
   * Evento: 'confirmar-pago-jugador'
   */
  async confirmarPagoJugador(socket, data) {
    return await confirmarPagoJugador(this.getContext(), socket, data);
  }

  /**
   * Manejar verificación de pago por cajero
   * Evento: 'verificar-pago-cajero'
   */
  async verificarPagoCajero(socket, data) {
    return await verificarPagoCajero(this.getContext(), socket, data);
  }

  /**
   * Referir transacción a administrador
   * Evento: 'referir-a-admin'
   */
  async referirAAdmin(socket, data) {
    return await referirAAdmin(this.getContext(), socket, data);
  }

  /**
   * Solicitar revisión administrativa de una transacción rechazada (desde jugador)
   * Evento: 'solicitar-revision-admin'
   */
  async solicitarRevisionAdmin(socket, data) {
    return await solicitarRevisionAdmin(this.getContext(), socket, data);
  }

  /**
   * Ajustar monto de depósito
   * Evento: 'ajustar-monto-deposito'
   */
  async ajustarMontoDeposito(socket, data) {
    return await ajustarMontoDeposito(this.getContext(), socket, data);
  }

  // ===== MÉTODOS AUXILIARES (mantener compatibilidad) =====

  /**
   * Buscar socket ID del jugador por telegramId (maneja string/número)
   */
  buscarJugadorConectado(telegramId) {
    return buscarJugadorConectado(this.socketManager, telegramId);
  }

  /**
   * Buscar socket ID del cajero por cajeroId (maneja ObjectId/string)
   */
  buscarCajeroConectado(cajeroId) {
    return buscarCajeroConectado(this.socketManager, cajeroId);
  }

  /**
   * Notificar a todos los cajeros sobre nueva solicitud
   */
  async notificarCajerosNuevaSolicitud(transaccion, jugador) {
    return await notificarCajerosNuevaSolicitud(
      this.getContext(),
      transaccion,
      jugador
    );
  }

  /**
   * Notificar al jugador que su solicitud fue aceptada
   */
  async notificarJugadorSolicitudAceptada(transaccion, cajero) {
    return await notificarJugadorSolicitudAceptada(
      this.getContext(),
      transaccion,
      cajero
    );
  }

  /**
   * Notificar al jugador sobre el ajuste de monto
   */
  async notificarJugadorAjusteMonto(
    transaccion,
    montoOriginal,
    montoReal,
    razon
  ) {
    return await notificarJugadorAjusteMonto(
      this.getContext(),
      transaccion,
      montoOriginal,
      montoReal,
      razon
    );
  }

  /**
   * Notificar al cajero que debe verificar el pago
   */
  async notificarCajeroVerificarPago(transaccion) {
    return await notificarCajeroVerificarPago(this.getContext(), transaccion);
  }

  /**
   * Notificar al jugador que su depósito fue completado
   */
  async notificarJugadorDepositoCompletado(transaccion, saldoNuevo) {
    return await notificarJugadorDepositoCompletado(
      this.getContext(),
      transaccion,
      saldoNuevo
    );
  }

  /**
   * Notificar al jugador que su depósito fue rechazado
   */
  async notificarJugadorDepositoRechazado(transaccion, motivo) {
    return await notificarJugadorDepositoRechazado(
      this.getContext(),
      transaccion,
      motivo
    );
  }

  /**
   * Notificar al bot sobre solicitud aceptada
   */
  async notificarBotSolicitudAceptada(transaccion, cajero) {
    return await notificarBotSolicitudAceptada(
      this.getContext(),
      transaccion,
      cajero
    );
  }

  /**
   * Notificar al bot sobre pago confirmado
   */
  async notificarBotPagoConfirmado(transaccion) {
    return await notificarBotPagoConfirmado(this.getContext(), transaccion);
  }

  /**
   * Notificar al bot sobre depósito completado
   */
  async notificarBotDepositoCompletado(transaccion, jugador, saldoNuevo) {
    return await notificarBotDepositoCompletado(
      this.getContext(),
      transaccion,
      jugador,
      saldoNuevo
    );
  }

  /**
   * Notificar al bot sobre depósito rechazado
   */
  async notificarBotDepositoRechazado(transaccion, jugador, motivo) {
    return await notificarBotDepositoRechazado(
      this.getContext(),
      transaccion,
      jugador,
      motivo
    );
  }

  /**
   * Notificar al bot sobre nuevo depósito
   */
  async notificarBotNuevoDeposito(transaccion, jugador) {
    return await notificarBotNuevoDeposito(
      this.getContext(),
      transaccion,
      jugador
    );
  }
}

module.exports = DepositoWebSocketController;
