/**
 * Utilidades para buscar sockets conectados
 */

/**
 * Buscar socket ID del jugador por telegramId (maneja string/número)
 * @param {Object} socketManager - Instancia del socketManager
 * @param {string|number} telegramId - ID de Telegram del jugador
 * @returns {string|null} Socket ID del jugador o null si no está conectado
 */
function buscarJugadorConectado(socketManager, telegramId) {
  // Intentar con el valor original
  let socketId = socketManager.connectedUsers.get(telegramId);

  // Si no se encuentra, intentar con el telegramId como número
  if (!socketId) {
    socketId = socketManager.connectedUsers.get(parseInt(telegramId));
  }

  // Si no se encuentra, intentar con el telegramId como string
  if (!socketId) {
    socketId = socketManager.connectedUsers.get(telegramId.toString());
  }

  return socketId;
}

/**
 * Buscar socket ID del cajero por cajeroId (maneja ObjectId/string)
 * @param {Object} socketManager - Instancia del socketManager
 * @param {string|Object} cajeroId - ID del cajero
 * @returns {string|null} Socket ID del cajero o null si no está conectado
 */
function buscarCajeroConectado(socketManager, cajeroId) {
  // Intentar con el valor original
  let socketId = socketManager.connectedCajeros.get(cajeroId);

  // Si no se encuentra, intentar con el cajeroId como string
  if (!socketId) {
    socketId = socketManager.connectedCajeros.get(cajeroId.toString());
  }

  // Si no se encuentra, intentar con el cajeroId como ObjectId
  if (!socketId && typeof cajeroId === "string") {
    const mongoose = require("mongoose");
    socketId = socketManager.connectedCajeros.get(
      new mongoose.Types.ObjectId(cajeroId)
    );
  }

  return socketId;
}

module.exports = {
  buscarJugadorConectado,
  buscarCajeroConectado,
};
