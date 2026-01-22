const mongoose = require("mongoose");

const saldoCajeroSchema = new mongoose.Schema(
  {
    cajeroId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Cajero",
      required: true,
      index: true,
    },
    monto: {
      type: Number,
      required: true,
      // Positivo para incrementos, negativo para decrementos
    },
    saldoAnterior: {
      type: Number,
      required: true,
      min: 0,
    },
    saldoNuevo: {
      type: Number,
      required: true,
      min: 0,
    },
    tipo: {
      type: String,
      enum: ["deposito", "retiro", "ajuste_manual"],
      required: true,
    },
    transaccionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaccion",
      required: false, // Solo para depósitos/retiros
      index: true,
    },
    descripcion: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    fechaCreacion: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { collection: "saldo_cajeros", timestamps: true }
);

// Índice compuesto para consultas frecuentes
saldoCajeroSchema.index({ cajeroId: 1, fechaCreacion: -1 });
saldoCajeroSchema.index({ cajeroId: 1, tipo: 1, fechaCreacion: -1 });

module.exports = mongoose.model("SaldoCajero", saldoCajeroSchema);
