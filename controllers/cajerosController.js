const Cajero = require("../models/Cajero");
const jwt = require("jsonwebtoken");

// Crear un cajero (solo accesible por admin o superadmin)
exports.crearCajero = async (req, res) => {
  try {
    const { nombreCompleto, email, password, banco, cedula, telefono, foto } =
      req.body;

    // Crear manualmente para evitar campos maliciosos
    const nuevoCajero = new Cajero({
      nombreCompleto,
      email,
      password, // Se hashea automáticamente en el modelo
      banco,
      cedula,
      telefono,
      foto,
    });

    await nuevoCajero.save();

    res.status(201).json({
      mensaje: "Cajero creado correctamente",
      cajero: {
        _id: nuevoCajero._id,
        nombreCompleto,
        email,
        banco,
        cedula,
        telefono,
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
      "_id nombreCompleto email banco cedula telefono foto"
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
      "_id nombreCompleto email banco cedula telefono foto"
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
