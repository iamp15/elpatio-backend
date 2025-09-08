const Sala = require("../models/Sala");
const Jugador = require("../models/Jugador");
const { registrarLog } = require("../utils/logHelper");
const mongoose = require("mongoose");
const transaccionesController = require("./transaccionController");
const Transaccion = require("../models/Transaccion");

// Crear nueva sala
exports.crearSala = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { modo, configuracion, nombre, juego, jugadorCreador } = req.body;

    // Validar que se proporcione el jugador creador
    if (!jugadorCreador) {
      return res.status(400).json({
        mensaje: "Se requiere el ID del jugador creador",
      });
    }

    //Iniciar transacción
    await session.startTransaction();

    // Verificar que el jugador existe
    const jugador = await Jugador.findById(jugadorCreador);
    if (!jugador) {
      return res.status(404).json({
        mensaje: "Jugador creador no encontrado",
      });
    }

    //Verificar que el jugador no esté jugando
    if (jugador.jugando === true) {
      return res.status(400).json({
        success: false,
        mensaje:
          "No puedes crear una sala mientras estás jugando. Termina tu partida actual primero.",
      });
    }

    //Verificar que no esté en una sala del mismo modo
    const salasDelMismoModo = await Sala.find({
      jugadores: jugadorCreador,
      modo,
      estado: { $nin: ["finalizada", "cancelada"] },
    });

    if (salasDelMismoModo.length > 0) {
      return res.status(400).json({
        mensaje: `Ya estás participando en una sala de modo ${modo}`,
      });
    }

    //Verificar que no esté en mas de dos salas activas
    const salasCreadasActivas = await Sala.find({
      creador: jugadorCreador,
      estado: { $nin: ["finalizada", "cancelada"] },
    });

    if (salasCreadasActivas.length >= 2) {
      return res.status(400).json({
        mensaje:
          "Ya tienes 2 salas creadas. Debes cancelar una antes de crear otra.",
      });
    }

    // Verificar limite global por modo de juego
    const numeroSalasPorModo = await Sala.countDocuments({
      juego: juego,
      modo: modo,
      estado: "esperando", // Solo las que están esperando jugadores
    });

    if (numeroSalasPorModo >= 5) {
      return res.status(400).json({
        mensaje: `Ya hay 5 salas de ${juego} modo ${modo} esperando jugadores. No se pueden crear más salas de este tipo.`,
      });
    }

    // Verificar saldo suficiente para la entrada
    const montoEntrada = configuracion.entrada || 0;
    if (montoEntrada > 0 && jugador.saldo < montoEntrada) {
      await session.abortTransaction();
      return res.status(400).json({
        mensaje: "Saldo insuficiente para crear la sala",
        saldoActual: jugador.saldo,
        montoRequerido: montoEntrada,
      });
    }

    //Crear la sala
    const nuevaSala = new Sala({
      modo,
      configuracion,
      nombre,
      juego,
      creador: jugadorCreador,
      jugadores: [jugadorCreador],
    });

    await nuevaSala.save({ session });

    // Aplicar cobro de entrada si aplica
    if (montoEntrada > 0) {
      console.log(
        `🔍 [CREARSALA] Aplicando cobro de entrada: ${montoEntrada} al jugador ${jugadorCreador}`
      );

      // Calcular nuevo saldo
      const saldoAnterior = jugador.saldo || 0;
      const nuevoSaldo = saldoAnterior - montoEntrada;

      // Generar referencia única para la transacción
      const referencia = await Transaccion.generarReferencia(
        "entrada_sala",
        jugadorCreador
      );

      // Crear la transacción de débito
      const transaccionEntrada = new Transaccion({
        jugadorId: jugadorCreador,
        telegramId: jugador.telegramId,
        tipo: "debito",
        categoria: "entrada_sala",
        monto: montoEntrada,
        descripcion: `Entrada a sala "${nombre}" (${juego} - ${modo})`,
        referencia,
        saldoAnterior: saldoAnterior,
        saldoNuevo: nuevoSaldo,
        estado: "completada",
        referenciaExterna: {
          salaId: nuevaSala._id,
          tipoOperacion: "creacion_sala",
        },
        metadata: {
          procesadoPor: "sistema",
          tipoOperacion: "creacion_sala",
          salaId: nuevaSala._id,
          salaNombre: nombre,
          juego: juego,
          modo: modo,
        },
        creadoPor: req.user?._id || null,
      });

      await transaccionEntrada.save({ session });

      // Actualizar saldo del jugador
      await Jugador.findByIdAndUpdate(
        jugadorCreador,
        { saldo: nuevoSaldo },
        { session }
      );

      console.log(`✅ [CREARSALA] Cobro de entrada aplicado exitosamente`);
    }

    // Registrar log ANTES de la respuesta
    await registrarLog({
      accion: "Sala creada",
      usuario: jugadorCreador,
      rol: req.user?.rol || "sistema",
      detalle: {
        salaId: nuevaSala._id,
        nombre: nuevaSala.nombre,
        juego: nuevaSala.juego,
        modo: nuevaSala.modo,
        entrada: nuevaSala.configuracion.entrada,
        premio: nuevaSala.configuracion.premio,
        cobroAplicado: montoEntrada > 0,
        montoCobrado: montoEntrada,
      },
    });

    // Confirmar la transacción
    await session.commitTransaction();

    // Respuesta exitosa
    res.status(201).json({
      mensaje: "Sala creada exitosamente",
      sala: nuevaSala,
      cobroAplicado: montoEntrada > 0,
      montoCobrado: montoEntrada,
      saldoAnterior: montoEntrada > 0 ? jugador.saldo : null,
      saldoNuevo: montoEntrada > 0 ? jugador.saldo - montoEntrada : null,
    });
  } catch (error) {
    console.error("Error al crear la sala:", error);

    // Abortar transacción en caso de error
    await session.abortTransaction();

    res.status(500).json({
      mensaje: "Error al crear la sala",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
};

//Obtener una sala por ID
exports.obtenerSalaPorId = async (req, res) => {
  try {
    const { salaId } = req.params;
    const sala = await Sala.findById(salaId);
    if (!sala) {
      return res.status(404).json({ mensaje: "Sala no encontrada" });
    }
    res.json(sala);
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al obtener la sala",
      error: error.message,
    });
  }
};

