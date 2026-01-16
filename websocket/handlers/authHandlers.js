/**
 * Handlers de autenticación para WebSocket
 * Maneja autenticación de jugadores, cajeros y bots
 */

/**
 * Autenticar jugador usando datos de Telegram
 */
async function authenticateJugador(context, socket, data) {
  const { socketManager, roomsManager, connectionStateManager, connectionRecoveryManager } = context;
  const { telegramId, initData } = data;

  if (!telegramId || !initData) {
    return {
      success: false,
      message: "Datos de autenticación incompletos",
    };
  }

  try {
    // Validar datos de Telegram (simplificado por ahora)
    // En producción, deberías validar la firma de initData

    // Buscar jugador en la base de datos
    const Jugador = require("../../models/Jugador");
    const jugador = await Jugador.findOne({ telegramId });

    if (!jugador) {
      return {
        success: false,
        message: "Jugador no encontrado",
      };
    }

    // ======= VERIFICAR Y CERRAR CONEXIONES DUPLICADAS DE JUGADOR =======
    const socketIdAnterior = socketManager.connectedUsers.get(telegramId);
    
    // Si hay una conexión anterior diferente a la actual, cerrarla
    if (socketIdAnterior && socketIdAnterior !== socket.id) {
      const socketAnterior = socketManager.io.sockets.sockets.get(socketIdAnterior);
      if (socketAnterior) {
        console.log(`⚠️ [AUTH] Cerrando conexión anterior del jugador ${telegramId} (socket: ${socketIdAnterior})`);
        
        // Notificar al socket anterior que su sesión fue reemplazada
        socketAnterior.emit("session-replaced", {
          message: "Tu sesión fue reemplazada por una nueva conexión",
          reason: "new_connection",
        });
        
        // Limpiar el socket anterior de rooms
        roomsManager.limpiarSocket(socketIdAnterior);
        
        // Desconectar el socket anterior
        socketAnterior.disconnect(true);
      }
      
      // Limpiar del estado de conexión
      connectionStateManager.removerUsuario(socketIdAnterior);
    }
    // ======= FIN VERIFICACIÓN DE DUPLICADOS =======

    // Registrar conexión
    socketManager.connectedUsers.set(telegramId, socket.id);
    socketManager.connectedPlayers.set(telegramId, socket.id); // Registrar como jugador en app de depósitos
    socket.telegramId = telegramId;
    socket.jugadorId = jugador._id; // Agregar jugadorId al socket
    socket.userType = "jugador";

    // Agregar jugador a su room personal
    roomsManager.agregarJugador(telegramId, socket.id);

    // Agregar jugador al estado de conexión
    connectionStateManager.agregarJugador(telegramId, socket.id, {
      nombre: jugador.nickname || jugador.firstName || "Usuario",
      nickname: jugador.nickname,
    });

    console.log(
      `👤 Jugador autenticado: ${
        jugador.nickname || jugador.firstName
      } (${telegramId})`
    );

    // Verificar si hay sesión para recuperar
    const recovery = await connectionRecoveryManager.handleReconnection(
      socket,
      telegramId
    );

    if (recovery.recovered) {
      console.log(
        `🔄 [RECOVERY] Jugador ${telegramId} recuperó ${recovery.transactionsRecovered.length} transacciones`
      );
    }

    return {
      success: true,
      message: "Autenticación exitosa",
      user: {
        id: jugador._id,
        telegramId: jugador.telegramId,
        nombre: jugador.nickname || jugador.firstName || "Usuario",
        nickname: jugador.nickname,
        firstName: jugador.firstName,
        username: jugador.username,
      },
      recovery: recovery.recovered
        ? {
            transactionsRecovered: recovery.transactionsRecovered,
            disconnectionDuration: recovery.disconnectionDuration,
          }
        : null,
    };
  } catch (error) {
    console.error("Error autenticando jugador:", error);
    return {
      success: false,
      message: "Error validando datos de Telegram",
    };
  }
}

/**
 * Autenticar cajero usando JWT
 */
