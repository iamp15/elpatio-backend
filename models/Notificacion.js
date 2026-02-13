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
      enum: ["cajero", "jugador", "admin"],
      required: true,
      index: true,
    },

    // TelegramId para jugadores (facilita envío de mensajes)
    telegramId: {
      type: String,
      // El índice se define explícitamente más abajo (línea 86)
    },

    // Tipo de notificación
    tipo: {
      type: String,
      required: true,
      enum: [
        // Tipos para cajeros
        "inicio_sesion",
        "nueva_solicitud",
        "nueva_solicitud_retiro",
        "solicitud_asignada",
        "pago_realizado",
        "transaccion_completada",
        "transaccion_cancelada", // Transacciones canceladas por jugador o timeout
        "revision_solicitada", // Revisión solicitada por jugador
        "retiro_requiere_revision", // Retiro pendiente por falta de saldo en cajeros
        "ajuste_manual", // Ajustes manuales de saldo
        "sesion_cerrada",
        // Tipos para jugadores
        "deposito_aprobado",
        "deposito_rechazado",
        "deposito_cancelado", // Depósitos cancelados
        "retiro_aprobado",
        "retiro_rechazado",
        "sala_completa",
        "juego_iniciado",
        "transaccion_en_revision",
        "cancelacion_sala", // Cancelación de sala
        // Tipos para admins (dashboard)
        "nueva_solicitud_deposito",
        "nueva_solicitud_retiro",
        "transaccion_completada_admin",
        "transaccion_rechazada_admin",
        "transaccion_cancelada_admin",
        "transaccion_requiere_revision",
      ],
    },

    // Para admins: si la notificación fue leída
    leida: {
      type: Boolean,
      default: false,
      index: true,
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
      // El índice se define explícitamente más abajo (línea 83)
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
