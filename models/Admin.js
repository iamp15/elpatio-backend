const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const adminSchema = new mongoose.Schema(
  {
    nombreCompleto: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, minlength: 6 },
    rol: {
      type: String,
      enum: ["admin", "superadmin", "bot"],
      default: "admin",
    },
    estado: { type: String, enum: ["activo", "inactivo"], default: "activo" },
    fechaCreacion: { type: Date, default: Date.now },
  },
  { collection: "admins" }
);

//Hash de la contraseña
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

//Comparar contraseñas
adminSchema.methods.comparePassword = async function (inputPassword) {
  return await bcrypt.compare(inputPassword, this.password);
};

module.exports = mongoose.model("Admin", adminSchema);
