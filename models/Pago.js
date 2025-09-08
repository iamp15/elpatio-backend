const mongoose = require("mongoose");

const pagoSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ["entrada", "premio"],
    required: true,
  },
  jugador: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Jugador",
    required: true,
  },
  cajero: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Cajero",
    required: true,
  },
  monto: {
    type: Number,
    required: true,
  },
  datosPagoJugador: {
    cedula: String,
    banco: String,
    telefono: String,
  },
  estado: {
    type: String,
    enum: ["pendiente", "confirmado", "rechazado", "completado"],
    default: "pendiente",
  },
  confirmadoPorCajero: {
    type: Boolean,
    default: false,
  },
  fechaSolicitud: {
    type: Date,
    default: Date.now,
  },
  fechaConfirmacion: Date,
});

module.exports = mongoose.model("Pago", pagoSchema);
