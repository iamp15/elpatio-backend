// models/PaymentConfig.js
const mongoose = require("mongoose");

const paymentConfigSchema = new mongoose.Schema(
  {
    configType: {
      type: String,
      enum: ["precios", "comisiones", "limites", "moneda"],
      required: true,
    },
    configKey: {
      type: String,
      required: true,
    },
    configValue: {
      type: mongoose.Schema.Types.Mixed, // JSON flexible
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true, // Crea automáticamente createdAt y updatedAt
  }
);

// Índice compuesto para búsquedas eficientes
paymentConfigSchema.index({ configType: 1, configKey: 1 });

module.exports = mongoose.model("PaymentConfig", paymentConfigSchema);
