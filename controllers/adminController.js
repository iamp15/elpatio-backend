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

// Modificar un admin (solo superadmin)
exports.modificarAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombreCompleto, email, password, rol, estado } = req.body;

    // Buscar el admin
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ mensaje: "Admin no encontrado" });
    }

    // No permitir modificar superadmins
    if (admin.rol === "superadmin") {
      return res.status(403).json({ 
        mensaje: "No se puede modificar a un superadmin" 
      });
    }

    // Actualizar solo los campos proporcionados
    if (nombreCompleto !== undefined) admin.nombreCompleto = nombreCompleto;
    if (email !== undefined) admin.email = email;
    
    // Validar rol si se proporciona (no se puede asignar rol superadmin)
    if (rol !== undefined) {
      const rolesPermitidos = ["admin", "moderador"];
      if (!rolesPermitidos.includes(rol)) {
        return res.status(400).json({ 
          mensaje: "Rol no permitido. Solo se permite: admin, moderador" 
        });
      }
      admin.rol = rol;
    }

    // Validar estado si se proporciona
    if (estado !== undefined) {
      const estadosPermitidos = ["activo", "inactivo"];
      if (!estadosPermitidos.includes(estado)) {
        return res.status(400).json({ mensaje: "Estado no válido" });
      }
      admin.estado = estado;
    }

    // Si se proporciona password, se actualizará y el hook pre-save lo hasheará
    if (password !== undefined && password.length >= 6) {
      admin.password = password;
    } else if (password !== undefined && password.length < 6) {
      return res.status(400).json({ 
        mensaje: "La contraseña debe tener al menos 6 caracteres" 
      });
    }

    await admin.save();

    res.json({
      mensaje: "Admin modificado correctamente",
      admin: {
        _id: admin._id,
        nombreCompleto: admin.nombreCompleto,
        email: admin.email,
        rol: admin.rol,
        estado: admin.estado,
      },
    });
  } catch (error) {
    // Manejar error de duplicado de email
    if (error.code === 11000) {
      return res.status(400).json({
        mensaje: "El email ya está registrado",
        error: error.message,
      });
    }
    res.status(500).json({
      mensaje: "Error al modificar el admin",
      error: error.message,
    });
  }
};

// Eliminar un admin (solo superadmin)
exports.eliminarAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ mensaje: "Admin no encontrado" });
    }

    // No permitir eliminar superadmins
    if (admin.rol === "superadmin") {
      return res.status(403).json({ 
        mensaje: "No se puede eliminar a un superadmin" 
      });
    }

    // No permitir que un admin se elimine a sí mismo
    if (admin._id.toString() === req.user.id) {
      return res.status(403).json({ 
        mensaje: "No puedes eliminarte a ti mismo" 
      });
    }

    await Admin.findByIdAndDelete(id);

    res.json({
      mensaje: "Admin eliminado correctamente",
      admin: {
        _id: admin._id,
        nombreCompleto: admin.nombreCompleto,
        email: admin.email,
        rol: admin.rol,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al eliminar el admin",
      error: error.message,
    });
  }
};
