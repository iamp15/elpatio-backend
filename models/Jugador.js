const mongoose = require("mongoose");

const jugadorSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      unique: true,
      required: true,
    },
    username: {
      type: String,
    },
    firstName: {
      type: String,
    },
    nickname: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      minlenghth: 3,
      maxlength: 32,
    },
    saldo: {
      type: Number,
      default: 0,
    },
    datosBancarios: {
      banco: {
        type: String,
      },
      tipoCuenta: { type: String },
      numeroCuenta: { type: String },
      titular: { type: String },
      cedula: {
        prefijo: { type: String },
        numero: { type: String },
      },
      autorizado: { type: Boolean, default: false }, // Acepta guardar sus datos
    },
    estado: {
      type: String,
      enum: ["activo", "inactivo", "bloqueado"],
      default: "activo",
    },
    jugando: { type: Boolean, default: false },
    fechaCreacion: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "jugadores" }
);

module.exports = mongoose.model("Jugador", jugadorSchema);
