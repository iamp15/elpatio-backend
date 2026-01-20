const Admin = require("../models/Admin");
const jwt = require("jsonwebtoken");

// Crear un nuevo admin (solo superadmin)
exports.crearAdmin = async (req, res) => {
  try {
    const { nombreCompleto, email, password, rol } = req.body;

    const rolesPermitidos = ["admin", "moderador"];
    if (!rolesPermitidos.includes(rol)) {
      return res.status(400).json({ mensaje: "Rol no permitido" });
    }

    const nuevoAdmin = new Admin({
      nombreCompleto,
      email,
      password, // será hasheado automáticamente
      rol,
      estado: "activo",
    });

    await nuevoAdmin.save();

    res.status(201).json({
      mensaje: "Admin creado correctamente",
      admin: {
        _id: nuevoAdmin._id,
        nombreCompleto,
        email,
        rol,
        estado: "activo",
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al crear el admin",
      error: error.message,
    });
  }
};

// Login de admin
exports.loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ mensaje: "Admin no encontrado" });
    }

    if (admin.estado !== "activo") {
      return res.status(403).json({ mensaje: "Cuenta inactiva" });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ mensaje: "Contraseña incorrecta" });
    }

    const token = jwt.sign(
      {
        id: admin._id,
        email: admin.email,
        rol: admin.rol,
      },
      process.env.JWT_SECRET || "secreto123",
      { expiresIn: "7d" }
    );

    res.json({
      mensaje: "Login exitoso",
      token,
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al iniciar sesión",
      error: error.message,
    });
  }
};

// Obtener perfil del admin autenticado
exports.obtenerMiPerfil = async (req, res) => {
  try {
    const adminId = req.user.id;

    const admin = await Admin.findById(adminId).select(
      "_id nombreCompleto email rol estado fechaCreacion"
    );

    if (!admin) {
      return res.status(404).json({ mensaje: "Admin no encontrado" });
    }

    res.json({
      mensaje: "Perfil obtenido correctamente",
      admin: admin,
      tokenInfo: {
        id: req.user.id,
        email: req.user.email,
        rol: req.user.rol,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al obtener el perfil",
      error: error.message,
    });
  }
};

// Obtener todos los admins (visible para admin y superadmin)
exports.obtenerAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select(
      "_id nombreCompleto email rol estado"
    ); // no se incluye password
    res.json(admins);
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al obtener los admins",
      error: error.message,
    });
  }
};
