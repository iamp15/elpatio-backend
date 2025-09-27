const configRoles = require("../config/roles");

const verificarMinimo = (rolMinimo) => {
  return (req, res, next) => {
    const rolUsuario = req.user?.rol;
    const nivelUsuario = configRoles.niveles[rolUsuario];
    const nivelRequerido = configRoles.niveles[rolMinimo];

    // Debug: Log permission check
    console.log("verificarMinimo - Permission check:", {
      rolUsuario,
      nivelUsuario,
      rolMinimo,
      nivelRequerido,
      userInfo: req.user
    });

    if (nivelUsuario === undefined || nivelUsuario < nivelRequerido) {
      console.log("verificarMinimo - Access denied");
      return res.status(403).json({ mensaje: "Acceso denegado" });
    }

    next();
  };
};

module.exports = verificarMinimo;
