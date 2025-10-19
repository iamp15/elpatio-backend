/**
 * Backend API para El Patio
 * @version 0.9.0
 */

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

// Constante de versión
const APP_VERSION = "0.9.0"; // Alpha - Infraestructura lista, falta implementar juegos

const app = express();

// Middlewares
app.use(cors());
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
app.use("/api/salas", require("./routes/salas"));
app.use("/api/pagos", require("./routes/pagos"));
app.use("/api/admin/stats", require("./routes/stats"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/payment-config", require("./routes/paymentConfig"));
app.use("/api/transacciones", require("./routes/transacciones"));
app.use("/api/webapp", require("./routes/webapp"));
app.use("/api/websocket", require("./routes/websocket"));

//Manejo de errores
app.use(require("./middlewares/errorHandler"));

module.exports = app;
module.exports.APP_VERSION = APP_VERSION;
