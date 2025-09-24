const jwt = require("jsonwebtoken");
const crypto = require("crypto");

/**
 * Middleware de autenticación para Telegram Web Apps
 * Verifica la autenticidad de los datos de Telegram usando el bot token
 */
const telegramAuth = (req, res, next) => {
  try {
    // Obtener los datos de Telegram del header
    const telegramData = req.headers['x-telegram-data'];
    const telegramHash = req.headers['x-telegram-hash'];
    
    if (!telegramData || !telegramHash) {
      return res.status(401).json({ 
        success: false, 
        message: "Datos de Telegram no proporcionados" 
      });
    }

    // Verificar la autenticidad de los datos usando el bot token
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      console.error("BOT_TOKEN no configurado en el backend");
      return res.status(500).json({ 
        success: false, 
        message: "Error de configuración del servidor" 
      });
    }

    // Crear el secret key para verificar la firma
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    
    // Crear el hash esperado
    const expectedHash = crypto
      .createHmac('sha256', secretKey)
      .update(telegramData)
      .digest('hex');

    // Verificar que el hash coincida
    if (expectedHash !== telegramHash) {
      return res.status(401).json({ 
        success: false, 
        message: "Datos de Telegram no válidos" 
      });
    }

    // Parsear los datos de Telegram
    const userData = JSON.parse(telegramData);
    
    // Verificar que los datos contengan la información necesaria
    if (!userData.user || !userData.user.id) {
      return res.status(401).json({ 
        success: false, 
        message: "Datos de usuario incompletos" 
      });
    }

    // Agregar los datos del usuario a la request
    req.telegramUser = userData.user;
    req.telegramData = userData;
    
    next();
  } catch (error) {
    console.error("Error en autenticación de Telegram:", error);
    return res.status(401).json({ 
      success: false, 
      message: "Error de autenticación" 
    });
  }
};

/**
 * Middleware alternativo más simple que solo verifica el telegramId
 * Para casos donde no se pueden obtener los headers de Telegram
 */
const telegramIdAuth = (req, res, next) => {
  try {
    const telegramId = req.headers['x-telegram-id'];
    
    if (!telegramId) {
      return res.status(401).json({ 
        success: false, 
        message: "Telegram ID no proporcionado" 
      });
    }

    // Verificar que el telegramId sea un número válido
    if (!/^\d+$/.test(telegramId)) {
      return res.status(401).json({ 
        success: false, 
        message: "Telegram ID inválido" 
      });
    }

    // Agregar el telegramId a la request
    req.telegramId = telegramId;
    
    next();
  } catch (error) {
    console.error("Error en autenticación por Telegram ID:", error);
    return res.status(401).json({ 
      success: false, 
      message: "Error de autenticación" 
    });
  }
};

module.exports = {
  telegramAuth,
  telegramIdAuth
};
