// controllers/paymentConfigController.js
const PaymentConfig = require("../models/PaymentConfig");
const PaymentConfigAudit = require("../models/PaymentConfigAudit");

// Obtener toda la configuración actual
exports.getConfig = async (req, res) => {
  try {
    const configs = await PaymentConfig.find({ isActive: true });

    // Organizar por tipo de configuración
    const organizedConfig = {
      precios: {},
      comisiones: {},
      limites: {},
      moneda: {},
    };

    configs.forEach((config) => {
      const keys = config.configKey.split(".");
      let current = organizedConfig[config.configType];

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = config.configValue;
    });

    res.json({
      success: true,
      data: organizedConfig,
      metadata: {
        last_updated: new Date().toISOString(),
        total_configs: configs.length,
      },
    });
  } catch (error) {
    console.error("Error obteniendo configuración:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};

// Actualizar configuración específica
exports.updateConfig = async (req, res) => {
  try {
    const { configType, configKey, configValue } = req.body;
    const userId = req.user.id; // Del middleware de autenticación

    // Validar entrada
    if (!configType || !configKey || configValue === undefined) {
      return res.status(400).json({
        success: false,
        error: "configType, configKey y configValue son requeridos",
      });
    }

    // Buscar configuración existente
    let config = await PaymentConfig.findOne({
      configType,
      configKey,
      isActive: true,
    });

    let oldValue = null;
    let action = "CREATE";

    if (config) {
      // Actualizar configuración existente
      oldValue = config.configValue;
      action = "UPDATE";

      config.configValue = configValue;
      config.updatedBy = userId;
      await config.save();
    } else {
      // Crear nueva configuración
      config = new PaymentConfig({
        configType,
        configKey,
        configValue,
        createdBy: userId,
        updatedBy: userId,
      });
      await config.save();
    }

    // Registrar auditoría
    await PaymentConfigAudit.create({
      configId: config._id,
      action,
      oldValue,
      newValue: configValue,
      userId,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Si se actualizó un timeout de depósito, actualizar el TransactionTimeoutManager
    if (
      configType === "limites" &&
      (configKey === "deposito.timeout.pendiente" ||
        configKey === "deposito.timeout.en_proceso")
    ) {
      try {
        const socketManager = req.app.get("socketManager");
        if (
          socketManager &&
          socketManager.transactionTimeoutManager
        ) {
          await socketManager.transactionTimeoutManager.updateTimeouts();
          console.log(
            `✅ [PAYMENT-CONFIG] Timeouts actualizados después de cambiar ${configKey}`
          );
        }
      } catch (error) {
        console.error(
          "⚠️ [PAYMENT-CONFIG] Error actualizando timeouts después de cambiar configuración:",
          error
        );
        // No fallar la respuesta si hay error actualizando timeouts
      }
    }

    res.json({
      success: true,
      message: `Configuración ${
        action === "CREATE" ? "creada" : "actualizada"
      } exitosamente`,
      data: {
        id: config._id,
        configType,
        configKey,
        configValue,
      },
    });
  } catch (error) {
    console.error("Error actualizando configuración:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};

// Obtener historial de auditoría
exports.getAuditLog = async (req, res) => {
  try {
    const { configType, configKey, limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    let query = {};

    if (configType || configKey) {
      const configQuery = {};
      if (configType) configQuery.configType = configType;
      if (configKey) configQuery.configKey = configKey;

      const configs = await PaymentConfig.find(configQuery);
      query.configId = { $in: configs.map((c) => c._id) };
    }

    const auditLogs = await PaymentConfigAudit.find(query)
      .populate("configId", "configType configKey")
      .populate("userId", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PaymentConfigAudit.countDocuments(query);

    res.json({
      success: true,
      data: auditLogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error obteniendo auditoría:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};

// Eliminar configuración (soft delete)
exports.deleteConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const config = await PaymentConfig.findById(id);
    if (!config) {
      return res.status(404).json({
        success: false,
        error: "Configuración no encontrada",
      });
    }

    // Soft delete
    config.isActive = false;
    config.updatedBy = userId;
    await config.save();

    // Registrar auditoría
    await PaymentConfigAudit.create({
      configId: config._id,
      action: "DELETE",
      oldValue: config.configValue,
      newValue: null,
      userId,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.json({
      success: true,
      message: "Configuración eliminada exitosamente",
    });
  } catch (error) {
    console.error("Error eliminando configuración:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};

// Obtener configuración por tipo específico
exports.getConfigByType = async (req, res) => {
  try {
    const { configType } = req.params;

    const configs = await PaymentConfig.find({
      configType,
      isActive: true,
    });

    // Organizar configuración del tipo específico
    const organizedConfig = {};

    configs.forEach((config) => {
      const keys = config.configKey.split(".");
      let current = organizedConfig;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }

      current[keys[keys.length - 1]] = config.configValue;
    });

    res.json({
      success: true,
      data: organizedConfig,
      metadata: {
        configType,
        total_configs: configs.length,
      },
    });
  } catch (error) {
    console.error("Error obteniendo configuración por tipo:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};

// Restaurar configuración eliminada
exports.restoreConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const config = await PaymentConfig.findById(id);
    if (!config) {
      return res.status(404).json({
        success: false,
        error: "Configuración no encontrada",
      });
    }

    if (config.isActive) {
      return res.status(400).json({
        success: false,
        error: "La configuración ya está activa",
      });
    }

    // Restaurar configuración
    config.isActive = true;
    config.updatedBy = userId;
    await config.save();

    // Registrar auditoría
    await PaymentConfigAudit.create({
      configId: config._id,
      action: "RESTORE",
      oldValue: null,
      newValue: config.configValue,
      userId,
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    res.json({
      success: true,
      message: "Configuración restaurada exitosamente",
    });
  } catch (error) {
    console.error("Error restaurando configuración:", error);
    res.status(500).json({
      success: false,
      error: "Error interno del servidor",
    });
  }
};
