const mongoose = require("mongoose");

const salaSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  creador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Jugador",
    required: true,
  },
  juego: {
    type: String,
    required: true,
    default: "ludo",
  },
  modo: {
    type: String,
    enum: ["1v1", "2v2", "1v1v1v1"],
    required: true,
  },
  jugadores: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Jugador",
    },
  ],
  estado: {
    type: String,
    enum: [
      "esperando", //Esperando a que se unan los jugadores
      "completa", //Todos los jugadores han unido
      "pagada", // Todos los jugadores han pagado
      "jugando", //Inició la partida
      "finalizada", //Terminó la partida
      "cancelada", //Se canceló la sala
    ],
    default: "esperando",
  },
  cajeroAsignado: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cajero",
  },
  configuracion: {
    duracion: { type: Number }, // minutos
    entrada: { type: Number, required: true }, // monto en Bs
    premio: { type: Number, required: true }, // monto en Bs
    opciones: mongoose.Schema.Types.Mixed,
  },
  pagosConfirmados: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pago",
    },
  ],
  ganador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Jugador",
  },
  linkDeIngreso: {
    type: String,
  },
  creadaEn: {
    type: Date,
    default: Date.now,
  },
  fechaCancelacion: {
    type: Date,
  },
  motivoCancelacion: {
    type: String,
  },
});

module.exports = mongoose.model("Sala", salaSchema);
