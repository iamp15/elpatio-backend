const mongoose = require("mongoose");

const transaccionSchema = new mongoose.Schema(
  {
    // === INFORMACIÓN BÁSICA ===
    jugadorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Jugador",
      required: true,
      index: true,
    },
    telegramId: {
      type: String,
      required: true,
      index: true,
    },

    // === CLASIFICACIÓN DE TRANSACCIÓN ===
    tipo: {
      type: String,
      enum: ["debito", "credito"],
      required: true,
      index: true,
    },

    categoria: {
      type: String,
      enum: [
        "entrada_sala", // Pago por entrar a sala
        "premio_juego", // Premio por ganar juego
        "deposito", // Depósito de dinero real (requiere cajero)
        "retiro", // Retiro de dinero real (requiere cajero)
        "reembolso", // Devolución por cancelación
        "transferencia", // Transferencia entre jugadores
        "comision", // Comisión del sistema
        "bonificacion", // Bono promocional
        "ajuste_admin", // Ajuste administrativo
      ],
      required: true,
      index: true,
    },

    // === MONTOS Y SALDOS ===
    monto: {
      type: Number,
      required: true,
      min: [1, "El monto debe ser mayor a 0"],
    },
    saldoAnterior: {
      type: Number,
      required: true,
      min: [0, "El saldo anterior no puede ser negativo"],
    },
    saldoNuevo: {
      type: Number,
      required: false, // No requerido hasta que se complete
      min: [0, "El saldo nuevo no puede ser negativo"],
    },

    // === DESCRIPCIÓN Y REFERENCIA ===
    descripcion: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    referencia: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },

    // === ESTADO DE LA TRANSACCIÓN ===
    estado: {
      type: String,
      enum: [
        "pendiente", // Creada pero no procesada
        "en_proceso", // Aceptada por cajero (solo depositos/retiros)
        "realizada", // Realizada por usuario (solo depositos/retiros)
        "confirmada", // Confirmada por cajero (solo depositos/retiros)
        "completada", // Procesada y saldo actualizado
        "completada_con_ajuste", // Completada pero con ajuste de monto
        "rechazada", // Rechazada por cajero o sistema
        "fallida", // Error en el procesamiento
        "revertida", // Transacción revertida
        "cancelada", // Cancelada por el usuario
        "requiere_revision_admin", // Requiere revisión administrativa
      ],
      default: function () {
        // Las transacciones internas se completan inmediatamente
        if (["deposito", "retiro"].includes(this.categoria)) {
          return "pendiente";
        }
        return "completada";
      },
      index: true,
    },

    // === INFORMACIÓN DEL CAJERO (solo para depósitos/retiros) ===
    cajeroId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cajero",
      required: function () {
        return (
          ["deposito", "retiro"].includes(this.categoria) &&
          ["en_proceso", "confirmada", "completada", "completada_con_ajuste"].includes(this.estado)
        );
      },
      index: true,
    },

    // === FECHAS DE SEGUIMIENTO DEL CAJERO ===
    fechaAsignacionCajero: Date,
    fechaConfirmacionCajero: Date,

    // === INFORMACIÓN ADICIONAL DE PAGO (solo depositos/retiros) ===
    infoPago: {
      metodoPago: {
        type: String,
        enum: ["transferencia", "pago_movil", "efectivo", "otro"],
      },
      numeroReferencia: String, // Número de referencia bancaria
      bancoOrigen: String, // Banco desde donde se envía
      bancoDestino: String, // Banco destino (para transferencias)
      comprobanteUrl: String, // URL del comprobante subido por el cajero
      notasCajero: String, // Notas del cajero
      telefonoOrigen: String, // Para pago móvil
      cedulaOrigen: String, // Para pago móvil
    },

    // === MOTIVO DE RECHAZO (solo para transacciones rechazadas) ===
    motivoRechazo: {
      descripcionDetallada: {
        type: String,
        required: false, // No requerido en el schema, se valida manualmente al rechazar
        trim: true,
        maxlength: 1000,
      }, // Texto libre del cajero (obligatorio solo cuando se rechaza)
      imagenRechazoUrl: String, // URL de la imagen de evidencia (opcional)
      fechaRechazo: Date,
    },

    // === AJUSTE DE MONTO (cuando el monto depositado es diferente al solicitado) ===
    ajusteMonto: {
      montoOriginal: Number, // Monto solicitado originalmente
      montoReal: Number, // Monto realmente depositado
      razon: String, // Razón del ajuste
      fechaAjuste: Date,
      ajustadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Cajero",
      },
    },

    // === REFERENCIAS EXTERNAS ===
    referenciaExterna: {
      salaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Sala",
      },
      juegoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Juego",
      },
      jugadorDestinoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Jugador", // Para transferencias
      },
    },

    // === METADATOS ===
    metadata: {
      ipOrigen: String,
      dispositivoOrigen: String,
      monedaOriginal: String,
      tasaCambio: Number,
      comisionAplicada: Number,
      promocionAplicada: String,
      extra: mongoose.Schema.Types.Mixed,
    },

    // === AUDITORÍA ===
    creadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Jugador",
    },

    // === FECHAS DE SEGUIMIENTO ===
    fechaCreacion: {
      type: Date,
      default: Date.now,
    },
    fechaProcesamiento: Date, // Cuando se completa la transacción
    fechaVencimiento: Date, // Para depósitos/retiros pendientes
  },
  { timestamps: true }
);

