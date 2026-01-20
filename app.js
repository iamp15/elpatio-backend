/**
 * Backend API para El Patio
 * @version (leído dinámicamente desde package.json)
 */

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

// Leer versión dinámicamente desde package.json
const packageJson = require("./package.json");
const APP_VERSION = packageJson.version;

const app = express();

// Configurar CORS
const corsOptions = {
  origin: function (origin, callback) {
    // Lista de orígenes permitidos
    // Leer orígenes adicionales desde variable de entorno (separados por comas)
    const additionalOrigins = process.env.CORS_ADDITIONAL_ORIGINS
      ? process.env.CORS_ADDITIONAL_ORIGINS.split(',').map(origin => origin.trim())
      : [];

    const allowedOrigins =
      process.env.NODE_ENV === "production"
        ? [
            "https://elpatio-miniapps.vercel.app",
            "https://elpatio-app-cajeros.vercel.app", // App de cajeros en Vercel
            "https://elpatio-backend.fly.dev",
            "https://telegram.org",
            "https://web.telegram.org",
            // Agregar URL del dashboard cuando esté desplegado
            // "https://tu-dashboard.vercel.app",
            // Permitir localhost en producción solo para desarrollo local del dashboard
            // TODO: Remover en producción cuando el dashboard esté desplegado
            "http://localhost:5174",
            ...additionalOrigins,
          ]
        : [
            "http://localhost:3000",
            "http://localhost:3002",
            "http://localhost:3003", // App de cajeros
            "http://localhost:5173",
            "http://localhost:5174", // Dashboard de administración
            ...additionalOrigins,
            "*",
          ];

    // Permitir peticiones sin origen (como Postman, curl, servicios internos, etc.)
    // En producción, esto puede ser peticiones desde el mismo servidor o servicios internos
    if (!origin) {
      // Permitir peticiones sin origen (pueden ser servicios internos o peticiones directas)
      return callback(null, true);
    }

    // Verificar si el origen está permitido
    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS: Origen bloqueado: ${origin}`);
      callback(new Error("No permitido por CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "X-Telegram-Id",
    "X-Telegram-Data",
    "X-Telegram-Hash",
  ],
  exposedHeaders: ["Authorization"],
};

// Middlewares
app.use(cors(corsOptions));
app.use(morgan("dev"));
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV || "development",
  });
});

// Ruta para servir el archivo de prueba de WebSocket
app.get("/test-websocket", (req, res) => {
  res.sendFile(__dirname + "/test-websocket.html");
});

// Ruta para servir el archivo de prueba de WebSocket en Railway
app.get("/test-websocket-railway", (req, res) => {
  res.sendFile(__dirname + "/test-websocket-railway.html");
});

// Ruta para servir el archivo de prueba de autenticación WebSocket
app.get("/test-websocket-auth", (req, res) => {
  res.sendFile(__dirname + "/test-websocket-auth.html");
});

// Ruta para servir el archivo de prueba del sistema de depósitos WebSocket
app.get("/test-deposito-websocket", (req, res) => {
  res.sendFile(__dirname + "/test-deposito-websocket.html");
});

// Ruta para servir el archivo de prueba de integración HTTP + WebSocket
app.get("/test-http-websocket", (req, res) => {
  res.sendFile(__dirname + "/test-http-websocket.html");
});

// Ruta para servir el archivo de prueba del sistema de rooms
app.get("/test-rooms-websocket", (req, res) => {
  res.sendFile(__dirname + "/test-rooms-websocket.html");
});

// Ruta para servir el dashboard de estado en tiempo real
app.get("/test-dashboard-websocket", (req, res) => {
  res.sendFile(__dirname + "/test-dashboard-websocket.html");
});

// API Routes
app.use("/api/jugadores", require("./routes/jugadores"));
app.use("/api/cajeros", require("./routes/cajeros"));
app.use("/api/usuarios", require("./routes/usuarios"));
app.use("/api/salas", require("./routes/salas"));
app.use("/api/pagos", require("./routes/pagos"));
app.use("/api/admin/stats", require("./routes/stats"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/payment-config", require("./routes/paymentConfig"));
app.use("/api/transacciones", require("./routes/transacciones"));
app.use("/api/upload", require("./routes/upload"));
app.use("/api/webapp", require("./routes/webapp"));
app.use("/api/websocket", require("./routes/websocket"));
app.use("/api/notificaciones", require("./routes/notificaciones"));
app.use("/api/bot", require("./routes/notificacionesBot"));
app.use("/api/config", require("./routes/configuracion"));

//Manejo de errores
app.use(require("./middlewares/errorHandler"));

module.exports = app;
module.exports.APP_VERSION = APP_VERSION;
