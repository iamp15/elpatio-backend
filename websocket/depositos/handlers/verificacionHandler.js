/**
 * Handler para verificación de pago por cajero
 * Este es el método más complejo y largo del sistema
 */

const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const mongoose = require("mongoose");
const { registrarLog } = require("../../../utils/logHelper");
const {
  crearNotificacionInterna,
} = require("../../../controllers/notificacionesController");
const {
  notificarBotDepositoCompletado,
  notificarBotDepositoRechazado,
  notificarBotRetiroCompletado,
} = require("../notificaciones/notificacionesBot");
const { notificarTransaccionCompletada } = require("../notificaciones/notificacionesAdmin");
const { actualizarSaldoCajero } = require("../../../utils/saldoCajeroHelper");

/**
 * Manejar verificación de pago por cajero
 * Evento: 'verificar-pago-cajero'
 * @param {Object} context - Contexto con socketManager, io, roomsManager, processingTransactions
 * @param {Object} socket - Socket del cajero
 * @param {Object} data - Datos de la verificación
 */
// Set para rastrear requestIds ya procesados (evitar duplicados por reenvío)
const processedRequestIds = new Set();

// Limpiar requestIds antiguos cada 5 minutos
setInterval(() => {
  processedRequestIds.clear();
}, 5 * 60 * 1000);

