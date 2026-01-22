const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const cajeroSchema = new mongoose.Schema(
  {
    nombreCompleto: {
      type: String,
      required: true,
    },
    foto: {
      type: String,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    telefonoContacto: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    datosPagoMovil: {
      banco: { type: String, required: true },
      cedula: {
        prefijo: { type: String, required: true },
        numero: { type: String, required: true },
      },
      telefono: { type: String, required: true },
    },
    estado: {
      type: String,
      enum: ["activo", "inactivo", "bloqueado"],
      default: "activo",
    },
    saldo: {
      type: Number,
      default: 0,
      min: [0, "El saldo no puede ser negativo"],
    },
    fechaCreacion: {
      type: Date,
      default: Date.now,
    },
  },
  { collection: "cajeros" }
);

//Hash de la contraseña
cajeroSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

//Comparar contraseñas
cajeroSchema.methods.comparePassword = async function (inputPassword) {
  return await bcrypt.compare(inputPassword, this.password);
};

module.exports = mongoose.model("Cajero", cajeroSchema);
