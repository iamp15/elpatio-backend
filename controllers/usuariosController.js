const Admin = require("../models/Admin");
const Cajero = require("../models/Cajero");

/**
 * Maneja errores comunes de MongoDB (duplicados, etc.)
 * @param {Error} error - Error de MongoDB
 * @param {Object} res - Response object
 * @param {String} tipoUsuario - Tipo de usuario ("cajero" o "admin")
 */
const manejarError = (error, res, tipoUsuario) => {
  if (error.code === 11000) {
    const campo = Object.keys(error.keyPattern)[0];
    return res.status(409).json({
      mensaje: `Ya existe un ${tipoUsuario} con este ${campo}`,
      campo: campo,
    });
  }

  res.status(500).json({
    mensaje: `Error al registrar el ${tipoUsuario}`,
    error: error.message,
  });
};

/**
 * Registra un nuevo cajero
 * Solo accesible por admin o superadmin
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.registrarCajero = async (req, res) => {
  try {
    const {
      nombreCompleto,
      email,
      password,
      telefonoContacto,
      datosPagoMovil,
      foto,
    } = req.body;

    // Validar campos comunes requeridos
    if (!nombreCompleto || !email || !password) {
      return res.status(400).json({
        mensaje: "Faltan campos requeridos",
        camposRequeridos: ["nombreCompleto", "email", "password"],
      });
    }

    // Validar campos específicos de cajero
    if (!telefonoContacto || !datosPagoMovil) {
      return res.status(400).json({
        mensaje: "Faltan campos requeridos para cajero",
        camposRequeridos: ["telefonoContacto", "datosPagoMovil"],
      });
    }

    // Validar estructura de datosPagoMovil
    if (
      !datosPagoMovil.banco ||
      !datosPagoMovil.cedula?.prefijo ||
      !datosPagoMovil.cedula?.numero ||
      !datosPagoMovil.telefono
    ) {
      return res.status(400).json({
        mensaje: "Estructura de datosPagoMovil incompleta",
        estructuraRequerida: {
          banco: "String",
          cedula: {
            prefijo: "String",
            numero: "String",
          },
          telefono: "String",
        },
      });
    }

    // Verificar si el email ya existe en cajeros
    const cajeroExistente = await Cajero.findOne({ email });
    if (cajeroExistente) {
      return res.status(409).json({
        mensaje: "Ya existe un cajero con este email",
      });
    }

    // Crear el cajero
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
      mensaje: "Cajero registrado correctamente",
      usuario: {
        _id: nuevoCajero._id,
        nombreCompleto,
        email,
        telefonoContacto,
        datosPagoMovil,
        foto,
        rol: "cajero",
      },
    });
  } catch (error) {
    manejarError(error, res, "cajero");
  }
};

/**
 * Registra un nuevo admin
 * Solo accesible por superadmin
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.registrarAdmin = async (req, res) => {
  try {
    const { nombreCompleto, email, password, rolAdmin } = req.body;

    // Validar campos comunes requeridos
    if (!nombreCompleto || !email || !password) {
      return res.status(400).json({
        mensaje: "Faltan campos requeridos",
        camposRequeridos: ["nombreCompleto", "email", "password"],
      });
    }

    // Validar que el rol de admin sea válido (no se puede crear superadmin desde aquí)
    const rol = rolAdmin || "admin";
    const rolesAdminPermitidos = ["admin", "moderador"];

    if (!rolesAdminPermitidos.includes(rol)) {
      return res.status(400).json({
        mensaje: "Rol de admin no permitido",
        rolesPermitidos: rolesAdminPermitidos,
      });
    }

    // Verificar si el email ya existe en admins
    const adminExistente = await Admin.findOne({ email });
    if (adminExistente) {
      return res.status(409).json({
        mensaje: "Ya existe un admin con este email",
      });
    }

    // Crear el admin
    const nuevoAdmin = new Admin({
      nombreCompleto,
      email,
      password, // Se hashea automáticamente en el modelo
      rol,
      estado: "activo",
    });

    await nuevoAdmin.save();

    res.status(201).json({
      mensaje: "Admin registrado correctamente",
      usuario: {
        _id: nuevoAdmin._id,
        nombreCompleto,
        email,
        rol,
        estado: "activo",
      },
    });
  } catch (error) {
    manejarError(error, res, "admin");
  }
};
