const mongoose = require("mongoose");

const configJuegoSchema = new mongoose.Schema(
  {
    juego: {
      type: String,
      required: true,
      enum: ["ludo", "domino"],
    },
    modo: {
      type: String,
      required: true,
      enum: ["1v1", "2v2", "1v1v1v1"],
    },
    configuracion: {
      entrada: {
        type: Number,
        required: true,
        min: 0,
      },
      premio: {
        type: Number,
        required: true,
        min: 0,
      },
      descripcion: String,
    },
    activo: {
      type: Boolean,
      default: true,
    },
    actualizadoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    actualizadoEn: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

configJuegoSchema.index({ juego: 1, modo: 1 }, { unique: true });

module.exports = mongoose.model("ConfigJuego", configJuegoSchema);
