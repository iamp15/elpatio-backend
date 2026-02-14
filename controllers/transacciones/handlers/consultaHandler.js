const Transaccion = require("../../../models/Transaccion");
const Jugador = require("../../../models/Jugador");
const Cajero = require("../../../models/Cajero");

/**
 * Obtener transacciones por estado para cajeros (endpoint genérico)
 */
async function obtenerTransaccionesCajero(req, res) {
  try {
    const { estado, tipo, limite = 50 } = req.query;

    // Validar que se proporcione un estado
    if (!estado) {
      return res.status(400).json({
        mensaje: "El parámetro 'estado' es requerido",
      });
    }

    // Estados válidos - incluye estados activos y finalizados
    const estadosValidos = [
      // Estados activos
      "pendiente",
      "en_proceso",
      "realizada",
      // Estados finalizados
      "completada",
      "completada_con_ajuste",
      "rechazada",
      "cancelada",
      "fallida",
      "revertida",
      "requiere_revision_admin",
      "retiro_pendiente_asignacion",
    ];
    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({
        mensaje: `Estado inválido. Estados válidos: ${estadosValidos.join(
          ", "
        )}`,
      });
    }

    const filtros = {
      categoria: { $in: ["deposito", "retiro"] },
      estado: estado,
    };

    // Estados que requieren filtro por cajero (excluyendo pendiente que es global)
    const estadosConCajero = [
      "en_proceso",
      "realizada",
      "completada",
      "completada_con_ajuste",
      "rechazada",
      "revertida",
      "requiere_revision_admin",
    ];
    if (estadosConCajero.includes(estado)) {
      filtros.cajeroId = req.user.id;
    }

    if (tipo) filtros.categoria = tipo;

    let transacciones = await Transaccion.find(filtros)
      .populate("jugadorId", "username nickname telegramId")
      .populate("cajeroId", "nombreCompleto email telefonoContacto estado")
      .sort({ fechaCreacion: -1 })
      .limit(parseInt(limite));

    // Para estado pendiente: no mostrar retiros a cajeros que no tienen saldo suficiente
    if (estado === "pendiente" && transacciones.length > 0) {
      const cajero = await Cajero.findById(req.user.id).select("saldo").lean();
      const saldoCajero = cajero?.saldo ?? 0;
      transacciones = transacciones.filter((t) => {
        if (t.categoria !== "retiro") return true;
        return t.monto <= saldoCajero;
      });
    }

    res.json({
      transacciones,
      total: transacciones.length,
      estado: estado,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo transacciones",
      error: error.message,
    });
  }
}

/**
 * Obtener transacciones pendientes para cajeros (mantener compatibilidad)
 */
async function obtenerPendientesCajero(req, res) {
  try {
    const { tipo, cajeroId, limite = 50 } = req.query;

    const filtros = {
      categoria: { $in: ["deposito", "retiro"] },
      estado: { $in: ["pendiente", "en_proceso", "realizada"] },
    };

    if (tipo) filtros.categoria = tipo;
    if (cajeroId) filtros.cajeroId = cajeroId;

    const transacciones = await Transaccion.find(filtros)
      .populate("jugadorId", "username nickname telegramId")
      .populate("cajeroId", "nombreCompleto email telefonoContacto estado")
      .sort({ fechaCreacion: 1 })
      .limit(parseInt(limite));

    res.json({
      transacciones,
      total: transacciones.length,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo transacciones pendientes",
      error: error.message,
    });
  }
}

/**
 * Obtener estado de transacción con datos del cajero (para polling)
 * GET /api/transacciones/:transaccionId/estado
 */
async function obtenerEstadoTransaccion(req, res) {
  try {
    const { transaccionId } = req.params;
    const telegramId = req.headers["x-telegram-id"];

    if (!telegramId) {
      return res.status(401).json({
        mensaje: "X-Telegram-ID header requerido",
      });
    }

    // Buscar transacción con datos del cajero poblados
    const transaccion = await Transaccion.findById(transaccionId)
      .populate("cajeroId", "nombreCompleto telefonoContacto datosPagoMovil")
      .populate("jugadorId", "telegramId")
      .select(
        "estado cajeroId fechaAsignacionCajero monto referencia categoria tipo jugadorId saldoNuevo saldoAnterior"
      )
      .lean();

    if (!transaccion) {
      return res.status(404).json({
        mensaje: "Transacción no encontrada",
      });
    }

    // Verificar que la transacción pertenece al usuario
    if (
      transaccion.jugadorId &&
      transaccion.jugadorId.telegramId !== telegramId
    ) {
      return res.status(403).json({
        mensaje: "No tienes permisos para ver esta transacción",
      });
    }

    // Preparar respuesta base
    const respuesta = {
      estado: transaccion.estado,
      cajeroAsignado: !!transaccion.cajeroId,
      monto: transaccion.monto,
      referencia: transaccion.referencia,
      categoria: transaccion.categoria,
      tipo: transaccion.tipo,
      fechaAsignacion: transaccion.fechaAsignacionCajero,
    };

    if (["completada", "completada_con_ajuste"].includes(transaccion.estado)) {
      respuesta.saldoNuevo = transaccion.saldoNuevo;
      respuesta.saldoAnterior = transaccion.saldoAnterior;
    }

    // Si hay cajero asignado, incluir sus datos bancarios
    if (transaccion.cajeroId) {
      respuesta.cajero = {
        _id: transaccion.cajeroId._id,
        nombre: transaccion.cajeroId.nombreCompleto,
        telefono: transaccion.cajeroId.telefonoContacto,
        datosPago: {
          banco: transaccion.cajeroId.datosPagoMovil.banco,
          cedula: {
            prefijo: transaccion.cajeroId.datosPagoMovil.cedula.prefijo,
            numero: transaccion.cajeroId.datosPagoMovil.cedula.numero,
          },
          telefono: transaccion.cajeroId.datosPagoMovil.telefono,
        },
      };
    }

    res.json(respuesta);
  } catch (error) {
    res.status(500).json({
      mensaje: "Error obteniendo estado de transacción",
      error: error.message,
    });
  }
}

module.exports = {
  obtenerTransaccionesCajero,
  obtenerPendientesCajero,
  obtenerEstadoTransaccion,
};