// Obtener salas disponibles (para mostrar al jugador)
exports.obtenerSalasDisponibles = async (req, res) => {
  try {
    const salas = await Sala.find({
      estado: "esperando",
    });

    res.json(salas);
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al obtener las salas disponibles",
      error: error.message,
    });
  }
};

// Unirse a una sala
exports.unirseASala = async (req, res) => {
  try {
    const { salaId } = req.params;
    const { jugadorId } = req.body;

    const salaActual = await Sala.findById(salaId);
    if (!salaActual) {
      return res.status(404).json({ mensaje: "Sala no encontrada" });
    }

    if (salaActual.estado !== "esperando") {
      return res.status(400).json({ mensaje: "La sala no está disponible" });
    }

    // Verificar que el jugador existe
    const jugador = await Jugador.findById(jugadorId);
    if (!jugador) {
      return res.status(404).json({ mensaje: "Jugador no encontrado" });
    }

    // Verificar que el jugador no esté jugando
    if (jugador.jugando === true) {
      return res.status(400).json({
        success: false,
        mensaje:
          "No puedes unirte a una sala mientras estás jugando. Termina tu partida actual primero.",
      });
    }

    // Verificar que el jugador no esté ya en la sala
    if (salaActual.jugadores.includes(jugadorId)) {
      return res.status(400).json({ mensaje: "Ya estás en la sala" });
    }

    // Verificar que el jugador no esté en otra sala del mismo modo
    const salasDelMismoModo = await Sala.find({
      jugadores: jugadorId,
      modo: salaActual.modo,
      estado: { $nin: ["finalizada", "cancelada"] },
    });

    if (salasDelMismoModo.length > 0) {
      return res.status(400).json({
        mensaje: `Ya estás participando en una sala de modo ${salaActual.modo}`,
      });
    }

    //Verificar que no esté en mas de dos salas activas
    const salasActivas = await Sala.find({
      jugadores: jugadorId,
      estado: { $nin: ["finalizada", "cancelada"] },
    });

    if (salasActivas.length >= 2) {
      return res.status(400).json({
        mensaje:
          "Ya estás participando en 2 salas. Debes salir de una antes de unirte a otra.",
      });
    }

    // Lógica según el modo
    const limitePorModo = {
      "1v1": 2,
      "2v2": 4,
      "1v1v1v1": 4,
    };

    const limite = limitePorModo[salaActual.modo] || 2;

    if (salaActual.jugadores.length >= limite) {
      return res.status(400).json({ mensaje: "La sala está llena" });
    }

    // Actualizar la sala
    salaActual.jugadores.push(jugadorId);

    // Si ya se llenó, cambiar estado a completa
    if (salaActual.jugadores.length === limite) {
      salaActual.estado = "completa";
    }

    // Guardar ambos cambios
    await Promise.all([salaActual.save(), jugador.save()]);

    const salaActualizada = await Sala.findById(salaActual._id)
      .populate("cajeroAsignado")
      .populate("jugadores");

    // Registrar log ANTES de la respuesta
    await registrarLog({
      accion: "Jugador se unió a una sala",
      usuario: jugador._id,
      rol: "jugador",
      detalle: {
        salaId: salaActual._id,
        modo: salaActual.modo, // Corregido: usar sala.modo en lugar de sala.configuracion.modo
      },
    });

    res.json({
      mensaje: "Te has unido a la sala",
      sala: salaActualizada,
      jugador,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al unirse a la sala",
      error: error.message,
    });
  }
};

