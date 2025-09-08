// models/PaymentConfigAudit.js
const mongoose = require("mongoose");

const paymentConfigAuditSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentConfig",
      required: true,
    },
    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE"],
      required: true,
    },
    oldValue: {
      type: mongoose.Schema.Types.Mixed,
    },
    newValue: {
      type: mongoose.Schema.Types.Mixed,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: true,
  }
);

// Índice para consultas de auditoría
paymentConfigAuditSchema.index({ configId: 1, createdAt: -1 });

module.exports = mongoose.model("PaymentConfigAudit", paymentConfigAuditSchema);
