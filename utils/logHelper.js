const Log = require("../models/Log");

exports.registrarLog = async ({
  accion,
  usuario = null,
  rol = null,
  detalle = {},
}) => {
  try {
    await Log.create({ accion, usuario, rol, detalle });
  } catch (error) {
    console.error("Error al registrar log:", error.message);
  }
};