// Cambiar estado de la sala (por admin o sistema)
exports.cambiarEstadoSala = async (req, res) => {
  try {
    const { salaId } = req.params;
    const { nuevoEstado } = req.body;

    const sala = await Sala.findById(salaId);
    if (!sala) {
      return res.status(404).json({ mensaje: "Sala no encontrada" });
    }

    sala.estado = nuevoEstado;

    // Actualizar el estado de jugando de todos los jugadores en la sala
    // cuando la sala se finaliza o cancela
    if (
      ["finalizada", "cancelada"].includes(nuevoEstado) &&
      sala.jugadores.length > 0
    ) {
      await Jugador.updateMany(
        { _id: { $in: sala.jugadores } },
        { jugando: false }
      );
    }

    await sala.save();

    res.json({
      mensaje: "Estado de la sala actualizado",
      sala,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al cambiar el estado de la sala",
      error: error.message,
    });
  }
};

// Cancelar sala manualmente
exports.cancelarSala = async (req, res) => {
  try {
    const { salaId } = req.params;

    // Verificar que la sala existe
    const sala = await Sala.findById(salaId);
    if (!sala) {
      return res.status(404).json({ mensaje: "Sala no encontrada" });
    }

    // Verificar que la sala no esté en estado jugando, finalizada o cancelada
    if (["jugando", "finalizada", "cancelada"].includes(sala.estado)) {
      return res
        .status(400)
        .json({ mensaje: "Esta sala no puede ser cancelada" });
    }

    //Devolución de entradas
    const precioEntrada = sala.configuracion?.entrada || 0;
    const jugadoresEnSala = sala.jugadores || [];
    let resultadoReembolsos = null;

    // Solo procesar reembolsos si hay precio de entrada y jugadores
    if (precioEntrada > 0 && jugadoresEnSala.length > 0) {
      try {
        console.log(
          `�� [CANCELARSALA] Procesando reembolsos para ${jugadoresEnSala.length} jugadores`
        );
        console.log(`💰 [CANCELARSALA] Monto por jugador: ${precioEntrada}`);

        // Procesar reembolsos masivos
        resultadoReembolsos =
          await transaccionesController.procesarReembolsosMasivos(
            jugadoresEnSala,
            precioEntrada,
            "Reembolso por cancelación de sala",
            {
              tipo: "cancelacion_sala",
              salaId: sala._id,
              salaNombre: sala.nombre || "Sala sin nombre",
              juego: sala.juego,
            },
            {
              timestamp: new Date(),
              motivo: "Cancelación manual de sala",
              adminId: req.user?._id || null,
            }
          );

        console.log(`✅ [CANCELARSALA] Reembolsos procesados:`, {
          exitosos: resultadoReembolsos.exitosos.length,
          fallidos: resultadoReembolsos.fallidos.length,
          total: resultadoReembolsos.totalProcesados,
        });

        // Si hay errores en reembolsos, registrarlos pero no fallar la cancelación
        if (resultadoReembolsos.fallidos.length > 0) {
          console.warn(
            `⚠️ [CANCELARSALA] Algunos reembolsos fallaron:`,
            resultadoReembolsos.fallidos
          );
        }
      } catch (errorReembolso) {
        console.error(
          `❌ [CANCELARSALA] Error procesando reembolsos:`,
          errorReembolso
        );
        // No fallar la cancelación por errores de reembolso
        // Los reembolsos se pueden procesar manualmente después
      }
    }

    sala.estado = "cancelada";
    sala.fechaCancelacion = new Date();
    sala.motivoCancelacion = "Cancelación manual";

    // Actualizar el estado de jugando de todos los jugadores en la sala
    if (sala.jugadores.length > 0) {
      await Jugador.updateMany(
        { _id: { $in: sala.jugadores } },
        { jugando: false }
      );
    }

    await sala.save();

    // Registrar log con información de reembolsos
    await registrarLog({
      accion: "Sala cancelada",
      usuario: req.user?._id || null,
      rol: req.user?.rol || "sistema",
      detalle: {
        salaId: sala._id,
        salaNombre: sala.nombre,
        juego: sala.juego,
        motivo: "cancelación manual",
        jugadoresAfectados: sala.jugadores.length,
        precioEntrada,
        reembolsos: resultadoReembolsos
          ? {
              exitosos: resultadoReembolsos.exitosos.length,
              fallidos: resultadoReembolsos.fallidos.length,
              total: resultadoReembolsos.totalProcesados,
            }
          : null,
      },
    });

    // Respuesta exitosa
    res.json({
      mensaje: "Sala cancelada exitosamente",
      sala: {
        _id: sala._id,
        nombre: sala.nombre,
        estado: sala.estado,
        fechaCancelacion: sala.fechaCancelacion,
        jugadoresAfectados: sala.jugadores.length,
      },
      reembolsos: resultadoReembolsos
        ? {
            mensaje: `Reembolsos procesados: ${resultadoReembolsos.exitosos.length} exitosos, ${resultadoReembolsos.fallidos.length} fallidos`,
            exitosos: resultadoReembolsos.exitosos.length,
            fallidos: resultadoReembolsos.fallidos.length,
            total: resultadoReembolsos.totalProcesados,
            detalles:
              resultadoReembolsos.fallidos.length > 0
                ? resultadoReembolsos.fallidos
                : undefined,
          }
        : {
            mensaje:
              "No se requirieron reembolsos (sala gratuita o sin jugadores)",
          },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al cancelar la sala",
      error: error.message,
    });
  }
};

