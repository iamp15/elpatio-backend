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
      required: false, // Opcional para inicialización del sistema
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

// === MÉTODOS ESTÁTICOS ===

/**
 * Inicializa configuraciones por defecto si no existen
 * @param {mongoose.Types.ObjectId} systemUserId - ID de usuario del sistema para auditoría
 */
paymentConfigSchema.statics.inicializarDefaults = async function (systemUserId) {
  const defaults = [
    // Timeouts de depósitos
    {
      configType: "limites",
      configKey: "deposito.timeout.pendiente",
      configValue: 10, // 10 minutos
      isActive: true,
    },
    {
      configType: "limites",
      configKey: "deposito.timeout.en_proceso",
      configValue: 20, // 20 minutos
      isActive: true,
    },
  ];

  for (const config of defaults) {
    const existe = await this.findOne({
      configType: config.configType,
      configKey: config.configKey,
    });

    if (!existe) {
      const configData = {
        ...config,
      };
      
      // Solo agregar createdBy y updatedBy si hay systemUserId
      if (systemUserId) {
        configData.createdBy = systemUserId;
        configData.updatedBy = systemUserId;
      }
      
      await this.create(configData);
      console.log(
        `✅ [PAYMENT-CONFIG] Configuración creada: ${config.configType}.${config.configKey} = ${config.configValue}`
      );
    }
  }
};

module.exports = mongoose.model("PaymentConfig", paymentConfigSchema);