// === ÍNDICES COMPUESTOS ===
transaccionSchema.index({ jugadorId: 1, estado: 1 });
transaccionSchema.index({ categoria: 1, estado: 1 });
transaccionSchema.index({ cajeroId: 1, estado: 1 });
transaccionSchema.index({ fechaCreacion: -1 });

// === MÉTODOS ESTÁTICOS (Consultas especializadas) ===

/**
 * Genera una referencia única para la transacción
 */
transaccionSchema.statics.generarReferencia = function (categoria, jugadorId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 5);
  return `${categoria.toUpperCase()}_${jugadorId}_${timestamp}_${random}`;
};

/**
 * Obtiene el saldo actual de un jugador basado en sus transacciones completadas
 */
transaccionSchema.statics.obtenerBalance = async function (jugadorId) {
  const ultimaTransaccion = await this.findOne(
    {
      jugadorId: jugadorId,
      estado: "completada",
    },
    { saldoNuevo: 1 },
    { sort: { createdAt: -1 } }
  );
  return ultimaTransaccion ? ultimaTransaccion.saldoNuevo : 0;
};

// === MÉTODOS DE INSTANCIA (Operaciones del objeto) ===

/**
 * Cambia el estado de la transacción con validaciones
 */
transaccionSchema.methods.cambiarEstado = function (
  nuevoEstado,
  motivo = null
) {
  const estadosValidos = {
    pendiente: ["en_proceso", "cancelada"],
    en_proceso: ["realizada", "confirmada", "rechazada", "cancelada"],
    realizada: [
      "confirmada",
      "rechazada",
      "requiere_revision_admin",
    ],
    confirmada: ["completada", "completada_con_ajuste"],
    completada: ["revertida"],
    completada_con_ajuste: ["revertida"],
    requiere_revision_admin: ["rechazada", "confirmada"],
  };

  if (!estadosValidos[this.estado]?.includes(nuevoEstado)) {
    throw new Error(`No se puede cambiar de ${this.estado} a ${nuevoEstado}`);
  }

  this.estado = nuevoEstado;
  if (motivo && ["rechazada", "cancelada"].includes(nuevoEstado)) {
    this.infoPago = { ...this.infoPago, notasCajero: motivo };
  }

  return this;
};

/**
 * Verifica si la transacción requiere intervención de cajero
 */
transaccionSchema.methods.requiereCajero = function () {
  return ["deposito", "retiro"].includes(this.categoria);
};

/**
 * Verifica si la transacción puede ser procesada automáticamente
 */
transaccionSchema.methods.esAutomatica = function () {
  return !this.requiereCajero();
};

/**
 * Verifica si un estado es final (la transacción ha terminado)
 * Estados finales: completada, completada_con_ajuste, rechazada, fallida, cancelada, revertida, requiere_revision_admin
 * Estados no finales: pendiente, en_proceso, realizada, confirmada
 * 
 * Nota: requiere_revision_admin se considera final porque un admin resolverá el conflicto
 * manualmente y ya no se necesita comunicación entre cajero y jugador
 */
transaccionSchema.statics.esEstadoFinal = function (estado) {
  const estadosFinales = [
    "completada",
    "completada_con_ajuste",
    "rechazada",
    "fallida",
    "cancelada",
    "revertida",
    "requiere_revision_admin",
  ];
  return estadosFinales.includes(estado);
};

/**
 * Verifica si el estado actual de la transacción es final
 */
transaccionSchema.methods.esEstadoFinal = function () {
  return this.constructor.esEstadoFinal(this.estado);
};

// === MIDDLEWARE ===

/**
 * Validar que los cálculos de saldo sean correctos antes de guardar
 */
transaccionSchema.pre("save", function (next) {
  if (["completada", "completada_con_ajuste"].includes(this.estado) && this.saldoNuevo !== undefined) {
    if (this.tipo === "debito") {
      if (this.saldoNuevo !== this.saldoAnterior - this.monto) {
        return next(new Error("Cálculo de saldo incorrecto para débito"));
      }
    } else if (this.tipo === "credito") {
      if (this.saldoNuevo !== this.saldoAnterior + this.monto) {
        return next(new Error("Cálculo de saldo incorrecto para crédito"));
      }
    }
  }
  next();
});

/**
 * Establecer fecha de vencimiento para depósitos/retiros
 */
transaccionSchema.pre("save", function (next) {
  if (this.isNew && ["deposito", "retiro"].includes(this.categoria)) {
    // Vencimiento en 24 horas para depósitos/retiros
    this.fechaVencimiento = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  next();
});

/**
 * Establecer fechas de procesamiento automáticamente
 */
transaccionSchema.pre("save", function (next) {
  if (this.isModified("estado")) {
    if (["completada", "completada_con_ajuste"].includes(this.estado) && !this.fechaProcesamiento) {
      this.fechaProcesamiento = new Date();
    }
  }
  next();
});

module.exports = mongoose.model("Transaccion", transaccionSchema);
