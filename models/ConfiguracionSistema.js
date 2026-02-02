const mongoose = require("mongoose");

/**
 * Esquema de configuración del sistema
 * Permite almacenar configuraciones globales de la aplicación
 */
const configuracionSistemaSchema = new mongoose.Schema(
  {
    // Clave única para identificar la configuración
    clave: {
      type: String,
      required: true,
      unique: true, // unique: true crea automáticamente un índice
      trim: true,
    },

    // Valor de la configuración (flexible para diferentes tipos)
    valor: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // Descripción de qué hace esta configuración
    descripcion: {
      type: String,
      trim: true,
    },

    // Tipo de dato del valor (para validación en frontend)
    tipoDato: {
      type: String,
      enum: ["number", "string", "boolean", "object", "array"],
      default: "string",
    },

    // Categoría de la configuración
    categoria: {
      type: String,
      enum: ["depositos", "retiros", "general", "notificaciones", "seguridad"],
      default: "general",
    },

    // Indica si esta configuración puede ser modificada por admins
    esModificable: {
      type: Boolean,
      default: true,
    },

    // Rango válido para valores numéricos
    rangoValido: {
      minimo: Number,
      maximo: Number,
    },

    // Metadata de auditoría
    ultimaModificacion: {
      fecha: {
        type: Date,
        default: Date.now,
      },
      modificadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Cajero",
      },
    },
  },
  { timestamps: true }
);

// Índices
configuracionSistemaSchema.index({ categoria: 1, clave: 1 });

// === MÉTODOS ESTÁTICOS ===

/**
 * Obtiene el valor de una configuración por su clave
 */
configuracionSistemaSchema.statics.obtenerValor = async function (clave) {
  const config = await this.findOne({ clave });
  return config ? config.valor : null;
};

/**
 * Establece o actualiza el valor de una configuración
 */
configuracionSistemaSchema.statics.establecerValor = async function (
  clave,
  valor,
  modificadoPor = null
) {
  const config = await this.findOneAndUpdate(
    { clave },
    {
      valor,
      "ultimaModificacion.fecha": new Date(),
      "ultimaModificacion.modificadoPor": modificadoPor,
    },
    { new: true, upsert: true }
  );
  return config;
};

/**
 * Obtiene todas las configuraciones de una categoría
 */
configuracionSistemaSchema.statics.obtenerPorCategoria = async function (
  categoria
) {
  return await this.find({ categoria });
};

/**
 * Inicializa configuraciones por defecto si no existen
 */
configuracionSistemaSchema.statics.inicializarDefaults = async function () {
  const defaults = [
    {
      clave: "deposito_monto_minimo",
      valor: 10,
      descripcion: "Monto mínimo permitido para depósitos en Bs",
      tipoDato: "number",
      categoria: "depositos",
      esModificable: true,
      rangoValido: { minimo: 1, maximo: 1000 },
    },
    {
      clave: "deposito_monto_maximo",
      valor: 10000,
      descripcion: "Monto máximo permitido para depósitos en Bs",
      tipoDato: "number",
      categoria: "depositos",
      esModificable: true,
      rangoValido: { minimo: 100, maximo: 100000 },
    },
    {
      clave: "deposito_tiempo_vencimiento",
      valor: 24,
      descripcion: "Horas hasta que vence una solicitud de depósito",
      tipoDato: "number",
      categoria: "depositos",
      esModificable: true,
      rangoValido: { minimo: 1, maximo: 72 },
    },
    {
      clave: "retiro_monto_minimo",
      valor: 10,
      descripcion: "Monto mínimo permitido para retiros en Bs",
      tipoDato: "number",
      categoria: "retiros",
      esModificable: true,
      rangoValido: { minimo: 1, maximo: 1000 },
    },
    {
      clave: "retiro_monto_maximo",
      valor: 10000,
      descripcion: "Monto máximo permitido para retiros en Bs",
      tipoDato: "number",
      categoria: "retiros",
      esModificable: true,
      rangoValido: { minimo: 100, maximo: 100000 },
    },
  ];

  for (const config of defaults) {
    const existe = await this.findOne({ clave: config.clave });
    if (!existe) {
      await this.create(config);
      console.log(`✅ Configuración creada: ${config.clave} = ${config.valor}`);
    }
  }
};

module.exports = mongoose.model("ConfiguracionSistema", configuracionSistemaSchema);

