const Transaccion = require("../models/Transaccion");
const Jugador = require("../models/Jugador");
const Cajero = require("../models/Cajero");
const mongoose = require("mongoose");
const { registrarLog } = require("../utils/logHelper");
const {
  crearNotificacionInterna,
} = require("../controllers/notificacionesController");
const {
  crearNotificacionBot,
} = require("../controllers/notificacionesBotController");

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

      // AGREGAR JUGADOR AL ROOM DE LA TRANSACCIÓN INMEDIATAMENTE
      // Esto permite que el sistema de recovery detecte la transacción activa
      this.roomsManager.crearRoomTransaccion(transaccion._id, [
        { socketId: socket.id },
      ]);

      console.log(
        `📢 [DEPOSITO] Jugador agregado al room de transacción ${transaccion._id}`
      );

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

      // Crear y emitir notificación al bot para el jugador
      await this.notificarBotNuevoDeposito(transaccion, jugador);

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

      // Agregar cajero al room de la transacción (el room ya fue creado cuando el jugador hizo la solicitud)
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

      // Crear y emitir notificación al bot sobre aceptación de solicitud
      await this.notificarBotSolicitudAceptada(transaccion, cajero);

      // Crear notificación persistente para el cajero
      try {
        await crearNotificacionInterna({
          destinatarioId: cajeroId,
          destinatarioTipo: "cajero",
          tipo: "solicitud_asignada",
          titulo: "Solicitud asignada",
          mensaje: `Se te asignó la solicitud de ${
            transaccion.jugadorId.nickname ||
            transaccion.jugadorId.firstName ||
            "Usuario"
          } por ${(transaccion.monto / 100).toFixed(2)} Bs`,
          datos: {
            transaccionId: transaccion._id.toString(),
            monto: transaccion.monto,
            jugadorNombre:
              transaccion.jugadorId.nickname ||
              transaccion.jugadorId.firstName ||
              "Usuario",
          },
          eventoId: `asignada-${transaccion._id}-${cajeroId}`,
        });

        // Emitir evento de nueva notificación al cajero
        socket.emit("nuevaNotificacion", {
          tipo: "solicitud_asignada",
          titulo: "Solicitud asignada",
          mensaje: `Se te asignó la solicitud de ${
            transaccion.jugadorId.nickname ||
            transaccion.jugadorId.firstName ||
            "Usuario"
          } por ${(transaccion.monto / 100).toFixed(2)} Bs`,
          transaccionId: transaccion._id.toString(),
        });
      } catch (error) {
        console.error(
          "❌ Error creando notificación de asignación:",
          error.message
        );
      }

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

      // ASEGURAR QUE EL JUGADOR ESTÉ EN EL ROOM DE LA TRANSACCIÓN
      const jugadorSocketId =
        await this.socketManager.roomsManager.obtenerSocketJugador(
          transaccion.telegramId
        );

      if (jugadorSocketId) {
        // Verificar si ya está en el room
        const enRoom = await this.socketManager.roomsManager.jugadorEnRoom(
          transaccion.telegramId,
          `transaccion-${transaccionId}`
        );

        if (!enRoom) {
          console.log(
            `📢 [DEPOSITO] Jugador no estaba en room, agregándolo: ${transaccionId}`
          );
          this.socketManager.roomsManager.agregarParticipanteTransaccion(
            transaccionId,
            jugadorSocketId
          );
        }
      }

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

      // Crear y emitir notificación al bot sobre confirmación de pago
      await this.notificarBotPagoConfirmado(transaccion);

      // Crear notificación persistente para el cajero
      try {
        if (transaccion.cajeroId) {
          const cajeroId = transaccion.cajeroId._id || transaccion.cajeroId;
          await crearNotificacionInterna({
            destinatarioId: cajeroId,
            destinatarioTipo: "cajero",
            tipo: "pago_realizado",
            titulo: "Pago realizado",
            mensaje: `${
              transaccion.jugadorId.nickname ||
              transaccion.jugadorId.firstName ||
              "Usuario"
            } confirmó el pago de ${(transaccion.monto / 100).toFixed(2)} Bs`,
            datos: {
              transaccionId: transaccion._id.toString(),
              monto: transaccion.monto,
              jugadorNombre:
                transaccion.jugadorId.nickname ||
                transaccion.jugadorId.firstName ||
                "Usuario",
              referencia: transaccion.infoPago.numeroReferencia,
            },
            eventoId: `pago-${transaccion._id}`,
          });

          // Emitir evento de nueva notificación al cajero
          this.io.to(`transaccion-${transaccionId}`).emit("nuevaNotificacion", {
            tipo: "pago_realizado",
            titulo: "Pago realizado",
            mensaje: `${
              transaccion.jugadorId.nickname ||
              transaccion.jugadorId.firstName ||
              "Usuario"
            } confirmó el pago de ${(transaccion.monto / 100).toFixed(2)} Bs`,
            transaccionId: transaccion._id.toString(),
            target: "cajero",
          });
        }
      } catch (error) {
        console.error(
          "❌ Error creando notificación de pago realizado:",
          error.message
        );
      }

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

        // Verificar estado de la transacción
        // Regla original: debe estar "realizada" (usuario reportó pago).
        // Ajuste: permitir también "en_proceso" para casos donde el cajero valida y confirma
        // (p.ej., después de un ajuste de monto), para no bloquear la acreditación.
        const estadosPermitidos = ["realizada", "en_proceso"];
        if (!estadosPermitidos.includes(transaccion.estado)) {
          await session.abortTransaction();
          socket.emit("error", {
            message: `La transacción debe estar en estado "realizada" o "en_proceso". Estado actual: ${transaccion.estado}`,
          });
          return;
        }
        if (transaccion.estado === "en_proceso") {
          console.log(
            `ℹ️ [DEPOSITO] Verificación de cajero permitida desde estado en_proceso para ${transaccionId}`
          );
        }

        if (accion === "confirmar") {
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Entrando en acción confirmar para ${transaccionId}`
          );
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Estado actual de transacción: ${transaccion.estado}`
          );
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Monto de transacción: ${transaccion.monto}`
          );

          // Confirmar el pago
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Estableciendo fechaConfirmacionCajero y notasCajero`
          );
          transaccion.fechaConfirmacionCajero = new Date();
          transaccion.infoPago = {
            ...transaccion.infoPago,
            notasCajero: notas || "Pago verificado correctamente",
          };
          console.log(`🔍 [DEPOSITO] [DEBUG] Cambiando estado a "confirmada"`);
          transaccion.cambiarEstado("confirmada");
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Guardando transacción en estado "confirmada"`
          );
          await transaccion.save({ session });
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Transacción guardada en estado "confirmada" exitosamente`
          );

          // Procesar saldo del jugador
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Obteniendo jugador para procesar saldo: ${transaccion.jugadorId}`
          );
          const jugadorConSesion = await Jugador.findById(
            transaccion.jugadorId
          ).session(session);
          if (!jugadorConSesion) {
            throw new Error(`Jugador ${transaccion.jugadorId} no encontrado`);
          }
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Saldo actual del jugador: ${jugadorConSesion.saldo}`
          );
          const saldoNuevo = jugadorConSesion.saldo + transaccion.monto;
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Calculando nuevo saldo: ${jugadorConSesion.saldo} + ${transaccion.monto} = ${saldoNuevo}`
          );

          console.log(
            `🔍 [DEPOSITO] [DEBUG] Actualizando saldo del jugador en BD`
          );
          await Jugador.findByIdAndUpdate(
            transaccion.jugadorId,
            { saldo: saldoNuevo },
            { session }
          );
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Saldo del jugador actualizado exitosamente`
          );

          // Completar transacción
          // Si hay ajuste de monto, usar estado "completada_con_ajuste", sino "completada"
          const estadoFinal = transaccion.ajusteMonto && transaccion.ajusteMonto.montoOriginal
            ? "completada_con_ajuste"
            : "completada";
          console.log(`🔍 [DEPOSITO] [DEBUG] Cambiando estado a "${estadoFinal}"`);
          transaccion.cambiarEstado(estadoFinal);
          transaccion.saldoNuevo = saldoNuevo;
          transaccion.fechaProcesamiento = new Date();
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Guardando transacción en estado "${estadoFinal}"`
          );
          await transaccion.save({ session });
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Transacción guardada en estado "completada" exitosamente`
          );

          console.log(
            `🔍 [DEPOSITO] [DEBUG] Haciendo commit de la transacción de BD`
          );
          await session.commitTransaction();
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Commit de transacción de BD exitoso`
          );

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
              `📢 [DEPOSITO] Enviando deposito-completado directamente al jugador ${transaccion.telegramId}`
            );

            const datosJugador = {
              ...notificacion,
              target: "jugador",
              mensaje:
                "¡Depósito completado exitosamente! Gracias por tu confianza.",
              saldoAnterior: transaccion.saldoAnterior,
            };

            console.log(`📢 [DEPOSITO] Datos para jugador:`, datosJugador);

            // Emitir directamente al socket del jugador para garantizar entrega
            this.io
              .to(jugadorSocketId)
              .emit("deposito-completado", datosJugador);

            console.log(
              `✅ [DEPOSITO] Evento deposito-completado enviado al socket ${jugadorSocketId}`
            );
          } else {
            console.log(`📢 [DEPOSITO] Jugador no conectado`);
          }

          // Obtener datos del jugador (una sola vez)
          const jugador = await Jugador.findById(transaccion.jugadorId);

          // Crear notificación persistente para el JUGADOR
          try {
            if (jugador) {
              await crearNotificacionInterna({
                destinatarioId: jugador._id,
                destinatarioTipo: "jugador",
                telegramId: jugador.telegramId,
                tipo: "deposito_aprobado",
                titulo: "Depósito Aprobado ✅",
                mensaje: `Tu depósito de ${(transaccion.monto / 100).toFixed(
                  2
                )} Bs ha sido aprobado.\n\nNuevo saldo: ${(
                  saldoNuevo / 100
                ).toFixed(2)} Bs`,
                datos: {
                  transaccionId: transaccion._id.toString(),
                  monto: transaccion.monto,
                  saldoNuevo,
                },
                eventoId: `deposito-aprobado-${transaccion._id}`,
              });

              console.log(
                `✅ Notificación de depósito aprobado creada para jugador ${jugador.telegramId}`
              );
            }
          } catch (error) {
            console.error(
              "❌ Error creando notificación para jugador:",
              error.message
            );
          }

          // Crear y emitir notificación al bot sobre depósito completado
          if (jugador) {
            await this.notificarBotDepositoCompletado(
              transaccion,
              jugador,
              saldoNuevo
            );
          }

          // Limpiar room de transacción usando el método centralizado
          // Esto se hace después de notificar a todos los participantes
          const websocketHelper = require("../utils/websocketHelper");
          websocketHelper.initialize(this.socketManager);
          await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);

          // Crear notificación persistente para el cajero
          try {
            const cajeroId = socket.cajeroId;
            const jugadorNombre =
              jugador?.nickname || jugador?.firstName || "Usuario";

            await crearNotificacionInterna({
              destinatarioId: cajeroId,
              destinatarioTipo: "cajero",
              tipo: "transaccion_completada",
              titulo: "Transacción completada",
              mensaje: `Depósito de ${jugadorNombre} por ${(
                transaccion.monto / 100
              ).toFixed(2)} Bs completado exitosamente`,
              datos: {
                transaccionId: transaccion._id.toString(),
                monto: transaccion.monto,
                jugadorNombre,
                saldoNuevo,
              },
              eventoId: `completada-${transaccion._id}`,
            });

            // Emitir evento de nueva notificación al cajero
            socket.emit("nuevaNotificacion", {
              tipo: "transaccion_completada",
              titulo: "Transacción completada",
              mensaje: `Depósito de ${jugadorNombre} por ${(
                transaccion.monto / 100
              ).toFixed(2)} Bs completado exitosamente`,
              transaccionId: transaccion._id.toString(),
            });
          } catch (error) {
            console.error(
              "❌ Error creando notificación de transacción completada:",
              error.message
            );
          }

          // Registrar log
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Registrando log de depósito completado`
          );
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
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Log registrado exitosamente, finalizando flujo de confirmación`
          );
        } else {
          // Rechazar el pago - ahora con estructura mejorada
          const motivoRechazo = data.motivoRechazo || {};

          // Guardar información del rechazo
          transaccion.motivoRechazo = {
            categoria: motivoRechazo.categoria || "otro",
            descripcionDetallada:
              motivoRechazo.descripcionDetallada ||
              motivo ||
              "Pago no verificado",
            severidad: motivoRechazo.severidad || null,
            fechaRechazo: new Date(),
          };

          transaccion.cambiarEstado(
            "rechazada",
            motivoRechazo.descripcionDetallada || motivo || "Pago no verificado"
          );
          await transaccion.save({ session });

          await session.commitTransaction();

          console.log(`❌ [DEPOSITO] Depósito rechazado: ${transaccionId}`, {
            categoria: transaccion.motivoRechazo.categoria,
            severidad: transaccion.motivoRechazo.severidad,
          });

          // 2. USAR ROOMS PARA NOTIFICAR A TODOS LOS PARTICIPANTES
          const notificacion = {
            transaccionId: transaccion._id,
            motivo: transaccion.motivoRechazo.descripcionDetallada,
            categoria: transaccion.motivoRechazo.categoria,
            severidad: transaccion.motivoRechazo.severidad,
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

          // Crear notificación persistente para el JUGADOR
          try {
            const jugador = await Jugador.findById(transaccion.jugadorId);
            if (jugador) {
              // Personalizar mensaje según categoría
              let mensajePersonalizado = `Tu depósito de ${(
                transaccion.monto / 100
              ).toFixed(2)} Bs ha sido rechazado.\n\n`;

              switch (transaccion.motivoRechazo.categoria) {
                case "monto_insuficiente":
                  mensajePersonalizado +=
                    "El monto depositado es menor al mínimo permitido.\n\n";
                  break;
                case "datos_incorrectos":
                  const severidadTexto =
                    transaccion.motivoRechazo.severidad === "grave"
                      ? "Los datos no coinciden"
                      : "Hay un error en los datos";
                  mensajePersonalizado += `${severidadTexto}.\n\n`;
                  break;
                case "pago_no_recibido":
                  mensajePersonalizado +=
                    "El pago no fue recibido por el cajero.\n\n";
                  break;
              }

              mensajePersonalizado += `Motivo: ${transaccion.motivoRechazo.descripcionDetallada}`;

              await crearNotificacionInterna({
                destinatarioId: jugador._id,
                destinatarioTipo: "jugador",
                telegramId: jugador.telegramId,
                tipo: "deposito_rechazado",
                titulo: "Depósito Rechazado ❌",
                mensaje: mensajePersonalizado,
                datos: {
                  transaccionId: transaccion._id.toString(),
                  monto: transaccion.monto,
                  motivo: transaccion.motivoRechazo.descripcionDetallada,
                  categoria: transaccion.motivoRechazo.categoria,
                  severidad: transaccion.motivoRechazo.severidad,
                },
                eventoId: `deposito-rechazado-${transaccion._id}`,
              });

              console.log(
                `✅ Notificación de depósito rechazado creada para jugador ${jugador.telegramId}`
              );

              // Crear y emitir notificación al bot sobre depósito rechazado
              await this.notificarBotDepositoRechazado(
                transaccion,
                jugador,
                transaccion.motivoRechazo.descripcionDetallada
              );
            }
          } catch (error) {
            console.error(
              "❌ Error creando notificación para jugador:",
              error.message
            );
          }

          // Registrar log
          await registrarLog({
            accion: "Depósito rechazado via WebSocket",
            usuario: socket.cajeroId,
            rol: "cajero",
            detalle: {
              transaccionId: transaccion._id,
              jugadorId: transaccion.jugadorId,
              motivoRechazo: transaccion.motivoRechazo,
              socketId: socket.id,
            },
          });

          // Limpiar room de transacción usando el método centralizado
          const websocketHelper = require("../utils/websocketHelper");
          websocketHelper.initialize(this.socketManager);
          await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);
        }

        // Si llegamos aquí, la transacción fue exitosa
        console.log(
          `🔍 [DEPOSITO] [DEBUG] Transacción ${transaccionId} procesada exitosamente, limpiando processingTransactions`
        );
        this.processingTransactions.delete(transaccionId);
        console.log(`🔍 [DEPOSITO] [DEBUG] Cerrando sesión de BD`);
        await session.endSession();
        console.log(
          `🔍 [DEPOSITO] [DEBUG] Sesión de BD cerrada, saliendo del método verificarPagoCajero`
        );
        return; // Salir del bucle de reintentos
      } catch (error) {
        console.error(
          `❌ [DEPOSITO] [DEBUG] ERROR CAPTURADO en verificarPagoCajero para ${transaccionId}:`,
          error
        );
        console.error(
          `❌ [DEPOSITO] [DEBUG] Stack trace del error:`,
          error.stack
        );
        console.error(`❌ [DEPOSITO] [DEBUG] Código del error:`, error.code);
        console.error(
          `❌ [DEPOSITO] [DEBUG] Mensaje del error:`,
          error.message
        );

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

  /**
   * Referir transacción a administrador
   * Evento: 'referir-a-admin'
   */
  async referirAAdmin(socket, data) {
    const session = await mongoose.startSession();

    try {
      console.log("🔍 [DEPOSITO] Referir a admin:", data);

      const { transaccionId, motivo, descripcion } = data;

      // Validar datos requeridos
      if (!transaccionId) {
        socket.emit("error", {
          message: "ID de transacción requerido",
        });
        return;
      }

      // Validar que el socket esté autenticado como cajero
      if (!socket.userType || socket.userType !== "cajero") {
        socket.emit("error", {
          message: "Solo los cajeros pueden referir transacciones",
        });
        return;
      }

      // Verificar si ya se está procesando esta transacción
      if (this.processingTransactions.has(transaccionId)) {
        socket.emit("error", {
          message: "La transacción ya está siendo procesada",
        });
        return;
      }

      // Marcar como procesando
      this.processingTransactions.add(transaccionId);

      await session.startTransaction();

      // Buscar la transacción
      const transaccion = await Transaccion.findById(transaccionId).session(
        session
      );

      if (!transaccion) {
        await session.abortTransaction();
        this.processingTransactions.delete(transaccionId);
        socket.emit("error", {
          message: "Transacción no encontrada",
        });
        return;
      }

      // Verificar que la transacción esté en estado "realizada"
      if (transaccion.estado !== "realizada") {
        await session.abortTransaction();
        this.processingTransactions.delete(transaccionId);
        socket.emit("error", {
          message: `La transacción debe estar en estado "realizada". Estado actual: ${transaccion.estado}`,
        });
        return;
      }

      // Cambiar estado a requiere_revision_admin
      transaccion.cambiarEstado("requiere_revision_admin");

      // Guardar información del motivo
      transaccion.motivoRechazo = {
        categoria: "pago_no_recibido",
        descripcionDetallada:
          descripcion || motivo || "Requiere revisión administrativa",
        fechaRechazo: new Date(),
      };

      await transaccion.save({ session });
      await session.commitTransaction();

      console.log(
        `⚠️ [DEPOSITO] Transacción ${transaccionId} referida a admin`
      );

      // Notificar al cajero
      socket.emit("transaccion-referida-admin", {
        transaccionId: transaccion._id,
        mensaje: "La transacción ha sido referida a un administrador",
        timestamp: new Date().toISOString(),
      });

      // Notificar al jugador
      this.io
        .to(`transaccion-${transaccionId}`)
        .emit("transaccion-en-revision", {
          transaccionId: transaccion._id,
          mensaje:
            "Tu transacción está siendo revisada por un administrador. Te contactaremos pronto.",
          timestamp: new Date().toISOString(),
        });

      // Crear notificación para el jugador
      try {
        const jugador = await Jugador.findById(transaccion.jugadorId);
        if (jugador) {
          await crearNotificacionInterna({
            destinatarioId: jugador._id,
            destinatarioTipo: "jugador",
            telegramId: jugador.telegramId,
            tipo: "transaccion_en_revision",
            titulo: "Transacción en Revisión ⏳",
            mensaje: `Tu depósito de ${(transaccion.monto / 100).toFixed(
              2
            )} Bs está siendo revisado por un administrador. Te contactaremos pronto para resolver cualquier inconveniente.`,
            datos: {
              transaccionId: transaccion._id.toString(),
              monto: transaccion.monto,
            },
            eventoId: `transaccion-revision-${transaccion._id}`,
          });
        }
      } catch (error) {
        console.error(
          "❌ Error creando notificación para jugador:",
          error.message
        );
      }

      // Registrar log
      await registrarLog({
        accion: "Transacción referida a administrador",
        usuario: socket.cajeroId,
        rol: "cajero",
        detalle: {
          transaccionId: transaccion._id,
          jugadorId: transaccion.jugadorId,
          motivo: descripcion || motivo,
          socketId: socket.id,
        },
      });

      // Limpiar room de transacción cuando finaliza (requiere_revision_admin es estado final)
      const websocketHelper = require("../utils/websocketHelper");
      websocketHelper.initialize(this.socketManager);
      await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);

      this.processingTransactions.delete(transaccionId);
      await session.endSession();
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      console.error("❌ [DEPOSITO] Error en referirAAdmin:", error);
      this.processingTransactions.delete(data.transaccionId);
      socket.emit("error", {
        message: "Error interno del servidor",
        details: error.message,
      });
    }
  }

  /**
   * Ajustar monto de depósito
   * Evento: 'ajustar-monto-deposito'
   */
  async ajustarMontoDeposito(socket, data) {
    const session = await mongoose.startSession();

    try {
      console.log("💰 [DEPOSITO] Ajustar monto:", data);

      const { transaccionId, montoReal, razon } = data;

      // Validar datos requeridos
      if (!transaccionId || !montoReal) {
        socket.emit("error", {
          message: "ID de transacción y monto real requeridos",
        });
        return;
      }

      // Validar que el socket esté autenticado como cajero
      if (!socket.userType || socket.userType !== "cajero") {
        socket.emit("error", {
          message: "Solo los cajeros pueden ajustar montos",
        });
        return;
      }

      // Verificar si ya se está procesando esta transacción
      if (this.processingTransactions.has(transaccionId)) {
        socket.emit("error", {
          message: "La transacción ya está siendo procesada",
        });
        return;
      }

      // Marcar como procesando
      this.processingTransactions.add(transaccionId);

      await session.startTransaction();

      // Buscar la transacción
      const transaccion = await Transaccion.findById(transaccionId).session(
        session
      );

      if (!transaccion) {
        await session.abortTransaction();
        this.processingTransactions.delete(transaccionId);
        socket.emit("error", {
          message: "Transacción no encontrada",
        });
        return;
      }

      // Verificar que la transacción esté en estado "realizada"
      if (transaccion.estado !== "realizada") {
        await session.abortTransaction();
        this.processingTransactions.delete(transaccionId);
        socket.emit("error", {
          message: `La transacción debe estar en estado "realizada". Estado actual: ${transaccion.estado}`,
        });
        return;
      }

      // Obtener configuración de monto mínimo
      const ConfiguracionSistema = require("../models/ConfiguracionSistema");
      const montoMinimoBs =
        (await ConfiguracionSistema.obtenerValor("deposito_monto_minimo")) ||
        10;

      // Convertir monto mínimo de bolívares a centavos para comparar con montoReal
      const montoMinimoCentavos = montoMinimoBs * 100;

      console.log(
        `💰 [DEPOSITO] Validando monto ajustado: montoReal=${montoReal} centavos (${(
          montoReal / 100
        ).toFixed(
          2
        )} Bs), montoMinimo=${montoMinimoCentavos} centavos (${montoMinimoBs} Bs)`
      );

      // Validar que el monto real sea mayor o igual al mínimo
      if (montoReal < montoMinimoCentavos) {
        console.log(
          `❌ [DEPOSITO] Monto ajustado rechazado: ${montoReal} centavos < ${montoMinimoCentavos} centavos (mínimo)`
        );
        await session.abortTransaction();
        this.processingTransactions.delete(transaccionId);
        socket.emit("error", {
          message: `El monto real debe ser mayor o igual al mínimo (${montoMinimoBs} Bs)`,
          montoMinimo: montoMinimoBs,
        });
        return;
      }

      console.log(
        `✅ [DEPOSITO] Monto ajustado válido: ${montoReal} centavos >= ${montoMinimoCentavos} centavos (mínimo)`
      );

      // Guardar información del ajuste
      transaccion.ajusteMonto = {
        montoOriginal: transaccion.monto,
        montoReal: montoReal,
        razon: razon || "Ajuste de monto por discrepancia",
        fechaAjuste: new Date(),
        ajustadoPor: socket.cajeroId,
      };

      // Actualizar el monto de la transacción
      const montoOriginal = transaccion.monto;
      transaccion.monto = montoReal;

      await transaccion.save({ session });

      console.log(
        `✅ [DEPOSITO] Monto ajustado para ${transaccionId}: ${montoOriginal} -> ${montoReal}`
      );

      // Notificar al cajero que puede continuar con la confirmación
      const datosAjuste = {
        transaccionId: transaccion._id.toString(), // Convertir ObjectId a string
        montoOriginal,
        montoReal,
        razon: razon || "Ajuste de monto por discrepancia",
        mensaje: "Monto ajustado exitosamente. Ahora puedes confirmar el pago.",
        timestamp: new Date().toISOString(),
      };
      console.log(
        `💰 [DEPOSITO] Enviando evento monto-ajustado al cajero ${socket.cajeroId} (socket ${socket.id}):`,
        datosAjuste
      );
      console.log(
        `💰 [DEPOSITO] Socket conectado: ${socket.connected}, Socket ID: ${socket.id}`
      );
      socket.emit("monto-ajustado", datosAjuste);
      console.log(
        `💰 [DEPOSITO] Evento monto-ajustado enviado al cajero ${socket.cajeroId}`
      );

      // Notificar al jugador sobre el ajuste de monto
      await this.notificarJugadorAjusteMonto(
        transaccion,
        montoOriginal,
        montoReal,
        razon
      );

      // Registrar log
      await registrarLog({
        accion: "Monto de depósito ajustado",
        usuario: socket.cajeroId,
        rol: "cajero",
        detalle: {
          transaccionId: transaccion._id,
          jugadorId: transaccion.jugadorId,
          montoOriginal,
          montoReal,
          razon,
          socketId: socket.id,
        },
      });

      await session.commitTransaction();
      this.processingTransactions.delete(transaccionId);
      await session.endSession();
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      console.error("❌ [DEPOSITO] Error en ajustarMontoDeposito:", error);
      this.processingTransactions.delete(data.transaccionId);
      socket.emit("error", {
        message: "Error interno del servidor",
        details: error.message,
      });
    }
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

    // Crear notificaciones persistentes para todos los cajeros conectados
    try {
      const cajerosConectados = Array.from(
        this.socketManager.connectedCajeros.keys()
      );

      console.log(
        `🔍 [NOTIFICACIONES] Cajeros conectados: ${cajerosConectados.length}`
      );

      for (const cajeroId of cajerosConectados) {
        await crearNotificacionInterna({
          destinatarioId: cajeroId,
          destinatarioTipo: "cajero",
          tipo: "nueva_solicitud",
          titulo: "Nueva solicitud de depósito",
          mensaje: `${notificacion.jugador.nombre} solicita depositar ${(
            transaccion.monto / 100
          ).toFixed(2)} Bs`,
          datos: {
            transaccionId: transaccion._id.toString(),
            monto: transaccion.monto,
            jugadorNombre: notificacion.jugador.nombre,
            metodoPago: notificacion.metodoPago,
          },
          eventoId: `solicitud-${transaccion._id}`,
        });

        // Emitir evento de nueva notificación al cajero específico
        const socketId = this.socketManager.connectedCajeros.get(cajeroId);
        if (socketId) {
          const socket = this.socketManager.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit("nuevaNotificacion", {
              tipo: "nueva_solicitud",
              titulo: "Nueva solicitud de depósito",
              mensaje: `${notificacion.jugador.nombre} solicita depositar ${(
                transaccion.monto / 100
              ).toFixed(2)} Bs`,
              transaccionId: transaccion._id.toString(),
            });
          }
        }
      }

      console.log(
        `✅ [NOTIFICACIONES] Creadas ${cajerosConectados.length} notificaciones de nueva solicitud`
      );
    } catch (error) {
      console.error(
        "❌ Error creando notificaciones persistentes:",
        error.message
      );
    }
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
   * Notificar al jugador sobre el ajuste de monto
   */
  async notificarJugadorAjusteMonto(
    transaccion,
    montoOriginal,
    montoReal,
    razon
  ) {
    // Verificar si el jugador está conectado usando rooms
    const jugadorConectado =
      this.socketManager.roomsManager.rooms.jugadores.has(
        transaccion.telegramId
      );

    if (!jugadorConectado) {
      console.log(
        "⚠️ [DEPOSITO] Jugador no conectado para notificar ajuste de monto"
      );
      return;
    }

    const notificacion = {
      transaccionId: transaccion._id,
      montoOriginal,
      montoReal,
      razon: razon || "Ajuste de monto por discrepancia",
      timestamp: new Date().toISOString(),
    };

    // Agregar jugador al room de la transacción si no está
    const jugadorSocketSet =
      this.socketManager.roomsManager.rooms.jugadores.get(
        transaccion.telegramId
      );
    const jugadorSocketId = jugadorSocketSet
      ? Array.from(jugadorSocketSet)[0]
      : null;

    if (jugadorSocketId) {
      this.socketManager.roomsManager.agregarParticipanteTransaccion(
        transaccion._id.toString(),
        jugadorSocketId
      );
    }

    // Enviar notificación usando rooms
    this.socketManager.roomsManager.notificarJugador(
      transaccion.telegramId,
      "monto-ajustado",
      notificacion
    );

    // También enviar directamente a la room de la transacción
    this.io.to(`transaccion-${transaccion._id}`).emit("monto-ajustado", {
      ...notificacion,
      target: "jugador",
    });

    console.log(
      `📢 [DEPOSITO] Notificación de ajuste de monto enviada al jugador ${transaccion.telegramId}`
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

  /**
   * Notificar al bot sobre solicitud aceptada
   */
  async notificarBotSolicitudAceptada(transaccion, cajero) {
    try {
      const jugador = await Jugador.findById(transaccion.jugadorId);
      if (!jugador) {
        console.error("❌ [BOT] Jugador no encontrado para notificación");
        return;
      }

      // Verificar si el jugador tiene la app de depósitos abierta
      const tieneAppAbierta = this.socketManager.connectedPlayers.has(
        jugador.telegramId
      );

      if (tieneAppAbierta) {
        console.log(
          `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app de depósitos abierta, no enviar notificación a Telegram`
        );
        return; // No enviar notificación a Telegram si tiene la app abierta
      }

      const notificacion = await crearNotificacionBot({
        transaccionId: transaccion._id,
        jugadorTelegramId: jugador.telegramId,
        tipo: "deposito_aceptado",
        titulo: "Solicitud de depósito aceptada",
        mensaje: `El cajero ${
          cajero.nombreCompleto
        } aceptó tu solicitud de depósito por ${(
          transaccion.monto / 100
        ).toFixed(
          2
        )} Bs. Para continuar abre la app de depositos y haz el pago.`,
        datos: {
          monto: transaccion.monto,
          cajeroNombre: cajero.nombreCompleto,
          referencia: transaccion.referencia,
        },
        eventoId: `deposito-aceptado-${transaccion._id}`,
      });

      if (!notificacion) return;

      if (this.socketManager.connectedBots.size > 0) {
        this.io.emit("bot-notificacion", {
          notificacionId: notificacion._id.toString(),
          tipo: notificacion.tipo,
          titulo: notificacion.titulo,
          mensaje: notificacion.mensaje,
          jugadorTelegramId: notificacion.jugadorTelegramId,
          datos: notificacion.datos,
        });
      }
    } catch (error) {
      console.error("❌ [BOT] Error notificando aceptación:", error.message);
    }
  }

  /**
   * Notificar al bot sobre pago confirmado
   */
  async notificarBotPagoConfirmado(transaccion) {
    try {
      const jugador = await Jugador.findById(transaccion.jugadorId);
      if (!jugador) {
        console.error("❌ [BOT] Jugador no encontrado para notificación");
        return;
      }

      // Verificar si el jugador tiene la app de depósitos abierta
      const tieneAppAbierta = this.socketManager.connectedPlayers.has(
        jugador.telegramId
      );

      if (tieneAppAbierta) {
        console.log(
          `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app de depósitos abierta, no enviar notificación a Telegram`
        );
        return; // No enviar notificación a Telegram si tiene la app abierta
      }

      const notificacion = await crearNotificacionBot({
        transaccionId: transaccion._id,
        jugadorTelegramId: jugador.telegramId,
        tipo: "pago_confirmado",
        titulo: "Pago confirmado",
        mensaje: `Los datos de tu pago con referencia ${transaccion.infoPago.numeroReferencia} se enviaron al cajero. Te notificaremos cuando tu deposito se haya completado.`,
        datos: {
          monto: transaccion.monto,
          referencia: transaccion.infoPago.numeroReferencia,
        },
        eventoId: `pago-confirmado-${transaccion._id}`,
      });

      if (!notificacion) return;

      if (this.socketManager.connectedBots.size > 0) {
        this.io.emit("bot-notificacion", {
          notificacionId: notificacion._id.toString(),
          tipo: notificacion.tipo,
          titulo: notificacion.titulo,
          mensaje: notificacion.mensaje,
          jugadorTelegramId: notificacion.jugadorTelegramId,
          datos: notificacion.datos,
        });
      }
    } catch (error) {
      console.error(
        "❌ [BOT] Error notificando pago confirmado:",
        error.message
      );
    }
  }

  /**
   * Notificar al bot sobre depósito completado
   */
  async notificarBotDepositoCompletado(transaccion, jugador, saldoNuevo) {
    try {
      // Verificar si el jugador tiene la app de depósitos abierta
      const tieneAppAbierta = this.socketManager.connectedPlayers.has(
        jugador.telegramId
      );

      if (tieneAppAbierta) {
        console.log(
          `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app de depósitos abierta, no enviar notificación a Telegram`
        );
        return; // No enviar notificación a Telegram si tiene la app abierta
      }

      // Verificar si hay ajuste de monto
      let mensaje;
      if (transaccion.ajusteMonto && transaccion.ajusteMonto.montoOriginal) {
        const montoOriginal = (transaccion.ajusteMonto.montoOriginal / 100).toFixed(2);
        const montoAcreditado = (transaccion.monto / 100).toFixed(2);
        const saldo = (saldoNuevo / 100).toFixed(2);
        const razon = transaccion.ajusteMonto.razon;
        
        mensaje = `Tu depósito se completó con un ajuste de monto.\n\n💰 Monto reportado: ${montoOriginal} Bs\n💰 Monto acreditado: ${montoAcreditado} Bs`;
        
        if (razon) {
          mensaje += `\n📌 Motivo: ${razon}`;
        }
        
        mensaje += `\n\nNuevo saldo: ${saldo} Bs\n\nSi crees que hay un error, ponte en contacto con un Admin.`;
      } else {
        // Mensaje sin ajuste (actual)
        mensaje = `Tu depósito por ${(transaccion.monto / 100).toFixed(2)} Bs se completó correctamente\n\nNuevo saldo: ${(saldoNuevo / 100).toFixed(2)} Bs`;
      }

      const notificacion = await crearNotificacionBot({
        transaccionId: transaccion._id,
        jugadorTelegramId: jugador.telegramId,
        tipo: "deposito_completado",
        titulo: "Depósito completado",
        mensaje: mensaje,
        datos: {
          monto: transaccion.monto,
          saldoNuevo,
        },
        eventoId: `deposito-completado-${transaccion._id}`,
      });

      if (!notificacion) return;

      if (this.socketManager.connectedBots.size > 0) {
        this.io.emit("bot-notificacion", {
          notificacionId: notificacion._id.toString(),
          tipo: notificacion.tipo,
          titulo: notificacion.titulo,
          mensaje: notificacion.mensaje,
          jugadorTelegramId: notificacion.jugadorTelegramId,
          datos: notificacion.datos,
        });
      }
    } catch (error) {
      console.error(
        "❌ [BOT] Error notificando depósito completado:",
        error.message
      );
    }
  }

  /**
   * Notificar al bot sobre depósito rechazado
   */
  async notificarBotDepositoRechazado(transaccion, jugador, motivo) {
    try {
      // Verificar si el jugador tiene la app de depósitos abierta
      const tieneAppAbierta = this.socketManager.connectedPlayers.has(
        jugador.telegramId
      );

      if (tieneAppAbierta) {
        console.log(
          `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app de depósitos abierta, no enviar notificación a Telegram`
        );
        return; // No enviar notificación a Telegram si tiene la app abierta
      }

      const notificacion = await crearNotificacionBot({
        transaccionId: transaccion._id,
        jugadorTelegramId: jugador.telegramId,
        tipo: "deposito_rechazado",
        titulo: "Depósito rechazado",
        mensaje: `Tu solicitud de depósito por ${(
          transaccion.monto / 100
        ).toFixed(2)} Bs fue rechazada por el cajero\n\nMotivo: ${
          motivo || "No especificado"
        }`,
        datos: {
          monto: transaccion.monto,
          motivo,
        },
        eventoId: `deposito-rechazado-${transaccion._id}`,
      });

      if (!notificacion) return;

      if (this.socketManager.connectedBots.size > 0) {
        this.io.emit("bot-notificacion", {
          notificacionId: notificacion._id.toString(),
          tipo: notificacion.tipo,
          titulo: notificacion.titulo,
          mensaje: notificacion.mensaje,
          jugadorTelegramId: notificacion.jugadorTelegramId,
          datos: notificacion.datos,
        });
      }
    } catch (error) {
      console.error(
        "❌ [BOT] Error notificando depósito rechazado:",
        error.message
      );
    }
  }

  /**
   * Notificar al bot sobre nuevo depósito
   */
  async notificarBotNuevoDeposito(transaccion, jugador) {
    try {
      // Verificar si el jugador tiene la app de depósitos abierta
      const tieneAppAbierta = this.socketManager.connectedPlayers.has(
        jugador.telegramId
      );

      if (tieneAppAbierta) {
        console.log(
          `ℹ️ [BOT] Jugador ${jugador.telegramId} tiene la app de depósitos abierta, no enviar notificación a Telegram`
        );
        return; // No enviar notificación a Telegram si tiene la app abierta
      }

      // Crear notificación persistente
      const notificacion = await crearNotificacionBot({
        transaccionId: transaccion._id,
        jugadorTelegramId: jugador.telegramId,
        tipo: "deposito_creado",
        titulo: "Solicitud de depósito creada",
        mensaje: `Has solicitado hacer un depósito por ${(
          transaccion.monto / 100
        ).toFixed(2)} Bs`,
        datos: {
          monto: transaccion.monto,
          referencia: transaccion.referencia,
        },
        eventoId: `deposito-creado-${transaccion._id}`,
      });

      if (!notificacion) {
        console.log(
          "⚠️ [BOT] Notificación duplicada o no creada para nuevo depósito"
        );
        return;
      }

      // Si hay bot conectado, emitir evento WebSocket
      if (this.socketManager.connectedBots.size > 0) {
        this.io.emit("bot-notificacion", {
          notificacionId: notificacion._id.toString(),
          tipo: notificacion.tipo,
          titulo: notificacion.titulo,
          mensaje: notificacion.mensaje,
          jugadorTelegramId: notificacion.jugadorTelegramId,
          datos: notificacion.datos,
        });
        console.log(`📬 [BOT] Notificación enviada vía WebSocket al bot`);
      } else {
        console.log(
          "⚠️ [BOT] No hay bot conectado, la notificación quedará pendiente para polling"
        );
      }
    } catch (error) {
      console.error(
        "❌ [BOT] Error creando/emitiendo notificación de nuevo depósito:",
        error.message
      );
    }
  }
}

module.exports = DepositoWebSocketController;
