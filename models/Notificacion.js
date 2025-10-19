const mongoose = require("mongoose");

const notificacionSchema = new mongoose.Schema(
  {
    // Destinatario de la notificación
    destinatarioId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    destinatarioTipo: {
      type: String,
      enum: ["cajero", "jugador"],
      required: true,
      index: true,
    },

    // TelegramId para jugadores (facilita envío de mensajes)
    telegramId: {
      type: String,
      index: true,
    },

    // Tipo de notificación
    tipo: {
      type: String,
      required: true,
      enum: [
        // Tipos para cajeros
        "inicio_sesion",
        "nueva_solicitud",
        "solicitud_asignada",
        "pago_realizado",
        "transaccion_completada",
        "sesion_cerrada",
        // Tipos para jugadores
        "deposito_aprobado",
        "deposito_rechazado",
        "retiro_aprobado",
        "retiro_rechazado",
        "sala_completa",
        "juego_iniciado",
      ],
    },

    // Contenido de la notificación
    titulo: {
      type: String,
      required: true,
    },

    mensaje: {
      type: String,
      required: true,
    },

    // Datos adicionales (opcional)
    datos: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // ID del evento para prevenir duplicados
    eventoId: {
      type: String,
      index: true,
    },
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
  }
);

// Índice compuesto para consultas eficientes
notificacionSchema.index(
  { destinatarioId: 1, destinatarioTipo: 1, createdAt: -1 },
  { name: "destinatario_fecha" }
);

// Índice para prevenir duplicados por eventoId
notificacionSchema.index({ eventoId: 1 }, { name: "evento_id" });

// Índice para consultas de jugadores por telegramId
notificacionSchema.index({ telegramId: 1 }, { name: "telegram_id" });

const Notificacion = mongoose.model("Notificacion", notificacionSchema);

module.exports = Notificacion;
