module.exports = (req, res, next) => {
  if (!req.user || req.user.rol !== "superadmin") {
    return res
      .status(403)
      .json({ message: "Acceso denegado: se requiere rol superadmin" });
  }
  next();
};
