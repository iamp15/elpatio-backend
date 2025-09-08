module.exports = (req, res, next) => {
  if (!req.user || !req.user.rol) {
    return res.status(401).json({ message: "No autorizado" });
  }

  const rolesPermitidos = ["admin", "superadmin"];

  if (rolesPermitidos.includes(req.user.rol)) {
    return next();
  }

  return res.status(403).json({
    message: "Acceso denegado: se requieren permisos de administrador",
  });
};
