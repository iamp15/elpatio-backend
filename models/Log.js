const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    accion: {
      type: String,
      required: true,
    },
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin", // Puede ser Admin, Cajero o Jugador
    },
    rol: {
      type: String, // "jugador", "cajero", "admin", "superadmin", "bot", "sistema"
    },
    detalle: {
      type: Object,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

module.exports = mongoose.model("Log", logSchema);
