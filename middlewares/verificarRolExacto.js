const verificarRolExacto = (rolesEsperados) => {
  return (req, res, next) => {
    const rolUsuario = req.user?.rol;

    if (!rolUsuario) {
      return res.status(401).json({ mensaje: "Token inválido o sin rol" });
    }

    const roles = Array.isArray(rolesEsperados)
      ? rolesEsperados
      : [rolesEsperados];

    if (!roles.includes(rolUsuario)) {
      return res
        .status(403)
        .json({ mensaje: "Acceso denegado: rol no autorizado" });
    }

    next();
  };
};

module.exports = verificarRolExacto;
