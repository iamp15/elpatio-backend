const Jugador = require("../models/Jugador");
const Sala = require("../models/Sala");

//Validacion basica y segura del nickname
exports.validarNickname = (nickname) => {
  if (!nickname) {
    return { valid: false, error: "El nickname es requerido" };
  }

  const cleanNickname = nickname.trim();

  // Validaciones críticas mínimas
  if (cleanNickname.length < 3 || cleanNickname.length > 32) {
    return {
      valid: false,
      error: "El nickname debe tener entre 3 y 32 caracteres",
    };
  }

  if (!/^[a-zA-ZñÑáéíóúÁÉÍÓÚüÜ0-9_-]+$/.test(nickname)) {
    return res.status(400).json({
      error:
        "El nickname solo puede contener letras, números, guiones (-) y guiones bajos (_)",
    });
  }

  if (/\s/.test(cleanNickname)) {
    return { valid: false, error: "El nickname debe ser una sola palabra" };
  }

  // Solo palabras críticas que comprometen seguridad
  const criticalWords = [
    "admin",
    "administrador",
    "bot",
    "moderador",
    "system",
    "root",
  ];
  const lowerNickname = cleanNickname.toLowerCase();

  for (const word of criticalWords) {
    if (lowerNickname.includes(word)) {
      return {
        valid: false,
        error: "El nickname contiene palabras reservadas",
      };
    }
  }

  return { valid: true, nickname: cleanNickname };
};

// Crear un nuevo jugador
exports.crearJugador = async (req, res) => {
  try {
    const { telegramId, username, nickname, firstName } = req.body;

    //Validación básica de nickname
    if (nickname) {
      const validation = this.validarNickname(nickname);
      if (!validation.valid) {
        return res.status(400).json({
          error: validation.error,
          code: "INVALID_NICKNAME",
        });
      }

      // Verificar disponibilidad
      const existingPlayer = await Jugador.findOne({
        nickname: {
          $regex: new RegExp(`^${validation.nickname}$`, "i"),
        },
      });

      if (existingPlayer) {
        return res.status(409).json({
          error: "El nickname ya está en uso",
          code: "NICKNAME_TAKEN",
        });
      }
    }

    const nuevoJugador = new Jugador({
      telegramId,
      username,
      nickname,
      firstName,
    });
    await nuevoJugador.save();

    res
      .status(201)
      .json({ message: "Jugador creado correctamente", jugador: nuevoJugador });
  } catch (error) {
    console.error("Error creando jugador:", error);

    // Manejar error de clave duplicada
    if (error.code === 11000) {
      if (error.keyPattern?.nickname) {
        return res.status(409).json({
          error: "El nickname ya está en uso",
          code: "NICKNAME_TAKEN",
        });
      }
      if (error.keyPattern?.telegramId) {
        return res.status(409).json({
          error: "El usuario ya está registrado",
          code: "USER_EXISTS",
        });
      }
    }

    res
      .status(500)
      .json({ message: "Error al crear el jugador", error: error.message });
  }
};

// Obtener todos los jugadores
exports.obtenerJugadores = async (req, res) => {
  try {
    const jugadores = await Jugador.find();
    res.json(jugadores);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener los jugadores" });
  }
};

// Obtener un jugador por telegramId
exports.obtenerJugadorPorTelegramId = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const jugador = await Jugador.findOne({ telegramId });
    if (!jugador)
      return res.status(404).json({ message: "Jugador no encontrado" });
    res.json(jugador);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener el jugador" });
  }
};

// Obtener un jugador por su ObjectId
exports.obtenerJugadorPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const jugador = await Jugador.findById(id);
    if (!jugador)
      return res.status(404).json({ message: "Jugador no encontrado" });
    res.json(jugador);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener el jugador" });
  }
};

// Acreditar saldo a un jugador
exports.acreditarSaldo = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const { monto } = req.body;

    if (isNaN(monto))
      return res.status(400).json({ message: "El monto debe ser un número" });

    if (monto <= 0)
      return res.status(400).json({ message: "El monto debe ser mayor a 0" });

    const jugador = await Jugador.findOne({ telegramId });
    if (!jugador)
      return res.status(404).json({ message: "Jugador no encontrado" });

    jugador.saldo += Number(monto);
    await jugador.save();

    res.json({
      message: "Saldo acreditado correctamente",
      saldoNuevo: jugador.saldo,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al acreditar saldo", error: error.message });
  }
};

