/**
 * Controlador para manejar subida de archivos
 */

const multer = require("multer");
const { subirImagen } = require("../utils/imagekit");

// Configurar multer para almacenar en memoria (no en disco)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
  fileFilter: (req, file, cb) => {
    // Validar que sea una imagen
    const tiposPermitidos = /jpeg|jpg|png|webp|gif/;
    const extensionValida = tiposPermitidos.test(
      file.mimetype.toLowerCase()
    );
    const nombreValido = tiposPermitidos.test(
      file.originalname.toLowerCase()
    );

    if (extensionValida && nombreValido) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Tipo de archivo no permitido. Solo se permiten imágenes (jpg, jpeg, png, webp, gif)"
        ),
        false
      );
    }
  },
});

/**
 * Subir imagen de rechazo
 * POST /api/upload/imagen-rechazo
 */
exports.subirImagenRechazo = async (req, res) => {
  try {
    // Verificar que el usuario esté autenticado y sea cajero
    if (!req.user) {
      return res.status(401).json({
        mensaje: "No autorizado",
        error: "Debes estar autenticado para subir imágenes",
      });
    }

    const rolesPermitidos = ["cajero", "admin", "superadmin"];
    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        mensaje: "Acceso denegado",
        error: "Solo cajeros y administradores pueden subir imágenes",
      });
    }

    // Verificar que haya un archivo
    if (!req.file) {
      return res.status(400).json({
        mensaje: "Error de validación",
        error: "Debes proporcionar una imagen",
      });
    }

    // Validar tamaño del archivo
    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        mensaje: "Error de validación",
        error: "La imagen no puede ser mayor a 5MB",
      });
    }

    // Subir imagen a ImageKit
    const resultado = await subirImagen(
      req.file.buffer,
      req.file.originalname,
      "rechazos"
    );

    console.log(`✅ Imagen de rechazo subida exitosamente: ${resultado.url}`);

    res.json({
      mensaje: "Imagen subida exitosamente",
      imagen: {
        url: resultado.url,
        fileId: resultado.fileId,
        nombre: resultado.name,
        tamaño: resultado.size,
      },
    });
  } catch (error) {
    console.error("❌ Error subiendo imagen de rechazo:", error);
    res.status(500).json({
      mensaje: "Error al subir imagen",
      error: error.message,
    });
  }
};

/**
 * Subir imagen de comprobante (para retiros)
 * POST /api/upload/imagen-comprobante
 */
exports.subirImagenComprobante = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        mensaje: "No autorizado",
        error: "Debes estar autenticado para subir imágenes",
      });
    }

    const rolesPermitidos = ["cajero", "admin", "superadmin"];
    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        mensaje: "Acceso denegado",
        error: "Solo cajeros y administradores pueden subir imágenes",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        mensaje: "Error de validación",
        error: "Debes proporcionar una imagen",
      });
    }

    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        mensaje: "Error de validación",
        error: "La imagen no puede ser mayor a 5MB",
      });
    }

    const resultado = await subirImagen(
      req.file.buffer,
      req.file.originalname,
      "comprobantes"
    );

    console.log(
      `✅ Imagen de comprobante subida exitosamente: ${resultado.url}`
    );

    res.json({
      mensaje: "Imagen subida exitosamente",
      imagen: {
        url: resultado.url,
        fileId: resultado.fileId,
        nombre: resultado.name,
        tamaño: resultado.size,
      },
    });
  } catch (error) {
    console.error("❌ Error subiendo imagen de comprobante:", error);
    res.status(500).json({
      mensaje: "Error al subir imagen",
      error: error.message,
    });
  }
};

/**
 * Subir imagen de soporte para ajuste de monto
 * POST /api/upload/imagen-ajuste-monto
 */
exports.subirImagenAjusteMonto = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        mensaje: "No autorizado",
        error: "Debes estar autenticado para subir imágenes",
      });
    }

    const rolesPermitidos = ["cajero", "admin", "superadmin"];
    if (!rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({
        mensaje: "Acceso denegado",
        error: "Solo cajeros y administradores pueden subir imágenes",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        mensaje: "Error de validación",
        error: "Debes proporcionar una imagen",
      });
    }

    if (req.file.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        mensaje: "Error de validación",
        error: "La imagen no puede ser mayor a 5MB",
      });
    }

    const resultado = await subirImagen(
      req.file.buffer,
      req.file.originalname,
      "ajustes-monto"
    );

    console.log(
      `✅ Imagen de ajuste de monto subida exitosamente: ${resultado.url}`
    );

    res.json({
      mensaje: "Imagen subida exitosamente",
      imagen: {
        url: resultado.url,
        fileId: resultado.fileId,
        nombre: resultado.name,
        tamaño: resultado.size,
      },
    });
  } catch (error) {
    console.error("❌ Error subiendo imagen de ajuste de monto:", error);
    res.status(500).json({
      mensaje: "Error al subir imagen",
      error: error.message,
    });
  }
};

// Middleware de multer para usar en la ruta
exports.uploadMiddleware = upload.single("imagen");
