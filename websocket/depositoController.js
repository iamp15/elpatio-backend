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
    this.roomsManager = socketManager.roomsManager;
    this.processingTransactions = new Set(); // Para evitar procesamiento duplicado
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
          message: "Faltan datos requeridos: monto, metodoPago, descripcion",
        });
        return;
      }

      // Validar que el socket esté autenticado como jugador
      if (!socket.userType || socket.userType !== "jugador") {
        socket.emit("error", {
          message: "Solo los jugadores pueden solicitar depósitos",
        });
        return;
      }

      // Obtener datos del jugador desde la conexión
      const jugadorId = socket.jugadorId;
      const telegramId = socket.telegramId;

      if (!jugadorId || !telegramId) {
        socket.emit("error", {
          message: "Datos de jugador no encontrados",
        });
        return;
      }

      // Verificar que el jugador existe
      const jugador = await Jugador.findById(jugadorId);
      if (!jugador) {
        socket.emit("error", {
          message: "Jugador no encontrado",
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
          metodoPago: metodoPago,
        },
        metadata: {
          procesadoPor: "websocket",
          tipoOperacion: "solicitud_deposito",
          socketId: socket.id,
        },
      });

      await transaccion.save();

      console.log(`✅ [DEPOSITO] Transacción creada: ${transaccion._id}`);

      // Notificar al jugador que la solicitud fue creada
      socket.emit("solicitud-creada", {
        transaccionId: transaccion._id,
        referencia: transaccion.referencia,
        monto: transaccion.monto,
        estado: transaccion.estado,
        timestamp: new Date().toISOString(),
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
          socketId: socket.id,
        },
      });
    } catch (error) {
      console.error("❌ [DEPOSITO] Error en solicitarDeposito:", error);
      socket.emit("error", {
        message: "Error interno del servidor",
        details: error.message,
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
          message: "ID de transacción requerido",
        });
        return;
      }

      // Validar que el socket esté autenticado como cajero
      if (!socket.userType || socket.userType !== "cajero") {
        socket.emit("error", {
          message: "Solo los cajeros pueden aceptar solicitudes",
        });
        return;
      }

      const cajeroId = socket.cajeroId;
      if (!cajeroId) {
        socket.emit("error", {
          message: "Datos de cajero no encontrados",
        });
        return;
      }

      // Buscar la transacción
      const transaccion = await Transaccion.findById(transaccionId)
        .populate("jugadorId", "telegramId nickname firstName")
        .populate(
          "cajeroId",
          "nombreCompleto email telefonoContacto datosPagoMovil"
        );

      if (!transaccion) {
        socket.emit("error", {
          message: "Transacción no encontrada",
        });
        return;
      }

      // No validar estado ni cambiar transacción - el HTTP API ya lo hizo
      // Solo verificar que el cajero esté disponible
      const cajero = await Cajero.findById(cajeroId);
      if (!cajero || cajero.estado !== "activo") {
        socket.emit("error", {
          message: "Cajero no disponible",
        });
        return;
      }

      console.log(
        `✅ [DEPOSITO] Cajero ${cajero.nombreCompleto} acepta transacción ${transaccionId}`
      );

      // Crear room de transacción
      this.roomsManager.crearRoomTransaccion(transaccionId, []);

      // Agregar cajero al room de la transacción
      this.roomsManager.agregarParticipanteTransaccion(
        transaccionId,
        socket.id
      );

      // Notificar al cajero que la asignación fue exitosa
      socket.emit("solicitud-aceptada-confirmacion", {
        transaccionId: transaccion._id,
        message: "Solicitud aceptada y notificada al jugador",
        timestamp: new Date().toISOString(),
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
          socketId: socket.id,
        },
      });
    } catch (error) {
      console.error("❌ [DEPOSITO] Error en aceptarSolicitud:", error);
      socket.emit("error", {
        message: "Error interno del servidor",
        details: error.message,
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
          message: "ID de transacción y datos de pago requeridos",
        });
        return;
      }

      // Validar que el socket esté autenticado como jugador
      if (!socket.userType || socket.userType !== "jugador") {
        socket.emit("error", {
          message: "Solo los jugadores pueden confirmar pagos",
        });
        return;
      }

      // Buscar la transacción
      const transaccion = await Transaccion.findById(transaccionId)
        .populate("jugadorId", "telegramId nickname firstName")
        .populate("cajeroId", "nombreCompleto email");

      if (!transaccion) {
        socket.emit("error", {
          message: "Transacción no encontrada",
        });
        return;
      }

      if (transaccion.estado !== "en_proceso") {
        socket.emit("error", {
          message: "La transacción no está en proceso",
        });
        return;
      }

      // 1. ACTUALIZAR BASE DE DATOS PRIMERO
      console.log("🔍 [DEBUG] datosPago recibidos:", datosPago);
      console.log("🔍 [DEBUG] infoPago actual:", transaccion.infoPago);

      // Mapear los campos del frontend a los campos del modelo
      const infoPagoActualizado = {
        ...transaccion.infoPago,
        metodoPago: datosPago.metodoPago || transaccion.infoPago.metodoPago,
        numeroReferencia: datosPago.referencia || datosPago.numeroReferencia,
        bancoOrigen: datosPago.banco || datosPago.bancoOrigen,
        telefonoOrigen: datosPago.telefono || datosPago.telefonoOrigen,
        fechaPago: datosPago.fecha ? new Date(datosPago.fecha) : new Date(),
      };

      transaccion.infoPago = infoPagoActualizado;

      // Cambiar estado a "realizada" cuando el usuario confirma que hizo el pago
      transaccion.cambiarEstado("realizada");

      console.log("🔍 [DEBUG] infoPago actualizado:", transaccion.infoPago);
      console.log("🔍 [DEBUG] Estado cambiado a: realizada");

      await transaccion.save();

      console.log(
        `✅ [DEPOSITO] Pago confirmado por jugador para transacción ${transaccionId}`
      );

      // 2. USAR ROOMS PARA NOTIFICAR A TODOS LOS PARTICIPANTES
      const notificacion = {
        transaccionId: transaccion._id,
        estado: "esperando_verificacion",
        timestamp: new Date().toISOString(),
      };

      // Enviar a la room de la transacción (todos reciben)
      this.io.to(`transaccion-${transaccionId}`).emit("verificar-pago", {
        ...notificacion,
        target: "cajero", // Solo cajero procesa
        jugador: {
          id: transaccion.jugadorId._id || transaccion.jugadorId,
          telegramId: transaccion.telegramId,
          nombre:
            (transaccion.jugadorId && transaccion.jugadorId.nickname) ||
            (transaccion.jugadorId && transaccion.jugadorId.firstName) ||
            "Usuario",
        },
        monto: transaccion.monto,
        datosPago: {
          banco: transaccion.infoPago.bancoOrigen,
          telefono: transaccion.infoPago.telefonoOrigen,
          referencia: transaccion.infoPago.numeroReferencia,
          fecha: transaccion.infoPago.fechaPago,
          monto: transaccion.monto,
        },
      });

      // Confirmar al jugador
      this.io.to(`transaccion-${transaccionId}`).emit("pago-confirmado", {
        ...notificacion,
        target: "jugador", // Solo jugador procesa
      });

      // Registrar log
      await registrarLog({
        accion: "Pago confirmado por jugador via WebSocket",
        usuario: transaccion.jugadorId,
        rol: "jugador",
        detalle: {
          transaccionId: transaccion._id,
          datosPago: datosPago,
          socketId: socket.id,
        },
      });
    } catch (error) {
      console.error("❌ [DEPOSITO] Error en confirmarPagoJugador:", error);
      socket.emit("error", {
        message: "Error interno del servidor",
        details: error.message,
      });
    }
  }

  /**
   * Manejar verificación de pago por cajero
   * Evento: 'verificar-pago-cajero'
   */
  async verificarPagoCajero(socket, data) {
    console.log("🔍 [DEPOSITO] verificarPagoCajero INICIADO:", {
      transaccionId: data.transaccionId,
      accion: data.accion,
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      stackTrace: new Error().stack,
    });

    const maxRetries = 3;
    let retryCount = 0;

    while (retryCount < maxRetries) {
      const session = await mongoose.startSession();

      try {
        console.log(
          "🔍 [DEPOSITO] Cajero verificando pago:",
          data,
          `(intento ${retryCount + 1})`
        );

        // Validar datos requeridos
        const { transaccionId, accion, notas, motivo } = data;

        // Verificar si ya se está procesando esta transacción
        if (this.processingTransactions.has(transaccionId)) {
          console.log(
            `⚠️ [DEPOSITO] Transacción ${transaccionId} ya está siendo procesada`
          );
          socket.emit("error", {
            message: "La transacción ya está siendo procesada",
          });
          return;
        }

        // Marcar como procesando
        this.processingTransactions.add(transaccionId);

        await session.startTransaction();
        if (!transaccionId || !accion) {
          socket.emit("error", {
            message: "ID de transacción y acción requeridos",
          });
          return;
        }

        if (!["confirmar", "rechazar"].includes(accion)) {
          socket.emit("error", {
            message: "Acción debe ser 'confirmar' o 'rechazar'",
          });
          return;
        }

        // Validar que el socket esté autenticado como cajero
        if (!socket.userType || socket.userType !== "cajero") {
          socket.emit("error", {
            message: "Solo los cajeros pueden verificar pagos",
          });
          return;
        }

        // Buscar la transacción
        const transaccion = await Transaccion.findById(transaccionId).session(
          session
        );
        if (!transaccion) {
          await session.abortTransaction();
          socket.emit("error", {
            message: "Transacción no encontrada",
          });
          return;
        }

        // Verificar que la transacción esté en estado "realizada" (usuario ya reportó el pago)
        if (transaccion.estado !== "realizada") {
          await session.abortTransaction();
          socket.emit("error", {
            message: `La transacción debe estar en estado "realizada". Estado actual: ${transaccion.estado}`,
          });
          return;
        }

        if (accion === "confirmar") {
          // Confirmar el pago
          transaccion.fechaConfirmacionCajero = new Date();
          transaccion.infoPago = {
            ...transaccion.infoPago,
            notasCajero: notas || "Pago verificado correctamente",
          };
          transaccion.cambiarEstado("confirmada");
          await transaccion.save({ session });

          // Procesar saldo del jugador
          const jugador = await Jugador.findById(transaccion.jugadorId).session(
            session
          );
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

          console.log(
            `✅ [DEPOSITO] Depósito completado: ${transaccionId}, nuevo saldo: ${saldoNuevo}`
          );

          // 2. USAR ROOMS PARA NOTIFICAR A TODOS LOS PARTICIPANTES
          const notificacion = {
            transaccionId: transaccion._id,
            monto: transaccion.monto,
            saldoNuevo: saldoNuevo,
            saldoAnterior: transaccion.saldoAnterior,
            estado: transaccion.estado, // Incluir estado de la transacción
            timestamp: new Date().toISOString(),
            infoPago: transaccion.infoPago, // Incluir datos de pago
          };

          // Enviar a la room de la transacción (todos reciben)
          console.log(
            `📢 [DEPOSITO] Enviando deposito-completado a room transaccion-${transaccionId} para cajero`
          );
          this.io
            .to(`transaccion-${transaccionId}`)
            .emit("deposito-completado", {
              ...notificacion,
              target: "cajero", // Solo cajero procesa
            });

          // Verificar quién está en la room antes de enviar
          const room = this.io.sockets.adapter.rooms.get(
            `transaccion-${transaccionId}`
          );
          console.log(
            `📢 [DEPOSITO] Room transaccion-${transaccionId} tiene ${
              room ? room.size : 0
            } participantes`
          );
          if (room) {
            console.log(
              `📢 [DEPOSITO] Participantes en room:`,
              Array.from(room)
            );
          }

          // Verificar si el jugador está conectado
          const jugadorSocketSet =
            this.socketManager.roomsManager.rooms.jugadores.get(
              transaccion.telegramId
            );
          const jugadorSocketId = jugadorSocketSet
            ? Array.from(jugadorSocketSet)[0]
            : null;
          console.log(
            `📢 [DEPOSITO] Jugador ${transaccion.telegramId} conectado:`,
            jugadorSocketId ? "SÍ" : "NO"
          );

          // Verificar si el jugador está en la room de la transacción
          const jugadorEnRoom = room && room.has(jugadorSocketId);
          console.log(
            `📢 [DEPOSITO] Jugador en room transaccion-${transaccionId}:`,
            jugadorEnRoom ? "SÍ" : "NO"
          );

          if (jugadorSocketId) {
            // Si el jugador está conectado pero no en la room, agregarlo
            if (!jugadorEnRoom) {
              console.log(
                `📢 [DEPOSITO] Agregando jugador a room transaccion-${transaccionId}`
              );
              this.socketManager.roomsManager.agregarParticipanteTransaccion(
                transaccionId,
                jugadorSocketId
              );
            }
            console.log(
              `📢 [DEPOSITO] Enviando deposito-completado a room transaccion-${transaccionId} para jugador`
            );
            console.log(`📢 [DEPOSITO] Datos para jugador:`, {
              ...notificacion,
              target: "jugador",
              mensaje:
                "¡Depósito completado exitosamente! Gracias por tu confianza.",
              saldoAnterior: transaccion.saldoAnterior,
            });

            this.io
              .to(`transaccion-${transaccionId}`)
              .emit("deposito-completado", {
                ...notificacion,
                target: "jugador", // Solo jugador procesa
                mensaje:
                  "¡Depósito completado exitosamente! Gracias por tu confianza.",
                saldoAnterior: transaccion.saldoAnterior,
              });
          } else {
            console.log(
              `📢 [DEPOSITO] Jugador no conectado, enviando notificación al bot de Telegram`
            );
            // TODO: Implementar notificación al bot de Telegram
            // await this.notificarBotTelegram(transaccion, notificacion);
          }

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
              socketId: socket.id,
            },
          });
        } else {
          // Rechazar el pago
          transaccion.cambiarEstado(
            "rechazada",
            motivo || "Pago no verificado"
          );
          await transaccion.save({ session });

          await session.commitTransaction();

          console.log(`❌ [DEPOSITO] Depósito rechazado: ${transaccionId}`);

          // 2. USAR ROOMS PARA NOTIFICAR A TODOS LOS PARTICIPANTES
          const notificacion = {
            transaccionId: transaccion._id,
            motivo: notas || "Pago no verificado",
            timestamp: new Date().toISOString(),
          };

          // Enviar a la room de la transacción (todos reciben)
          this.io
            .to(`transaccion-${transaccionId}`)
            .emit("deposito-rechazado", {
              ...notificacion,
              target: "cajero", // Solo cajero procesa
            });

          this.io
            .to(`transaccion-${transaccionId}`)
            .emit("deposito-rechazado", {
              ...notificacion,
              target: "jugador", // Solo jugador procesa
              monto: transaccion.monto,
            });

          // Registrar log
          await registrarLog({
            accion: "Depósito rechazado via WebSocket",
            usuario: socket.cajeroId,
            rol: "cajero",
            detalle: {
              transaccionId: transaccion._id,
              jugadorId: transaccion.jugadorId,
              motivo: notas,
              socketId: socket.id,
            },
          });
        }

        // Si llegamos aquí, la transacción fue exitosa
        this.processingTransactions.delete(transaccionId);
        await session.endSession();
        return; // Salir del bucle de reintentos
      } catch (error) {
        await session.abortTransaction();
        await session.endSession();

        // Verificar si es un error de concurrencia que se puede reintentar
        if (error.code === 112 && retryCount < maxRetries - 1) {
          retryCount++;
          console.log(
            `🔄 [DEPOSITO] Reintentando verificación de pago (intento ${
              retryCount + 1
            }/${maxRetries})`
          );
          // Esperar un poco antes del siguiente intento
          await new Promise((resolve) => setTimeout(resolve, 100 * retryCount));
          continue;
        }

        console.error("❌ [DEPOSITO] Error en verificarPagoCajero:", error);
        this.processingTransactions.delete(transaccionId);
        socket.emit("error", {
          message: "Error interno del servidor",
          details: error.message,
        });
        return;
      }
    }

    // Si llegamos aquí, se agotaron los reintentos
    console.error(
      "❌ [DEPOSITO] Se agotaron los reintentos para verificarPagoCajero"
    );
    this.processingTransactions.delete(data.transaccionId);
    socket.emit("error", {
      message: "Error interno del servidor",
      details:
        "No se pudo procesar la verificación después de múltiples intentos",
    });
  }

  // ===== MÉTODOS AUXILIARES =====

  /**
   * Buscar socket ID del jugador por telegramId (maneja string/número)
   */
  buscarJugadorConectado(telegramId) {
    // Intentar con el valor original
    let socketId = this.socketManager.connectedUsers.get(telegramId);

    // Si no se encuentra, intentar con el telegramId como número
    if (!socketId) {
      socketId = this.socketManager.connectedUsers.get(parseInt(telegramId));
    }

    // Si no se encuentra, intentar con el telegramId como string
    if (!socketId) {
      socketId = this.socketManager.connectedUsers.get(telegramId.toString());
    }

    return socketId;
  }

  /**
   * Buscar socket ID del cajero por cajeroId (maneja ObjectId/string)
   */
  buscarCajeroConectado(cajeroId) {
    // Intentar con el valor original
    let socketId = this.socketManager.connectedCajeros.get(cajeroId);

    // Si no se encuentra, intentar con el cajeroId como string
    if (!socketId) {
      socketId = this.socketManager.connectedCajeros.get(cajeroId.toString());
    }

    // Si no se encuentra, intentar con el cajeroId como ObjectId
    if (!socketId && typeof cajeroId === "string") {
      const mongoose = require("mongoose");
      socketId = this.socketManager.connectedCajeros.get(
        new mongoose.Types.ObjectId(cajeroId)
      );
    }

    return socketId;
  }

  /**
   * Notificar a todos los cajeros sobre nueva solicitud
   */
  async notificarCajerosNuevaSolicitud(transaccion, jugador) {
    const notificacion = {
      transaccionId: transaccion._id,
      jugador: {
        id: jugador._id,
        telegramId: jugador.telegramId,
        nombre: jugador.nickname || jugador.firstName || "Usuario",
      },
      monto: transaccion.monto,
      metodoPago: transaccion.infoPago.metodoPago,
      descripcion: transaccion.descripcion,
      timestamp: new Date().toISOString(),
    };

    // Usar rooms para notificar solo a cajeros disponibles
    this.socketManager.roomsManager.notificarCajerosDisponibles(
      "nueva-solicitud-deposito",
      notificacion
    );

    console.log(
      `📢 [DEPOSITO] Nueva solicitud notificada a cajeros disponibles`
    );
  }

  /**
   * Notificar al jugador que su solicitud fue aceptada
   */
  async notificarJugadorSolicitudAceptada(transaccion, cajero) {
    // Verificar si el jugador está conectado usando rooms
    const jugadorConectado =
      this.socketManager.roomsManager.rooms.jugadores.has(
        transaccion.telegramId
      );

    if (!jugadorConectado) {
      console.log(
        "⚠️ [DEPOSITO] Jugador no conectado para notificar aceptación"
      );
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
            numero: cajero.datosPagoMovil.cedula.numero,
          },
          telefono: cajero.datosPagoMovil.telefono,
        },
      },
      monto: transaccion.monto,
      timestamp: new Date().toISOString(),
    };

    // Agregar jugador al room de la transacción
    console.log(
      `🔍 [DEPOSITO] Buscando jugador en rooms: ${transaccion.telegramId}`
    );
    const jugadorSocketSet =
      this.socketManager.roomsManager.rooms.jugadores.get(
        transaccion.telegramId
      );
    const jugadorSocketId = jugadorSocketSet
      ? Array.from(jugadorSocketSet)[0]
      : null;
    console.log(
      `🔍 [DEPOSITO] Jugador socket ID encontrado: ${jugadorSocketId}`
    );

    if (jugadorSocketId) {
      console.log(
        `🔍 [DEPOSITO] Agregando jugador a room transaccion-${transaccion._id}`
      );
      this.socketManager.roomsManager.agregarParticipanteTransaccion(
        transaccion._id.toString(),
        jugadorSocketId
      );
    } else {
      console.error(
        `❌ [DEPOSITO] Jugador ${transaccion.telegramId} no encontrado en rooms`
      );
    }

    // Usar rooms para notificar al jugador
    this.socketManager.roomsManager.notificarJugador(
      transaccion.telegramId,
      "solicitud-aceptada",
      notificacion
    );
    console.log(
      `📢 [DEPOSITO] Datos bancarios enviados al jugador ${transaccion.telegramId}`
    );
  }

  /**
   * Notificar al cajero que debe verificar el pago
   */
  async notificarCajeroVerificarPago(transaccion) {
    // Extraer el ID del cajero (puede ser un objeto o un ID)
    let cajeroId = transaccion.cajeroId;
    if (typeof cajeroId === "object" && cajeroId._id) {
      cajeroId = cajeroId._id;
    }

    const cajeroSocketId = this.buscarCajeroConectado(cajeroId);

    if (!cajeroSocketId) {
      console.log(
        "⚠️ [DEPOSITO] Cajero no conectado para notificar verificación"
      );
      console.log(
        `🔍 [DEPOSITO] Buscando cajero con cajeroId: ${cajeroId} (tipo: ${typeof cajeroId})`
      );
      console.log(
        `🔍 [DEPOSITO] Cajeros conectados: ${Array.from(
          this.socketManager.connectedCajeros.keys()
        )}`
      );
      return;
    }

    // Obtener datos del jugador (puede ser un ID o un objeto poblado)
    let jugadorData;
    if (
      typeof transaccion.jugadorId === "object" &&
      transaccion.jugadorId._id
    ) {
      // Ya está poblado
      jugadorData = transaccion.jugadorId;
    } else {
      // Necesitamos obtener los datos del jugador
      const Jugador = require("../models/Jugador");
      jugadorData = await Jugador.findById(transaccion.jugadorId);
      if (!jugadorData) {
        console.log("⚠️ [DEPOSITO] Jugador no encontrado para notificación");
        return;
      }
    }

    const notificacion = {
      transaccionId: transaccion._id,
      jugador: {
        id: jugadorData._id,
        telegramId: jugadorData.telegramId,
        nombre: jugadorData.nickname || jugadorData.firstName || "Usuario",
      },
      monto: transaccion.monto,
      datosPago: transaccion.infoPago,
      timestamp: new Date().toISOString(),
    };

    this.io.to(cajeroSocketId).emit("verificar-pago", notificacion);
    console.log(
      `📢 [DEPOSITO] Solicitud de verificación enviada al cajero ${transaccion.cajeroId}`
    );
  }

  /**
   * Notificar al jugador que su depósito fue completado
   */
  async notificarJugadorDepositoCompletado(transaccion, saldoNuevo) {
    const jugadorSocketId = this.buscarJugadorConectado(transaccion.telegramId);

    if (!jugadorSocketId) {
      console.log(
        "⚠️ [DEPOSITO] Jugador no conectado para notificar completado"
      );
      return;
    }

    const notificacion = {
      transaccionId: transaccion._id,
      monto: transaccion.monto,
      saldoAnterior: transaccion.saldoAnterior,
      saldoNuevo: saldoNuevo,
      mensaje: "¡Depósito completado exitosamente! Gracias por tu confianza.",
      timestamp: new Date().toISOString(),
    };

    this.io.to(jugadorSocketId).emit("deposito-completado", notificacion);
    console.log(
      `📢 [DEPOSITO] Confirmación de depósito enviada al jugador ${transaccion.telegramId}`
    );
  }

  /**
   * Notificar al jugador que su depósito fue rechazado
   */
  async notificarJugadorDepositoRechazado(transaccion, motivo) {
    const jugadorSocketId = this.buscarJugadorConectado(transaccion.telegramId);

    if (!jugadorSocketId) {
      console.log("⚠️ [DEPOSITO] Jugador no conectado para notificar rechazo");
      return;
    }

    const notificacion = {
      transaccionId: transaccion._id,
      monto: transaccion.monto,
      motivo: motivo || "Pago no verificado",
      timestamp: new Date().toISOString(),
    };

    this.io.to(jugadorSocketId).emit("deposito-rechazado", notificacion);
    console.log(
      `📢 [DEPOSITO] Rechazo de depósito enviado al jugador ${transaccion.telegramId}`
    );
  }
}

module.exports = DepositoWebSocketController;
