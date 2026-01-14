/**
 * Utilidad para manejar subida de imágenes a ImageKit
 */

const ImageKit = require("imagekit");

// Inicializar ImageKit con las credenciales de las variables de entorno
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

/**
 * Subir imagen a ImageKit
 * @param {Buffer} fileBuffer - Buffer del archivo a subir
 * @param {String} fileName - Nombre del archivo
 * @param {String} folder - Carpeta donde guardar (opcional)
 * @returns {Promise<Object>} Objeto con la URL y metadata de la imagen
 */
async function subirImagen(fileBuffer, fileName, folder = "rechazos") {
  try {
    const resultado = await imagekit.upload({
      file: fileBuffer,
      fileName: fileName,
      folder: `/${folder}`,
      useUniqueFileName: true, // Generar nombre único automáticamente
    });

    return {
      url: resultado.url,
      fileId: resultado.fileId,
      name: resultado.name,
      size: resultado.size,
    };
  } catch (error) {
    console.error("❌ Error subiendo imagen a ImageKit:", error);
    throw new Error(`Error al subir imagen: ${error.message}`);
  }
}

/**
 * Eliminar imagen de ImageKit
 * @param {String} fileId - ID del archivo en ImageKit
 * @returns {Promise<Boolean>} True si se eliminó correctamente
 */
async function eliminarImagen(fileId) {
  try {
    await imagekit.deleteFile(fileId);
    return true;
  } catch (error) {
    console.error("❌ Error eliminando imagen de ImageKit:", error);
    throw new Error(`Error al eliminar imagen: ${error.message}`);
  }
}

module.exports = {
  imagekit,
  subirImagen,
  eliminarImagen,
};