async function verificarPagoCajero(context, socket, data) {
  const { transaccionId, accion, requestId } = data;

  console.log("🔍 [DEPOSITO] verificarPagoCajero INICIADO:", {
    transaccionId,
    accion,
    requestId,
    socketId: socket.id,
    timestamp: new Date().toISOString(),
  });

  // PROTECCIÓN 1: Verificar si este requestId ya fue procesado
  if (requestId && processedRequestIds.has(requestId)) {
    console.log(
      `⚠️ [DEPOSITO] DUPLICADO: requestId ${requestId} ya fue procesado, ignorando`
    );
    return;
  }

  // Marcar requestId como procesado
  if (requestId) {
    processedRequestIds.add(requestId);
  }

  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    const session = await mongoose.startSession();
    let transactionCommitted = false;

    try {
      console.log(
        "🔍 [DEPOSITO] Cajero verificando pago:",
        data,
        `(intento ${retryCount + 1})`
      );

      // Validar datos requeridos
      const { notas, motivo } = data;

      // PROTECCIÓN 2: Verificar si ya se está procesando esta transacción
      if (context.processingTransactions.has(transaccionId)) {
        console.log(
          `⚠️ [DEPOSITO] Transacción ${transaccionId} ya está siendo procesada`
        );
        socket.emit("error", {
          message: "La transacción ya está siendo procesada",
          transaccionId,
        });
        return;
      }

      // Marcar como procesando
      context.processingTransactions.add(transaccionId);

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

      // Verificar estado de la transacción según categoría
      // Para retiros: solo "en_proceso" (cajero aceptó y reporta que envió)
      // Para depósitos: "realizada" (usuario reportó pago) o "en_proceso" (ajuste de monto)
      const estadosPermitidos =
        transaccion.categoria === "retiro"
          ? ["en_proceso"]
          : ["realizada", "en_proceso"];
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
        // === RETIRO: lógica distinta (cajero envía dinero al jugador) ===
        if (transaccion.categoria === "retiro") {
          const { comprobanteUrl, numeroReferencia, bancoOrigen, notas } = data;

          transaccion.fechaConfirmacionCajero = new Date();
          transaccion.infoPago = {
            ...transaccion.infoPago,
            comprobanteUrl: comprobanteUrl || transaccion.infoPago?.comprobanteUrl,
            numeroReferencia: numeroReferencia || transaccion.infoPago?.numeroReferencia,
            bancoOrigen: bancoOrigen || transaccion.infoPago?.bancoOrigen,
            notasCajero: notas || "Transferencia enviada correctamente",
          };
          transaccion.cambiarEstado("confirmada");
          await transaccion.save({ session });

          const jugadorConSesion = await Jugador.findById(
            transaccion.jugadorId
          ).session(session);
          if (!jugadorConSesion) {
            throw new Error(`Jugador ${transaccion.jugadorId} no encontrado`);
          }
          const saldoNuevo = jugadorConSesion.saldo - transaccion.monto;

          await Jugador.findByIdAndUpdate(
            transaccion.jugadorId,
            { saldo: saldoNuevo },
            { session }
          );

          if (!transaccion.asignadoPorAdmin && transaccion.cajeroId) {
            await actualizarSaldoCajero(
              transaccion.cajeroId,
              -transaccion.monto,
              "retiro",
              transaccion._id,
              `Retiro de ${(transaccion.monto / 100).toFixed(2)} Bs procesado exitosamente`,
              session
            );
          }

          transaccion.cambiarEstado("completada");
          transaccion.saldoNuevo = saldoNuevo;
          transaccion.fechaProcesamiento = new Date();
          await transaccion.save({ session });

          await session.commitTransaction();
          transactionCommitted = true;

          // Notificar a admins del dashboard sobre transacción completada (tiempo real + persistente)
          if (context.roomsManager) {
            context.roomsManager.notificarAdmins("transaction-update", {
              transaccionId: transaccion._id,
              estado: transaccion.estado,
              categoria: transaccion.categoria,
              tipo: "transaccion-completada",
              monto: transaccion.monto,
              jugadorId: transaccion.jugadorId,
            });
          }
          if (jugadorConSesion) {
            await notificarTransaccionCompletada(transaccion, jugadorConSesion);
          }

          const notificacion = {
            transaccionId: transaccion._id,
            monto: transaccion.monto,
            saldoNuevo: saldoNuevo,
            saldoAnterior: transaccion.saldoAnterior,
            estado: transaccion.estado,
            comprobanteUrl: transaccion.infoPago?.comprobanteUrl,
            timestamp: new Date().toISOString(),
          };

          context.io
            .to(`transaccion-${transaccionId}`)
            .emit("retiro-completado", { ...notificacion, target: "cajero" });

          const jugadorSocketSet =
            context.socketManager.roomsManager.rooms.jugadores.get(
              transaccion.telegramId
            );
          const jugadorSocketId = jugadorSocketSet
            ? Array.from(jugadorSocketSet)[0]
            : null;

          if (jugadorSocketId) {
            context.io.to(jugadorSocketId).emit("retiro-completado", {
              ...notificacion,
              target: "jugador",
              mensaje: "¡Retiro completado exitosamente!",
              saldoAnterior: transaccion.saldoAnterior,
            });
          }

          const jugador = await Jugador.findById(transaccion.jugadorId);
          if (jugador) {
            await crearNotificacionInterna({
              destinatarioId: jugador._id,
              destinatarioTipo: "jugador",
              telegramId: jugador.telegramId,
              tipo: "retiro_aprobado",
              titulo: "Retiro Completado ✅",
              mensaje: `Tu retiro de ${(transaccion.monto / 100).toFixed(2)} Bs se completó correctamente.\n\nNuevo saldo: ${(saldoNuevo / 100).toFixed(2)} Bs`,
              datos: {
                transaccionId: transaccion._id.toString(),
                monto: transaccion.monto,
                saldoNuevo,
                comprobanteUrl: transaccion.infoPago?.comprobanteUrl,
              },
              eventoId: `retiro-completado-${transaccion._id}`,
            });

            await notificarBotRetiroCompletado(
              context,
              transaccion,
              jugador,
              saldoNuevo,
              transaccion.infoPago?.comprobanteUrl
            );
          }

          const websocketHelper = require("../../../utils/websocketHelper");
          websocketHelper.initialize(context.socketManager);
          await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);

          context.processingTransactions.delete(transaccionId);
          await registrarLog({
            accion: "Retiro completado via WebSocket",
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
          return;
        }

        // === DEPÓSITO: lógica original ===
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

        // Notificar a admins del dashboard sobre cambio de estado
        if (context.roomsManager) {
          context.roomsManager.notificarAdmins("transaction-update", {
            transaccionId: transaccion._id,
            estado: transaccion.estado,
            categoria: transaccion.categoria,
            tipo: "estado-cambiado",
            monto: transaccion.monto,
            jugadorId: transaccion.jugadorId,
          });
        }

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
        const jugador = jugadorConSesion;
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

        // No actualizar saldo del cajero cuando fue asignado por admin
        if (!transaccion.asignadoPorAdmin && transaccion.cajeroId) {
          console.log(
            `🔍 [DEPOSITO] [DEBUG] Actualizando saldo del cajero: ${transaccion.cajeroId}`
          );
          try {
            const resultadoSaldo = await actualizarSaldoCajero(
              transaccion.cajeroId,
              transaccion.monto, // Monto en centavos (positivo para depósito)
              "deposito",
              transaccion._id,
              `Depósito de ${(transaccion.monto / 100).toFixed(2)} Bs procesado exitosamente`,
              session
            );
            console.log(
              `✅ [DEPOSITO] [DEBUG] Saldo del cajero actualizado: ${resultadoSaldo.saldoAnterior} -> ${resultadoSaldo.saldoNuevo}`
            );
          } catch (error) {
            console.error(
              `❌ [DEPOSITO] [DEBUG] Error actualizando saldo del cajero:`,
              error
            );
            // No lanzar error para no interrumpir el flujo del depósito
            // El saldo del jugador ya se actualizó, así que continuamos
          }
        }

        // Completar transacción
        // Si hay ajuste de monto, usar estado "completada_con_ajuste", sino "completada"
        const estadoFinal =
          transaccion.ajusteMonto && transaccion.ajusteMonto.montoOriginal
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
        transactionCommitted = true;
        console.log(
          `🔍 [DEPOSITO] [DEBUG] Commit de transacción de BD exitoso`
        );

        console.log(
          `✅ [DEPOSITO] Depósito completado: ${transaccionId}, nuevo saldo: ${saldoNuevo}`
        );

        // Notificar a admins del dashboard sobre transacción completada (tiempo real + persistente)
        if (context.roomsManager) {
          context.roomsManager.notificarAdmins("transaction-update", {
            transaccionId: transaccion._id,
            estado: transaccion.estado,
            categoria: transaccion.categoria,
            tipo: "transaccion-completada",
            monto: transaccion.monto,
            jugadorId: transaccion.jugadorId,
          });
        }
        if (jugador) {
          await notificarTransaccionCompletada(transaccion, jugador);
        }

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
        context.io
          .to(`transaccion-${transaccionId}`)
          .emit("deposito-completado", {
            ...notificacion,
            target: "cajero", // Solo cajero procesa
          });

        // Verificar quién está en la room antes de enviar
        const room = context.io.sockets.adapter.rooms.get(
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
          context.socketManager.roomsManager.rooms.jugadores.get(
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
            context.socketManager.roomsManager.agregarParticipanteTransaccion(
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
          context.io
            .to(jugadorSocketId)
            .emit("deposito-completado", datosJugador);

          console.log(
            `✅ [DEPOSITO] Evento deposito-completado enviado al socket ${jugadorSocketId}`
          );
        } else {
          console.log(`📢 [DEPOSITO] Jugador no conectado`);
        }

        // Crear notificación persistente para el JUGADOR (jugador ya definido arriba)
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
          await notificarBotDepositoCompletado(
            context,
            transaccion,
            jugador,
            saldoNuevo
          );
        }

        // Limpiar room de transacción usando el método centralizado
        // Esto se hace después de notificar a todos los participantes
        const websocketHelper = require("../../../utils/websocketHelper");
        websocketHelper.initialize(context.socketManager);
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

        // Limpiar estado de procesamiento después de completar exitosamente
        context.processingTransactions.delete(transaccionId);
        console.log(
          `✅ [DEPOSITO] Transacción ${transaccionId} removida de processingTransactions después de completar`
        );

        // ¡IMPORTANTE! Salir del loop después de completar exitosamente
        return;
      } else {
        // Rechazar el pago - estructura simplificada
        const motivoRechazo = data.motivoRechazo || {};

        // Validar que haya descripción detallada (obligatoria)
        const descripcionDetallada =
          motivoRechazo.descripcionDetallada || motivo || null;

        if (!descripcionDetallada || descripcionDetallada.trim() === "") {
          throw new Error("La descripción del motivo de rechazo es obligatoria");
        }

        // Guardar información del rechazo
        transaccion.motivoRechazo = {
          descripcionDetallada: descripcionDetallada,
          imagenRechazoUrl: motivoRechazo.imagenRechazoUrl || null,
          fechaRechazo: new Date(),
        };

        transaccion.cambiarEstado("rechazada", descripcionDetallada);
        await transaccion.save({ session });

        await session.commitTransaction();
        transactionCommitted = true;

        // Notificar a admins del dashboard sobre cambio de estado
        if (context.roomsManager) {
          context.roomsManager.notificarAdmins("transaction-update", {
            transaccionId: transaccion._id,
            estado: transaccion.estado,
            categoria: transaccion.categoria,
            tipo: "estado-cambiado",
            monto: transaccion.monto,
            jugadorId: transaccion.jugadorId,
          });
        }

        console.log(`❌ [DEPOSITO] Depósito rechazado: ${transaccionId}`, {
          descripcionDetallada: transaccion.motivoRechazo.descripcionDetallada,
          tieneImagen: !!transaccion.motivoRechazo.imagenRechazoUrl,
        });

        // 2. USAR ROOMS PARA NOTIFICAR A TODOS LOS PARTICIPANTES
        const notificacion = {
          transaccionId: transaccion._id,
          motivo: transaccion.motivoRechazo.descripcionDetallada,
          imagenRechazoUrl: transaccion.motivoRechazo.imagenRechazoUrl || null,
          timestamp: new Date().toISOString(),
        };

        // Enviar a la room de la transacción (todos reciben)
        context.io
          .to(`transaccion-${transaccionId}`)
          .emit("deposito-rechazado", {
            ...notificacion,
            target: "cajero",
            monto: transaccion.monto, // Para mostrar en el popup del cajero
          });

        context.io
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
            // Mensaje simplificado
            let mensajePersonalizado = `Tu depósito de ${(
              transaccion.monto / 100
            ).toFixed(2)} Bs ha sido rechazado.\n\n`;

            mensajePersonalizado +=
              transaccion.motivoRechazo.descripcionDetallada;

            // Si hay imagen, mencionarla
            if (transaccion.motivoRechazo.imagenRechazoUrl) {
              mensajePersonalizado +=
                "\n\n📷 El cajero adjuntó una imagen como evidencia.";
            }

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
                imagenRechazoUrl:
                  transaccion.motivoRechazo.imagenRechazoUrl || null,
              },
              eventoId: `deposito-rechazado-${transaccion._id}`,
            });

            console.log(
              `✅ Notificación de depósito rechazado creada para jugador ${jugador.telegramId}`
            );

            // Crear y emitir notificación al bot sobre depósito rechazado
            await notificarBotDepositoRechazado(
              context,
              transaccion,
              jugador,
              transaccion.motivoRechazo.descripcionDetallada
            );
          }
        } catch (error) {
          console.error(
            "❌ [DEPOSITO] Error creando notificación de rechazo:",
            error
          );
        }

        // Limpiar room de transacción cuando finaliza
        const websocketHelper = require("../../../utils/websocketHelper");
        websocketHelper.initialize(context.socketManager);
        await websocketHelper.limpiarRoomTransaccionFinalizada(transaccion);

        // Limpiar estado de procesamiento después de rechazar
        context.processingTransactions.delete(transaccionId);
        console.log(
          `✅ [DEPOSITO] Transacción ${transaccionId} removida de processingTransactions después de rechazar`
        );

        // ¡IMPORTANTE! Salir del loop después de rechazar exitosamente
        return;
      }
    } catch (error) {
      console.error(
        "❌ [DEPOSITO] Error en verificarPagoCajero:",
        error.message
      );

      if (!transactionCommitted) {
        try {
          await session.abortTransaction();
        } catch (abortErr) {
          if (abortErr.message && !abortErr.message.includes("commitTransaction")) {
            console.error("❌ [DEPOSITO] Error en abortTransaction:", abortErr.message);
          }
        }
      }
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
      context.processingTransactions.delete(transaccionId);
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
  context.processingTransactions.delete(data.transaccionId);
  socket.emit("error", {
    message: "Error interno del servidor",
    details: "No se pudo procesar la verificación después de múltiples intentos",
  });
}

module.exports = {
  verificarPagoCajero,
};
