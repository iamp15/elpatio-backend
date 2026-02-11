const mongoose = require("mongoose");

const notificacionBotSchema = new mongoose.Schema(
  {
    transaccionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaccion",
      required: true,
      // El índice se define explícitamente más abajo (línea 74)
    },
    jugadorTelegramId: {
      type: String,
      required: true,
      index: true,
    },
    tipo: {
      type: String,
      required: true,
      enum: [
        "deposito_creado",
        "deposito_aceptado",
        "pago_confirmado",
        "deposito_completado",
        "deposito_rechazado",
        "deposito_cancelado",
        "retiro_completado",
        "retiro_cancelado",
      ],
    },
    titulo: {
      type: String,
      required: true,
    },
    mensaje: {
      type: String,
      required: true,
    },
    datos: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    enviada: {
      type: Boolean,
      default: false,
      index: true,
    },
    intentos: {
      type: Number,
      default: 0,
    },
    fechaCreacion: {
      type: Date,
      default: Date.now,
      index: true,
    },
    fechaEnvio: {
      type: Date,
      default: null,
    },
    eventoId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índice compuesto para consultas eficientes de pendientes
notificacionBotSchema.index({ enviada: 1, fechaCreacion: 1 });

// Índice para consultas por transacción
notificacionBotSchema.index({ transaccionId: 1 });

// Índice compuesto para consultas por jugador y estado
notificacionBotSchema.index({
  jugadorTelegramId: 1,
  enviada: 1,
  fechaCreacion: -1,
});

const NotificacionBot = mongoose.model(
  "NotificacionBot",
  notificacionBotSchema
);

module.exports = NotificacionBot;
