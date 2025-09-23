const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

const app = express();

// Middlewares
app.use(cors());
app.use(morgan("dev"));
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    env: process.env.NODE_ENV
  });
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

//Manejo de errores
app.use(require("./middlewares/errorHandler"));

module.exports = app;
