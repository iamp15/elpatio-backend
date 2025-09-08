const bcrypt = require("bcrypt");

const hash = "$2b$10$JObFz4H6agmgBr0EbMJo7OdYei7oAO3CAfpnnAvuTOc0Hpfm9jCGO";
const contraseña = "Cl4ve#SuperAdm1n!2025";

bcrypt.compare(contraseña, hash).then((result) => console.log(result));