// Cancelar una sala por inactividad
exports.cancelarSalaPorInactividad = async (req, res) => {
  try {
    const { salaId } = req.params;

    const sala = await Sala.findById(salaId);
    if (!sala) {
      return res.status(404).json({ mensaje: "Sala no encontrada" });
    }

    const estadosCancelables = ["esperando", "completa", "pagada"];
    if (!estadosCancelables.includes(sala.estado)) {
      return res.status(400).json({
        mensaje: `La sala no se puede cancelar porque está en estado '${sala.estado}'`,
      });
    }

    sala.estado = "cancelada";

    // Actualizar el estado de jugando de todos los jugadores en la sala
    if (sala.jugadores.length > 0) {
      await Jugador.updateMany(
        { _id: { $in: sala.jugadores } },
        { jugando: false }
      );
    }

    await sala.save();

    // Registrar log ANTES de la respuesta
    await registrarLog({
      accion: "Sala cancelada por inactividad",
      usuario: req.user?._id || null,
      rol: req.user?.rol || "sistema",
      detalle: {
        salaId: sala._id,
        motivo: "inactividad",
        jugadoresAfectados: sala.jugadores.length,
        estadoAnterior: sala.estado,
      },
    });

    res.status(200).json({ mensaje: "Sala cancelada por inactividad", sala });
  } catch (error) {
    res
      .status(500)
      .json({ mensaje: "Error al cancelar la sala", error: error.message });
  }
};

