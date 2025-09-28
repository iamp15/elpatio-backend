const Transaccion = require("../models/Transaccion");
const Jugador = require("../models/Jugador");
const Cajero = require("../models/Cajero");
const mongoose = require("mongoose");
const { registrarLog } = require("../utils/logHelper");

/**
 * Controlador WebSocket para manejo de depósitos en tiempo real
 * 
 * Este controlador maneja toda la lógica de depósitos via WebSocket,
 * eliminando la necesidad de polling y proporcionando comunicación
 * en tiempo real entre jugadores y cajeros.
 */
class DepositoWebSocketController {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.io = socketManager.io;
  }

  /**
   * Manejar solicitud de depósito desde jugador
   * Evento: 'solicitar-deposito'
   */
  async solicitarDeposito(socket, data) {
    try {
      console.log("💰 [DEPOSITO] Nueva solicitud de depósito:", data);

      // Validar datos requeridos
      const { monto, metodoPago, descripcion } = data;
      if (!monto || !metodoPago || !descripcion) {
        socket.emit("error", {
          message: "Faltan datos requeridos: monto, metodoPago, descripcion"
        });
        return;
      }

      // Validar que el socket esté autenticado como jugador
      if (!socket.userType || socket.userType !== "jugador") {
        socket.emit("error", {
          message: "Solo los jugadores pueden solicitar depósitos"
        });
        return;
      }

      // Obtener datos del jugador desde la conexión
      const jugadorId = socket.jugadorId;
      const telegramId = socket.telegramId;

      if (!jugadorId || !telegramId) {
        socket.emit("error", {
          message: "Datos de jugador no encontrados"
        });
        return;
      }

      // Verificar que el jugador existe
      const jugador = await Jugador.findById(jugadorId);
      if (!jugador) {
        socket.emit("error", {
          message: "Jugador no encontrado"
        });
        return;
      }

      // Crear transacción de depósito
      const transaccion = new Transaccion({
        jugadorId,
        telegramId,
        tipo: "credito",
        categoria: "deposito",
        monto: parseFloat(monto),
        saldoAnterior: jugador.saldo || 0,
        descripcion,
        referencia: Transaccion.generarReferencia("deposito", jugadorId),
        estado: "pendiente",
        infoPago: {
          metodoPago: metodoPago
        },
        metadata: {
          procesadoPor: "websocket",
          tipoOperacion: "solicitud_deposito",
          socketId: socket.id
        }
      });

      await transaccion.save();

      console.log(`✅ [DEPOSITO] Transacción creada: ${transaccion._id}`);

      // Notificar al jugador que la solicitud fue creada
      socket.emit("solicitud-creada", {
        transaccionId: transaccion._id,
        referencia: transaccion.referencia,
        monto: transaccion.monto,
        estado: transaccion.estado,
        timestamp: new Date().toISOString()
      });

      // Notificar a todos los cajeros conectados
      await this.notificarCajerosNuevaSolicitud(transaccion, jugador);

      // Registrar log
      await registrarLog({
        accion: "Solicitud de depósito creada via WebSocket",
        usuario: jugadorId,
        rol: "jugador",
        detalle: {
          transaccionId: transaccion._id,
          monto: transaccion.monto,
          metodoPago: metodoPago,
          socketId: socket.id
        }
      });

    } catch (error) {
      console.error("❌ [DEPOSITO] Error en solicitarDeposito:", error);
      socket.emit("error", {
        message: "Error interno del servidor",
        details: error.message
      });
    }
  }

  /**
   * Manejar aceptación de solicitud por cajero
   * Evento: 'aceptar-solicitud'
   */
  async aceptarSolicitud(socket, data) {
    try {
      console.log("🏦 [DEPOSITO] Cajero aceptando solicitud:", data);

      // Validar datos requeridos
      const { transaccionId } = data;
      if (!transaccionId) {
        socket.emit("error", {
          message: "ID de transacción requerido"
        });
        return;
      }

      // Validar que el socket esté autenticado como cajero
      if (!socket.userType || socket.userType !== "cajero") {
        socket.emit("error", {
          message: "Solo los cajeros pueden aceptar solicitudes"
        });
        return;
      }

      const cajeroId = socket.cajeroId;
      if (!cajeroId) {
        socket.emit("error", {
          message: "Datos de cajero no encontrados"
        });
        return;
      }

      // Buscar la transacción
      const transaccion = await Transaccion.findById(transaccionId)
        .populate("jugadorId", "telegramId nickname firstName")
        .populate("cajeroId", "nombreCompleto email telefonoContacto datosPagoMovil");

      if (!transaccion) {
        socket.emit("error", {
          message: "Transacción no encontrada"
        });
        return;
      }

      if (transaccion.estado !== "pendiente") {
        socket.emit("error", {
          message: "La transacción ya no está pendiente"
        });
        return;
      }

      // Verificar que el cajero esté disponible
      const cajero = await Cajero.findById(cajeroId);
      if (!cajero || cajero.estado !== "activo") {
        socket.emit("error", {
          message: "Cajero no disponible"
        });
        return;
      }

      // Asignar cajero a la transacción
      transaccion.cajeroId = cajeroId;
      transaccion.fechaAsignacionCajero = new Date();
      transaccion.cambiarEstado("en_proceso");
      await transaccion.save();

      console.log(`✅ [DEPOSITO] Cajero ${cajero.nombreCompleto} asignado a transacción ${transaccionId}`);

      // Notificar al cajero que la asignación fue exitosa
      socket.emit("solicitud-aceptada", {
        transaccionId: transaccion._id,
        jugador: {
          id: transaccion.jugadorId._id,
          telegramId: transaccion.jugadorId.telegramId,
          nombre: transaccion.jugadorId.nickname || transaccion.jugadorId.firstName
        },
        monto: transaccion.monto,
        estado: transaccion.estado,
        timestamp: new Date().toISOString()
      });

      // Notificar al jugador que su solicitud fue aceptada
      await this.notificarJugadorSolicitudAceptada(transaccion, cajero);

      // Registrar log
      await registrarLog({
        accion: "Solicitud de depósito aceptada via WebSocket",
        usuario: cajeroId,
        rol: "cajero",
        detalle: {
          transaccionId: transaccion._id,
          jugadorId: transaccion.jugadorId._id,
          monto: transaccion.monto,
          socketId: socket.id
        }
      });

    } catch (error) {
      console.error("❌ [DEPOSITO] Error en aceptarSolicitud:", error);
      socket.emit("error", {
        message: "Error interno del servidor",
        details: error.message
      });
    }
  }

  /**
   * Manejar confirmación de pago por jugador
   * Evento: 'confirmar-pago-jugador'
   */
  async confirmarPagoJugador(socket, data) {
    try {
      console.log("💳 [DEPOSITO] Jugador confirmando pago:", data);

      // Validar datos requeridos
      const { transaccionId, datosPago } = data;
      if (!transaccionId || !datosPago) {
        socket.emit("error", {
          message: "ID de transacción y datos de pago requeridos"
        });
        return;
      }

      // Validar que el socket esté autenticado como jugador
      if (!socket.userType || socket.userType !== "jugador") {
        socket.emit("error", {
          message: "Solo los jugadores pueden confirmar pagos"
        });
        return;
      }

      // Buscar la transacción
      const transaccion = await Transaccion.findById(transaccionId)
        .populate("cajeroId", "nombreCompleto email");

      if (!transaccion) {
        socket.emit("error", {
          message: "Transacción no encontrada"
        });
        return;
      }

      if (transaccion.estado !== "en_proceso") {
        socket.emit("error", {
          message: "La transacción no está en proceso"
        });
        return;
      }

      // Actualizar información de pago
      transaccion.infoPago = {
        ...transaccion.infoPago,
        ...datosPago,
        fechaPago: new Date()
      };

      await transaccion.save();

      console.log(`✅ [DEPOSITO] Pago confirmado por jugador para transacción ${transaccionId}`);

      // Notificar al jugador que el pago fue registrado
      socket.emit("pago-confirmado", {
        transaccionId: transaccion._id,
        estado: "esperando_verificacion",
        timestamp: new Date().toISOString()
      });

      // Notificar al cajero que debe verificar el pago
      await this.notificarCajeroVerificarPago(transaccion);

      // Registrar log
      await registrarLog({
        accion: "Pago confirmado por jugador via WebSocket",
        usuario: transaccion.jugadorId,
        rol: "jugador",
        detalle: {
          transaccionId: transaccion._id,
          datosPago: datosPago,
          socketId: socket.id
        }
      });

    } catch (error) {
      console.error("❌ [DEPOSITO] Error en confirmarPagoJugador:", error);
      socket.emit("error", {
        message: "Error interno del servidor",
        details: error.message
      });
    }
  }

  /**
   * Manejar verificación de pago por cajero
   * Evento: 'verificar-pago-cajero'
   */
  async verificarPagoCajero(socket, data) {
    const session = await mongoose.startSession();

    try {
      console.log("🔍 [DEPOSITO] Cajero verificando pago:", data);

      await session.startTransaction();

      // Validar datos requeridos
      const { transaccionId, confirmado, notas } = data;
      if (!transaccionId || confirmado === undefined) {
        socket.emit("error", {
          message: "ID de transacción y confirmación requeridos"
        });
        return;
      }

      // Validar que el socket esté autenticado como cajero
      if (!socket.userType || socket.userType !== "cajero") {
        socket.emit("error", {
          message: "Solo los cajeros pueden verificar pagos"
        });
        return;
      }

      // Buscar la transacción
      const transaccion = await Transaccion.findById(transaccionId).session(session);
      if (!transaccion) {
        await session.abortTransaction();
        socket.emit("error", {
          message: "Transacción no encontrada"
        });
        return;
      }

      if (transaccion.estado !== "en_proceso") {
        await session.abortTransaction();
        socket.emit("error", {
          message: "La transacción no está en proceso"
        });
        return;
      }

      if (confirmado) {
        // Confirmar el pago
        transaccion.fechaConfirmacionCajero = new Date();
        transaccion.infoPago = {
          ...transaccion.infoPago,
          notasCajero: notas || "Pago verificado correctamente"
        };
        transaccion.cambiarEstado("confirmada");
        await transaccion.save({ session });

        // Procesar saldo del jugador
        const jugador = await Jugador.findById(transaccion.jugadorId).session(session);
        const saldoNuevo = jugador.saldo + transaccion.monto;

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

        await session.commitTransaction();

        console.log(`✅ [DEPOSITO] Depósito completado: ${transaccionId}, nuevo saldo: ${saldoNuevo}`);

        // Notificar al cajero
        socket.emit("deposito-completado", {
          transaccionId: transaccion._id,
          monto: transaccion.monto,
          saldoNuevo: saldoNuevo,
          timestamp: new Date().toISOString()
        });

        // Notificar al jugador
        await this.notificarJugadorDepositoCompletado(transaccion, saldoNuevo);

        // Registrar log
        await registrarLog({
          accion: "Depósito completado via WebSocket",
          usuario: socket.cajeroId,
          rol: "cajero",
          detalle: {
            transaccionId: transaccion._id,
            jugadorId: transaccion.jugadorId,
            monto: transaccion.monto,
            saldoNuevo: saldoNuevo,
            socketId: socket.id
          }
        });

      } else {
        // Rechazar el pago
        transaccion.cambiarEstado("rechazada", notas || "Pago no verificado");
        await transaccion.save({ session });

        await session.commitTransaction();

        console.log(`❌ [DEPOSITO] Depósito rechazado: ${transaccionId}`);

        // Notificar al cajero
        socket.emit("deposito-rechazado", {
          transaccionId: transaccion._id,
          motivo: notas || "Pago no verificado",
          timestamp: new Date().toISOString()
        });

        // Notificar al jugador
        await this.notificarJugadorDepositoRechazado(transaccion, notas);

        // Registrar log
        await registrarLog({
          accion: "Depósito rechazado via WebSocket",
          usuario: socket.cajeroId,
          rol: "cajero",
          detalle: {
            transaccionId: transaccion._id,
            jugadorId: transaccion.jugadorId,
            motivo: notas,
            socketId: socket.id
          }
        });
      }

    } catch (error) {
      await session.abortTransaction();
      console.error("❌ [DEPOSITO] Error en verificarPagoCajero:", error);
      socket.emit("error", {
        message: "Error interno del servidor",
        details: error.message
      });
    } finally {
      await session.endSession();
    }
  }

  // ===== MÉTODOS AUXILIARES =====

  /**
   * Notificar a todos los cajeros sobre nueva solicitud
   */
  async notificarCajerosNuevaSolicitud(transaccion, jugador) {
    const cajerosConectados = Array.from(this.socketManager.connectedCajeros.keys());
    
    if (cajerosConectados.length === 0) {
      console.log("⚠️ [DEPOSITO] No hay cajeros conectados para notificar");
      return;
    }

    const notificacion = {
      transaccionId: transaccion._id,
      jugador: {
        id: jugador._id,
        telegramId: jugador.telegramId,
        nombre: jugador.nickname || jugador.firstName || "Usuario"
      },
      monto: transaccion.monto,
      metodoPago: transaccion.infoPago.metodoPago,
      descripcion: transaccion.descripcion,
      timestamp: new Date().toISOString()
    };

    // Notificar a todos los cajeros conectados
    cajerosConectados.forEach(cajeroId => {
      const cajeroSocketId = this.socketManager.connectedCajeros.get(cajeroId);
      if (cajeroSocketId) {
        this.io.to(cajeroSocketId).emit("nueva-solicitud-deposito", notificacion);
      }
    });

    console.log(`📢 [DEPOSITO] Notificación enviada a ${cajerosConectados.length} cajeros`);
  }

  /**
   * Notificar al jugador que su solicitud fue aceptada
   */
  async notificarJugadorSolicitudAceptada(transaccion, cajero) {
    const jugadorSocketId = this.socketManager.connectedUsers.get(transaccion.telegramId);
    
    if (!jugadorSocketId) {
      console.log("⚠️ [DEPOSITO] Jugador no conectado para notificar aceptación");
      return;
    }

    const notificacion = {
      transaccionId: transaccion._id,
      cajero: {
        id: cajero._id,
        nombre: cajero.nombreCompleto,
        telefono: cajero.telefonoContacto,
        datosPago: {
          banco: cajero.datosPagoMovil.banco,
          cedula: {
            prefijo: cajero.datosPagoMovil.cedula.prefijo,
            numero: cajero.datosPagoMovil.cedula.numero
          },
          telefono: cajero.datosPagoMovil.telefono
        }
      },
      monto: transaccion.monto,
      timestamp: new Date().toISOString()
    };

    this.io.to(jugadorSocketId).emit("solicitud-aceptada", notificacion);
    console.log(`📢 [DEPOSITO] Datos bancarios enviados al jugador ${transaccion.telegramId}`);
  }

  /**
   * Notificar al cajero que debe verificar el pago
   */
  async notificarCajeroVerificarPago(transaccion) {
    const cajeroSocketId = this.socketManager.connectedCajeros.get(transaccion.cajeroId);
    
    if (!cajeroSocketId) {
      console.log("⚠️ [DEPOSITO] Cajero no conectado para notificar verificación");
      return;
    }

    const notificacion = {
      transaccionId: transaccion._id,
      jugador: {
        id: transaccion.jugadorId._id,
        telegramId: transaccion.jugadorId.telegramId,
        nombre: transaccion.jugadorId.nickname || transaccion.jugadorId.firstName
      },
      monto: transaccion.monto,
      datosPago: transaccion.infoPago,
      timestamp: new Date().toISOString()
    };

    this.io.to(cajeroSocketId).emit("verificar-pago", notificacion);
    console.log(`📢 [DEPOSITO] Solicitud de verificación enviada al cajero ${transaccion.cajeroId}`);
  }

  /**
   * Notificar al jugador que su depósito fue completado
   */
  async notificarJugadorDepositoCompletado(transaccion, saldoNuevo) {
    const jugadorSocketId = this.socketManager.connectedUsers.get(transaccion.telegramId);
    
    if (!jugadorSocketId) {
      console.log("⚠️ [DEPOSITO] Jugador no conectado para notificar completado");
      return;
    }

    const notificacion = {
      transaccionId: transaccion._id,
      monto: transaccion.monto,
      saldoAnterior: transaccion.saldoAnterior,
      saldoNuevo: saldoNuevo,
      mensaje: "¡Depósito completado exitosamente! Gracias por tu confianza.",
      timestamp: new Date().toISOString()
    };

    this.io.to(jugadorSocketId).emit("deposito-completado", notificacion);
    console.log(`📢 [DEPOSITO] Confirmación de depósito enviada al jugador ${transaccion.telegramId}`);
  }

  /**
   * Notificar al jugador que su depósito fue rechazado
   */
  async notificarJugadorDepositoRechazado(transaccion, motivo) {
    const jugadorSocketId = this.socketManager.connectedUsers.get(transaccion.telegramId);
    
    if (!jugadorSocketId) {
      console.log("⚠️ [DEPOSITO] Jugador no conectado para notificar rechazo");
      return;
    }

    const notificacion = {
      transaccionId: transaccion._id,
      monto: transaccion.monto,
      motivo: motivo || "Pago no verificado",
      timestamp: new Date().toISOString()
    };

    this.io.to(jugadorSocketId).emit("deposito-rechazado", notificacion);
    console.log(`📢 [DEPOSITO] Rechazo de depósito enviado al jugador ${transaccion.telegramId}`);
  }
}

module.exports = DepositoWebSocketController;
