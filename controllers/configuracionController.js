const ConfiguracionSistema = require("../models/ConfiguracionSistema");

/**
 * Obtener todas las configuraciones
 */
exports.obtenerConfiguraciones = async (req, res) => {
  try {
    const configuraciones = await ConfiguracionSistema.find();
    res.status(200).json({
      ok: true,
      configuraciones,
    });
  } catch (error) {
    console.error("Error obteniendo configuraciones:", error);
    res.status(500).json({
      ok: false,
      message: "Error obteniendo configuraciones",
      error: error.message,
    });
  }
};

/**
 * Obtener configuraciones de depósitos (público para app de cajeros)
 */
exports.obtenerConfiguracionesDepositos = async (req, res) => {
  try {
    const configuraciones = await ConfiguracionSistema.obtenerPorCategoria(
      "depositos"
    );

    // Convertir a objeto simple para facilitar su uso en frontend
    const config = {};
    configuraciones.forEach((c) => {
      config[c.clave] = c.valor;
    });

    res.status(200).json({
      ok: true,
      configuracion: config,
    });
  } catch (error) {
    console.error("Error obteniendo configuraciones de depósitos:", error);
    res.status(500).json({
      ok: false,
      message: "Error obteniendo configuraciones de depósitos",
      error: error.message,
    });
  }
};

/**
 * Obtener una configuración específica por clave
 */
exports.obtenerConfiguracion = async (req, res) => {
  try {
    const { clave } = req.params;
    const valor = await ConfiguracionSistema.obtenerValor(clave);

    if (valor === null) {
      return res.status(404).json({
        ok: false,
        message: "Configuración no encontrada",
      });
    }

    res.status(200).json({
      ok: true,
      clave,
      valor,
    });
  } catch (error) {
    console.error("Error obteniendo configuración:", error);
    res.status(500).json({
      ok: false,
      message: "Error obteniendo configuración",
      error: error.message,
    });
  }
};

/**
 * Actualizar una configuración (solo admins)
 */
exports.actualizarConfiguracion = async (req, res) => {
  try {
    const { clave } = req.params;
    const { valor } = req.body;

    // Verificar que la configuración exista y sea modificable
    const configExistente = await ConfiguracionSistema.findOne({ clave });
    if (!configExistente) {
      return res.status(404).json({
        ok: false,
        message: "Configuración no encontrada",
      });
    }

    if (!configExistente.esModificable) {
      return res.status(403).json({
        ok: false,
        message: "Esta configuración no puede ser modificada",
      });
    }

    // Validar rango si aplica
    if (
      configExistente.tipoDato === "number" &&
      configExistente.rangoValido
    ) {
      const valorNum = Number(valor);
      if (
        valorNum < configExistente.rangoValido.minimo ||
        valorNum > configExistente.rangoValido.maximo
      ) {
        return res.status(400).json({
          ok: false,
          message: `El valor debe estar entre ${configExistente.rangoValido.minimo} y ${configExistente.rangoValido.maximo}`,
        });
      }
    }

    // Actualizar configuración
    const modificadoPor = req.cajero?._id || null;
    const configuracion = await ConfiguracionSistema.establecerValor(
      clave,
      valor,
      modificadoPor
    );

    res.status(200).json({
      ok: true,
      message: "Configuración actualizada exitosamente",
      configuracion,
    });
  } catch (error) {
    console.error("Error actualizando configuración:", error);
    res.status(500).json({
      ok: false,
      message: "Error actualizando configuración",
      error: error.message,
    });
  }
};

/**
 * Crear una nueva configuración (solo admins)
 */
exports.crearConfiguracion = async (req, res) => {
  try {
    const configuracion = new ConfiguracionSistema(req.body);
    await configuracion.save();

    res.status(201).json({
      ok: true,
      message: "Configuración creada exitosamente",
      configuracion,
    });
  } catch (error) {
    console.error("Error creando configuración:", error);
    res.status(500).json({
      ok: false,
      message: "Error creando configuración",
      error: error.message,
    });
  }
};

/**
 * Inicializar configuraciones por defecto
 */
exports.inicializarDefaults = async (req, res) => {
  try {
    await ConfiguracionSistema.inicializarDefaults();

    res.status(200).json({
      ok: true,
      message: "Configuraciones por defecto inicializadas",
    });
  } catch (error) {
    console.error("Error inicializando configuraciones:", error);
    res.status(500).json({
      ok: false,
      message: "Error inicializando configuraciones",
      error: error.message,
    });
  }
};