// Cambiar estado de la sala a "jugando"
exports.marcarSalaComoJugando = async (req, res) => {
  try {
    const { salaId } = req.params;

    const sala = await Sala.findById(salaId);
    if (!sala) {
      return res.status(404).json({ mensaje: "Sala no encontrada" });
    }

    if (sala.estado !== "pagada") {
      return res
        .status(400)
        .json({ mensaje: "La sala aún no está lista para jugar" });
    }

    sala.estado = "jugando";
    await sala.save();

    res.status(200).json({ mensaje: "Sala marcada como jugando", sala });
  } catch (error) {
    res
      .status(500)
      .json({ mensaje: "Error al actualizar la sala", error: error.message });
  }
};

// Cambiar estado de la sala a "finalizada"
exports.marcarSalaComoFinalizada = async (req, res) => {
  try {
    const { salaId } = req.params;

    const sala = await Sala.findById(salaId);
    if (!sala) {
      return res.status(404).json({ mensaje: "Sala no encontrada" });
    }

    if (sala.estado !== "jugando") {
      return res
        .status(400)
        .json({ mensaje: "La sala no está en juego actualmente" });
    }

    sala.estado = "finalizada";

    // Actualizar el estado de jugando de todos los jugadores en la sala
    if (sala.jugadores.length > 0) {
      await Jugador.updateMany(
        { _id: { $in: sala.jugadores } },
        { jugando: false }
      );
    }

    await sala.save();

    res.status(200).json({ mensaje: "Sala marcada como finalizada", sala });
  } catch (error) {
    res
      .status(500)
      .json({ mensaje: "Error al finalizar la sala", error: error.message });
  }
};

