const configRoles = require("../config/roles");

const verificarMinimo = (rolMinimo) => {
  return (req, res, next) => {
    const rolUsuario = req.user?.rol;
    const nivelUsuario = configRoles.niveles[rolUsuario];
    const nivelRequerido = configRoles.niveles[rolMinimo];


    if (nivelUsuario === undefined || nivelUsuario < nivelRequerido) {
      return res.status(403).json({ mensaje: "Acceso denegado" });
    }

    next();
  };
};

module.exports = verificarMinimo;
