const Cajero = require("../models/Cajero");
const jwt = require("jsonwebtoken");

// Crear un cajero (solo accesible por admin o superadmin)
exports.crearCajero = async (req, res) => {
  try {
    const {
      nombreCompleto,
      email,
      password,
      telefonoContacto,
      datosPagoMovil,
      foto,
    } = req.body;

    // Crear manualmente para evitar campos maliciosos
    const nuevoCajero = new Cajero({
      nombreCompleto,
      email,
      telefonoContacto,
      password, // Se hashea automáticamente en el modelo
      datosPagoMovil,
      foto,
    });

    await nuevoCajero.save();

    res.status(201).json({
      mensaje: "Cajero creado correctamente",
      cajero: {
        _id: nuevoCajero._id,
        nombreCompleto,
        email,
        telefonoContacto,
        datosPagoMovil,
        foto,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al crear el cajero",
      error: error.message,
    });
  }
};

// Login de cajero
exports.loginCajero = async (req, res) => {
  try {
    const { email, password } = req.body;

    const cajero = await Cajero.findOne({ email });
    if (!cajero) {
      return res.status(401).json({ mensaje: "Cajero no encontrado" });
    }

    const isMatch = await cajero.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ mensaje: "Contraseña incorrecta" });
    }

    const token = jwt.sign(
      {
        id: cajero._id,
        email: cajero.email,
        rol: "cajero",
      },
      process.env.JWT_SECRET || "secreto123",
      { expiresIn: "1d" }
    );

    res.json({ mensaje: "Login exitoso", token });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al iniciar sesión",
      error: error.message,
    });
  }
};

// Obtener todos los cajeros
exports.obtenerCajeros = async (req, res) => {
  try {
    const cajeros = await Cajero.find().select(
      "_id nombreCompleto email telefonoContacto datosPagoMovil foto estado"
    ); // Evitamos exponer la contraseña
    res.json(cajeros);
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al obtener los cajeros",
      error: error.message,
    });
  }
};

// Obtener información del cajero autenticado
exports.obtenerMiPerfil = async (req, res) => {
  try {
    const cajeroId = req.user.id;

    const cajero = await Cajero.findById(cajeroId).select(
      "_id nombreCompleto email telefonoContacto datosPagoMovil foto"
    );

    if (!cajero) {
      return res.status(404).json({ mensaje: "Cajero no encontrado" });
    }

    res.json({
      mensaje: "Perfil obtenido correctamente",
      cajero: cajero,
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

// Modificar un cajero (solo accesible por admin o superadmin)
exports.modificarCajero = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombreCompleto,
      email,
      password,
      telefonoContacto,
      datosPagoMovil,
      foto,
      estado,
    } = req.body;

    // Buscar el cajero
    const cajero = await Cajero.findById(id);
    if (!cajero) {
      return res.status(404).json({ mensaje: "Cajero no encontrado" });
    }

    // Actualizar solo los campos proporcionados
    if (nombreCompleto !== undefined) cajero.nombreCompleto = nombreCompleto;
    if (email !== undefined) cajero.email = email;
    if (telefonoContacto !== undefined) cajero.telefonoContacto = telefonoContacto;
    if (datosPagoMovil !== undefined) cajero.datosPagoMovil = datosPagoMovil;
    if (foto !== undefined) cajero.foto = foto;
    if (estado !== undefined) {
      const estadosPermitidos = ["activo", "inactivo", "bloqueado"];
      if (!estadosPermitidos.includes(estado)) {
        return res.status(400).json({ mensaje: "Estado no válido" });
      }
      cajero.estado = estado;
    }

    // Si se proporciona password, se actualizará y el hook pre-save lo hasheará
    if (password !== undefined && password.length >= 6) {
      cajero.password = password;
    } else if (password !== undefined && password.length < 6) {
      return res.status(400).json({ 
        mensaje: "La contraseña debe tener al menos 6 caracteres" 
      });
    }

    await cajero.save();

    res.json({
      mensaje: "Cajero modificado correctamente",
      cajero: {
        _id: cajero._id,
        nombreCompleto: cajero.nombreCompleto,
        email: cajero.email,
        telefonoContacto: cajero.telefonoContacto,
        datosPagoMovil: cajero.datosPagoMovil,
        foto: cajero.foto,
        estado: cajero.estado,
      },
    });
  } catch (error) {
    // Manejar error de duplicado de email o teléfono
    if (error.code === 11000) {
      const campo = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        mensaje: `El ${campo} ya está registrado`,
        error: error.message,
      });
    }
    res.status(500).json({
      mensaje: "Error al modificar el cajero",
      error: error.message,
    });
  }
};

// Eliminar un cajero (solo accesible por admin o superadmin)
exports.eliminarCajero = async (req, res) => {
  try {
    const { id } = req.params;

    const cajero = await Cajero.findById(id);
    if (!cajero) {
      return res.status(404).json({ mensaje: "Cajero no encontrado" });
    }

    await Cajero.findByIdAndDelete(id);

    res.json({
      mensaje: "Cajero eliminado correctamente",
      cajero: {
        _id: cajero._id,
        nombreCompleto: cajero.nombreCompleto,
        email: cajero.email,
      },
    });
  } catch (error) {
    res.status(500).json({
      mensaje: "Error al eliminar el cajero",
      error: error.message,
    });
  }
};