// Debitar saldo del jugador
exports.debitarSaldo = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const { monto } = req.body;

    if (isNaN(monto))
      return res.status(400).json({ message: "El monto debe ser un número" });
    if (monto <= 0)
      return res.status(400).json({ message: "El monto debe ser mayor a 0" });

    const jugador = await Jugador.findOne({ telegramId });
    if (!jugador)
      return res.status(404).json({ message: "Jugador no encontrado" });

    if (jugador.saldo < monto) {
      return res.status(400).json({ message: "Saldo insuficiente" });
    }

    jugador.saldo -= Number(monto);
    await jugador.save();

    res.json({ message: "Saldo debitado", saldoNuevo: jugador.saldo });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al debitar saldo", error: error.message });
  }
};

// Actualizar datos del jugador (nombre, datos bancarios, etc.)
exports.actualizarJugador = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const actualizaciones = req.body;

    const jugador = await Jugador.findOneAndUpdate(
      { telegramId },
      { $set: actualizaciones },
      { new: true, runValidators: true }
    );

    if (!jugador)
      return res.status(404).json({ message: "Jugador no encontrado" });

    res.json({ message: "Jugador actualizado", jugador });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al actualizar jugador", error: error.message });
  }
};

// Eliminar jugador
exports.eliminarJugador = async (req, res) => {
  try {
    const { telegramId } = req.params;

    const jugador = await Jugador.findOneAndDelete({ telegramId });
    if (!jugador)
      return res.status(404).json({ message: "Jugador no encontrado" });

    res.json({ message: "Jugador eliminado correctamente" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error al eliminar jugador", error: error.message });
  }
};

// Verificar disponibilidad del nickname
exports.checkNicknameAvailability = async (req, res) => {
  try {
    const { nickname } = req.params;

    // Validación básica
    const validation = this.validarNickname(nickname);
    if (!validation.valid) {
      return res.status(400).json({
        available: false,
        error: validation.error,
      });
    }

    // Verificar si ya existe (case insensitive)
    const existingPlayer = await Jugador.findOne({
      nickname: {
        $regex: new RegExp(`^${validation.nickname}$`, "i"),
      },
    });

    res.json({
      available: !existingPlayer,
      nickname: validation.nickname,
    });
  } catch (error) {
    console.error("Error verificando disponibilidad de nickname:", error);
    res.status(500).json({
      available: false,
      error: "Error interno del servidor",
    });
  }
};

//Verificar estado del jugador
exports.verificarEstadoJugador = async (req, res) => {
  try {
    const { jugadorId } = req.params;

    // Obtener salas donde participa
    const salasParticipacion = await Sala.find({
      jugadores: jugadorId,
      estado: { $nin: ["finalizada", "cancelada"] },
    });

    // Obtener salas que ha creado
    const salasCreadas = await Sala.find({
      creador: jugadorId,
      estado: { $nin: ["finalizada", "cancelada"] },
    });

    res.json({
      salasParticipacion: salasParticipacion.length,
      salasCreadas: salasCreadas.length,
      puedeUnirse: salasParticipacion.length < 2,
      puedeCrear: salasCreadas.length < 2,
    });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al verificar estado" });
  }
};

// Obtener nickname de un jugador
exports.obtenerNickname = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const jugador = await Jugador.findOne(
      { telegramId },
      { nickname: 1, _id: 0 }
    );
    if (!jugador)
      return res.status(404).json({ message: "Jugador no encontrado" });
    res.json({ nickname: jugador.nickname });
  } catch (error) {
    res.status(500).json({ message: "Error al obtener el nickname" });
  }
};

// Obtener saldo de un jugador
exports.obtenerSaldo = async (req, res) => {
  try {
    const { telegramId } = req.params;
    const jugador = await Jugador.findOne({ telegramId }, { saldo: 1, _id: 0 });
    if (!jugador)
      return res.status(404).json({ message: "Jugador no encontrado" });
    res.json({ saldo: jugador.saldo });
  } catch (error) {
    res.status(500).json({ message: "Error al obtener el saldo" });
  }
};