// Eliminar un jugador de una sala
exports.eliminarJugadorDeSala = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { salaId } = req.params;
    const { jugadorId } = req.body;

    await session.startTransaction();

    // Verificar que la sala existe
    const sala = await Sala.findById(salaId);
    if (!sala) {
      return res.status(404).json({ mensaje: "Sala no encontrada" });
    }

    // Verificar que el jugador existe
    const jugador = await Jugador.findById(jugadorId);
    if (!jugador) {
      return res.status(404).json({ mensaje: "Jugador no encontrado" });
    }

    // Verificar que el jugador está en la sala
    if (!sala.jugadores.includes(jugadorId)) {
      return res.status(400).json({ mensaje: "El jugador no está en la sala" });
    }

    // 4) Verificar si la sala puede ser abandonada
    // Actualmente esta situacion es imposible ya que el jugador solo puede ver las salas en estado "esperando"
    /*if (["jugando", "finalizada"].includes(sala.estado)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        mensaje: "No puedes abandonar una sala en curso o finalizada" 
      });
    }*/

    // Eliminar al jugador del array de jugadores
    sala.jugadores = sala.jugadores.filter((id) => id.toString() !== jugadorId);

    // Aplicar reembolso al jugador
    let reembolsoInfo = null;
    const precioEntrada = sala.configuracion?.entrada || 0;

    if (precioEntrada > 0) {
      console.log(
        `💰 [SALAS] Procesando reembolso de ${precioEntrada} centavos`
      );
      // Llamada a la funcion de reembolso
      reembolsoInfo = await transaccionesController.procesarReembolso(
        jugadorId,
        precioEntrada,
        `Reembolso por abandono voluntario de sala: ${sala.nombre || sala._id}`,
        {
          // referenciaExterna
          salaId: sala._id,
          tipoAbandono: "voluntario",
          procesamientoAutomatico: true,
        },
        {
          // metadata
          ipOrigen: req.ip || "backend-interno",
          usuarioAccion: req.user?._id,
          controladorOrigen: "salasController",
          accion: "eliminarJugadorDeSala",
        }
      );
      // Verificar si el reembolso fue exitoso
      if (reembolsoInfo.exito) {
        console.log(
          `✅ [SALAS] Reembolso procesado exitosamente: ${reembolsoInfo.referencia}`
        );
      } else {
        console.error(`❌ [SALAS] Error en reembolso: ${reembolsoInfo.error}`);
        // IMPORTANTE: No fallar la operación si el reembolso falla
        // El usuario puede contactar soporte para resolverlo
      }
    }

    // Si la sala estaba completa y ahora tiene menos jugadores, cambiar estado a "esperando"
    const limitePorModo = {
      "1v1": 2,
      "2v2": 4,
      "1v1v1v1": 4,
    };
    const limite = limitePorModo[sala.modo] || 2;
    if (sala.estado === "completa" && sala.jugadores.length < limite) {
      sala.estado = "esperando";
    }

    // Verificar si la sala queda vacía
    let salaCancelada = false;
    if (sala.jugadores.length === 0) {
      sala.estado = "cancelada";
      sala.fechaCancelacion = new Date();
      sala.motivoCancelacion = "Sala vacía - todos los jugadores se fueron";
      salaCancelada = true;
    }

    await Promise.all([sala.save(), jugador.save()]);

    // Registrar log ANTES de la respuesta
    await registrarLog({
      accion: "Jugador eliminado de sala",
      usuario: req.user?._id || jugadorId,
      rol: req.user?.rol || "jugador",
      detalle: {
        salaId: sala._id,
        jugadorId,
        salaCancelada,
        reembolso: reembolsoInfo
          ? {
              procesado: reembolsoInfo.exito,
              monto: reembolsoInfo.monto,
              referencia: reembolsoInfo.referencia,
              error: reembolsoInfo.error,
            }
          : null,
        jugadoresRestantes: sala.jugadores.length,
      },
    });

    // Confirmar la transacción
    await session.commitTransaction();

    // Respuestas
    const response = {
      mensaje: "Jugador eliminado de la sala exitosamente",
      sala,
      jugador,
    };

    if (salaCancelada) {
      response.mensaje += " La sala ha sido cancelada por quedar vacía.";
    }

    if (reembolsoInfo) {
      response.reembolso = {
        procesado: reembolsoInfo.exito,
        monto: reembolsoInfo.monto,
        referencia: reembolsoInfo.referencia || null,
        saldoNuevo: reembolsoInfo.saldoNuevo || null,
        error: reembolsoInfo.error || null,
      };
    }

    console.log(
      `✅ [SALAS] Jugador ${jugadorId} eliminado exitosamente de sala ${salaId}`
    );
    res.json(response);
  } catch (error) {
    console.error(
      "❌ [SALAS] Error eliminando jugador de sala:",
      error.message
    );
    await session.abortTransaction();

    res.status(500).json({
      mensaje: "Error al eliminar jugador de la sala",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
};