async function authenticateCajero(context, socket, data) {
  const { socketManager, roomsManager, connectionStateManager, connectionRecoveryManager } = context;
  const { token } = data;

  if (!token) {
    return {
      success: false,
      message: "Token JWT requerido",
    };
  }

  try {
    // Verificar JWT
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Permitir cajeros, admins y superadmins
    const rolesPermitidos = ["cajero", "admin", "superadmin"];
    if (!rolesPermitidos.includes(decoded.rol)) {
      return {
        success: false,
        message: "Token no válido para cajero o administrador",
      };
    }

    // Para admins, buscar en modelo Admin, para cajeros en modelo Cajero
    let usuario;
    if (decoded.rol === "cajero") {
      const Cajero = require("../../models/Cajero");
      usuario = await Cajero.findById(decoded.id);
    } else if (["admin", "superadmin"].includes(decoded.rol)) {
      const Admin = require("../../models/Admin");
      usuario = await Admin.findById(decoded.id);
    }

    if (!usuario) {
      return {
        success: false,
        message: "Usuario no encontrado",
      };
    }

    // ======= VERIFICAR Y CERRAR CONEXIONES DUPLICADAS =======
    if (decoded.rol === "cajero") {
      const socketIdAnterior = socketManager.connectedCajeros.get(decoded.id);
      
      // Si hay una conexión anterior diferente a la actual, cerrarla
      if (socketIdAnterior && socketIdAnterior !== socket.id) {
        const socketAnterior = socketManager.io.sockets.sockets.get(socketIdAnterior);
        if (socketAnterior) {
          console.log(`⚠️ [AUTH] Cerrando conexión anterior del cajero ${decoded.id} (socket: ${socketIdAnterior})`);
          
          // Notificar al socket anterior que su sesión fue reemplazada
          socketAnterior.emit("session-replaced", {
            message: "Tu sesión fue reemplazada por una nueva conexión",
            reason: "new_connection",
          });
          
          // Limpiar el socket anterior de rooms
          roomsManager.limpiarSocket(socketIdAnterior);
          
          // Desconectar el socket anterior
          socketAnterior.disconnect(true);
        }
        
        // Limpiar del estado de conexión
        connectionStateManager.removerUsuario(socketIdAnterior);
      }
    } else if (["admin", "superadmin"].includes(decoded.rol)) {
      // Para admins, verificar si ya tienen conexión y cerrarla
      // Buscar socket anterior por userId
      for (const [socketId, s] of socketManager.io.sockets.sockets.entries()) {
        if (s.userId === decoded.id && socketId !== socket.id) {
          console.log(`⚠️ [AUTH] Cerrando conexión anterior del admin ${decoded.id} (socket: ${socketId})`);
          
          s.emit("session-replaced", {
            message: "Tu sesión fue reemplazada por una nueva conexión",
            reason: "new_connection",
          });
          
          roomsManager.limpiarSocket(socketId);
          s.disconnect(true);
        }
      }
    }
    // ======= FIN VERIFICACIÓN DE DUPLICADOS =======

    // Registrar conexión
    if (decoded.rol === "cajero") {
      socketManager.connectedCajeros.set(decoded.id, socket.id);
      socket.cajeroId = decoded.id;
      socket.userType = "cajero";

      // Agregar cajero a room de disponibles por defecto
      roomsManager.agregarCajeroDisponible(decoded.id, socket.id);

      // Agregar cajero al estado de conexión
      connectionStateManager.agregarCajero(decoded.id, socket.id, {
        nombre: usuario.nombreCompleto,
        email: usuario.email,
      });
    } else {
      // Para admins, solo marcar el tipo de usuario
      socket.userId = decoded.id;
      socket.userType = decoded.rol; // "admin" o "superadmin"
    }

    if (decoded.rol === "cajero") {
      console.log(
        `🏦 Cajero autenticado: ${usuario.nombreCompleto} (${decoded.id})`
      );

      // Verificar si hay sesión para recuperar (solo para cajeros)
      const recovery = await connectionRecoveryManager.handleReconnection(
        socket,
        decoded.id
      );

      if (recovery.recovered) {
        console.log(
          `🔄 [RECOVERY] Cajero ${decoded.id} recuperó ${recovery.transactionsRecovered.length} transacciones`
        );
      }

      return {
        success: true,
        message: "Autenticación exitosa",
        user: {
          id: usuario._id,
          nombre: usuario.nombreCompleto,
          email: usuario.email,
          rol: decoded.rol,
        },
        recovery: recovery.recovered
          ? {
              transactionsRecovered: recovery.transactionsRecovered,
              disconnectionDuration: recovery.disconnectionDuration,
            }
          : null,
      };
    } else {
      // Para admins
      console.log(
        `👑 Admin autenticado: ${usuario.email || decoded.id} (${decoded.rol})`
      );

      return {
        success: true,
        message: "Autenticación exitosa",
        user: {
          id: usuario._id,
          email: usuario.email,
          rol: decoded.rol,
        },
        userType: decoded.rol,
      };
    }
  } catch (error) {
    console.error("Error autenticando cajero/admin:", error);
    return {
      success: false,
      message: "Token JWT inválido",
    };
  }
}

/**
 * Autenticar bot vía WebSocket
 */
async function authenticateBot(context, socket, data) {
  const { socketManager } = context;
  const { token } = data;

  if (!token) {
    return {
      success: false,
      message: "Token JWT requerido",
    };
  }

  try {
    // Verificar JWT
    const jwt = require("jsonwebtoken");
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.rol !== "bot") {
      return {
        success: false,
        message: "Token no válido para bot",
      };
    }

    // Registrar conexión
    socketManager.connectedBots.set(decoded.id, socket.id);
    socket.botId = decoded.id;
    socket.userType = "bot";

    console.log(`🤖 Bot autenticado: ${decoded.id}`);

    return {
      success: true,
      message: "Autenticación exitosa",
      user: {
        id: decoded.id,
        rol: "bot",
      },
    };
  } catch (error) {
    console.error("Error autenticando bot:", error);
    return {
      success: false,
      message: "Token JWT inválido",
    };
  }
}

module.exports = {
  authenticateJugador,
  authenticateCajero,
  authenticateBot,
};
