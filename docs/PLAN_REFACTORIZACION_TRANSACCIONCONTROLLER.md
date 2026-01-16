# Plan de Refactorización: transaccionController.js

## Objetivo

Dividir `controllers/transaccionController.js` (1,147 líneas) en módulos más pequeños y mantenibles, siguiendo el patrón establecido en `depositoController.js` y `socketManager.js`.

## Estructura Actual

El archivo `transaccionController.js` contiene:

- **Endpoints para solicitudes de cajero** (~100 líneas)
  - `crearSolicitudCajero(req, res)` - Líneas 13-106

- **Endpoints para administradores** (~200 líneas)
  - `obtenerCajerosDisponibles(req, res)` - Líneas 113-130
  - `obtenerTransaccionesCajero(req, res)` - Líneas 135-195
  - `obtenerPendientesCajero(req, res)` - Líneas 200-228
  - `asignarCajero(req, res)` - Líneas 233-321

- **Endpoints para jugadores** (~100 líneas)
  - `confirmarPagoUsuario(req, res)` - Líneas 324-384
  - `cancelarTransaccionJugador(req, res)` - Líneas 511-609

- **Endpoints para cajeros** (~200 líneas)
  - `confirmarPorCajero(req, res)` - Líneas 391-506
  - `rechazarTransaccion(req, res)` - Líneas 614-680

- **Endpoints de consulta** (~200 líneas)
  - `obtenerHistorial(req, res)` - Líneas 687-718
  - `obtenerEstadisticas(req, res)` - Líneas 723-757
  - `obtenerEstadoTransaccion(req, res)` - Líneas 947-1018

- **Procesamiento automático** (~180 líneas)
  - `procesarTransaccionAutomatica(req, res)` - Líneas 763-941

- **Funciones auxiliares** (~120 líneas)
  - `procesarReembolso(jugadorId, monto, motivo, referenciaExterna, metadata)` - Líneas 1034-1104
  - `procesarReembolsosMasivos(jugadores, monto, motivo, referenciaExterna, metadata)` - Líneas 1110-1146

## Estructura Propuesta

```
controllers/transacciones/
├── transaccionController.js            # Clase principal (~200 líneas)
├── handlers/
│   ├── solicitudHandler.js             # crearSolicitudCajero (~100 líneas)
│   ├── asignacionHandler.js            # obtenerCajerosDisponibles, asignarCajero (~150 líneas)
│   ├── consultaHandler.js              # obtenerTransaccionesCajero, obtenerPendientesCajero, obtenerEstadoTransaccion (~200 líneas)
│   ├── confirmacionHandler.js          # confirmarPagoUsuario, confirmarPorCajero (~200 líneas)
│   ├── cancelacionHandler.js           # cancelarTransaccionJugador (~100 líneas)
│   ├── rechazoHandler.js               # rechazarTransaccion (~80 líneas)
│   └── historialHandler.js             # obtenerHistorial, obtenerEstadisticas (~150 líneas)
├── procesamiento/
│   ├── procesamientoAutomatico.js     # procesarTransaccionAutomatica + función interna (~180 líneas)
│   └── reembolsos.js                   # procesarReembolso, procesarReembolsosMasivos (~120 líneas)
└── utils/
    └── transaccionUtils.js             # Utilidades compartidas (si es necesario)
```

## Módulos a Crear

### 1. `controllers/transacciones/handlers/solicitudHandler.js`

**Funciones:**
- `crearSolicitudCajero(req, res)` - Líneas 13-106

**Dependencias:**
- `Transaccion` model
- `Jugador` model
- `websocketHelper`

### 2. `controllers/transacciones/handlers/asignacionHandler.js`

**Funciones:**
- `obtenerCajerosDisponibles(req, res)` - Líneas 113-130
- `asignarCajero(req, res)` - Líneas 233-321

**Dependencias:**
- `Cajero` model
- `Transaccion` model
- `Jugador` model
- `websocketHelper`
- `registrarLog`

### 3. `controllers/transacciones/handlers/consultaHandler.js`

**Funciones:**
- `obtenerTransaccionesCajero(req, res)` - Líneas 135-195
- `obtenerPendientesCajero(req, res)` - Líneas 200-228
- `obtenerEstadoTransaccion(req, res)` - Líneas 947-1018

**Dependencias:**
- `Transaccion` model
- `Jugador` model
- `Cajero` model (para populate)

### 4. `controllers/transacciones/handlers/confirmacionHandler.js`

**Funciones:**
- `confirmarPagoUsuario(req, res)` - Líneas 324-384
- `confirmarPorCajero(req, res)` - Líneas 391-506

**Dependencias:**
- `Transaccion` model
- `Jugador` model
- `mongoose` (para sessions)
- `websocketHelper`
- `registrarLog`

**Nota:** `confirmarPorCajero` usa transacciones de MongoDB, mantener esa lógica.

### 5. `controllers/transacciones/handlers/cancelacionHandler.js`

**Funciones:**
- `cancelarTransaccionJugador(req, res)` - Líneas 511-609

**Dependencias:**
- `Transaccion` model
- `websocketHelper`
- `registrarLog`

### 6. `controllers/transacciones/handlers/rechazoHandler.js`

**Funciones:**
- `rechazarTransaccion(req, res)` - Líneas 614-680

**Dependencias:**
- `Transaccion` model
- `Jugador` model
- `websocketHelper`
- `registrarLog`

### 7. `controllers/transacciones/handlers/historialHandler.js`

**Funciones:**
- `obtenerHistorial(req, res)` - Líneas 687-718
- `obtenerEstadisticas(req, res)` - Líneas 723-757

**Dependencias:**
- `Transaccion` model

### 8. `controllers/transacciones/procesamiento/procesamientoAutomatico.js`

**Funciones:**
- `_procesarTransaccionInterna(datosTransaccion, session, usuarioId)` - Función interna extraída
- `procesarTransaccionAutomatica(req, res)` - Endpoint HTTP que usa la función interna

**Dependencias:**
- `Transaccion` model
- `Jugador` model
- `mongoose` (para sessions)
- `registrarLog`

**Estructura:**
```javascript
/**
 * Función interna para procesar transacciones automáticas
 * Puede ser llamada desde HTTP o desde otras funciones auxiliares
 */
async function _procesarTransaccionInterna(datosTransaccion, session, usuarioId = null) {
  const { jugadorId, tipo, categoria, monto, descripcion, referenciaExterna, metadata } = datosTransaccion;
  
  // Validaciones
  // Verificar jugador
  // Calcular saldo
  // Crear transacción
  // Actualizar saldo
  // Registrar log
  
  return {
    exito: true,
    transaccion: { /* ... */ },
    saldoAnterior,
    saldoNuevo,
  };
}

/**
 * Endpoint HTTP para procesar transacciones automáticas
 */
async function procesarTransaccionAutomatica(req, res) {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    const resultado = await _procesarTransaccionInterna(
      req.body,
      session,
      req.user?._id
    );
    await session.commitTransaction();
    res.json(resultado);
  } catch (error) {
    await session.abortTransaction();
    res.status(500).json({ exito: false, mensaje: error.message });
  } finally {
    await session.endSession();
  }
}

module.exports = {
  procesarTransaccionAutomatica,
  _procesarTransaccionInterna, // Exportar para uso interno
};
```

### 9. `controllers/transacciones/procesamiento/reembolsos.js`

**Funciones:**
- `procesarReembolso(jugadorId, monto, motivo, referenciaExterna, metadata)` - Líneas 1034-1104
- `procesarReembolsosMasivos(jugadores, monto, motivo, referenciaExterna, metadata)` - Líneas 1110-1146

**Dependencias:**
- `_procesarTransaccionInterna` desde `procesamientoAutomatico.js`
- `mongoose` (para sessions)

**Estructura:**
```javascript
const { _procesarTransaccionInterna } = require("./procesamientoAutomatico");
const mongoose = require("mongoose");

async function procesarReembolso(jugadorId, monto, motivo, referenciaExterna, metadata) {
  const session = await mongoose.startSession();
  try {
    await session.startTransaction();
    
    const datosTransaccion = {
      jugadorId,
      tipo: "credito",
      categoria: "reembolso",
      monto: Number(monto),
      descripcion: motivo,
      referenciaExterna,
      metadata: {
        procesadoPor: "backend",
        tipoOperacion: "reembolso_automatico",
        ...metadata,
      },
    };
    
    const resultado = await _procesarTransaccionInterna(
      datosTransaccion,
      session,
      metadata.usuarioAccion || null
    );
    
    await session.commitTransaction();
    
    return {
      exito: true,
      monto,
      referencia: resultado.transaccion?.referencia,
      saldoAnterior: resultado.saldoAnterior,
      saldoNuevo: resultado.saldoNuevo,
      transaccionId: resultado.transaccion?._id,
      descripcion: motivo,
    };
  } catch (error) {
    await session.abortTransaction();
    return {
      exito: false,
      error: error.message,
      monto,
      jugadorId,
    };
  } finally {
    await session.endSession();
  }
}

async function procesarReembolsosMasivos(jugadores, monto, motivo, referenciaExterna, metadata) {
  // ... código extraído
  // Llamar a procesarReembolso (sin this.)
}

module.exports = {
  procesarReembolso,
  procesarReembolsosMasivos,
};
```

## Clase Principal Refactorizada

El nuevo `transaccionController.js` será un archivo que re-exporta todas las funciones:

```javascript
/**
 * Controlador de transacciones
 * Refactorizado: Handlers extraídos a módulos separados
 */

// Importar handlers
const { crearSolicitudCajero } = require("./transacciones/handlers/solicitudHandler");
const { obtenerCajerosDisponibles, asignarCajero } = require("./transacciones/handlers/asignacionHandler");
const { obtenerTransaccionesCajero, obtenerPendientesCajero, obtenerEstadoTransaccion } = require("./transacciones/handlers/consultaHandler");
const { confirmarPagoUsuario, confirmarPorCajero } = require("./transacciones/handlers/confirmacionHandler");
const { cancelarTransaccionJugador } = require("./transacciones/handlers/cancelacionHandler");
const { rechazarTransaccion } = require("./transacciones/handlers/rechazoHandler");
const { obtenerHistorial, obtenerEstadisticas } = require("./transacciones/handlers/historialHandler");
const { procesarTransaccionAutomatica } = require("./transacciones/procesamiento/procesamientoAutomatico");
const { procesarReembolso, procesarReembolsosMasivos } = require("./transacciones/procesamiento/reembolsos");

// Re-exportar todas las funciones para compatibilidad
exports.crearSolicitudCajero = crearSolicitudCajero;
exports.obtenerCajerosDisponibles = obtenerCajerosDisponibles;
exports.obtenerTransaccionesCajero = obtenerTransaccionesCajero;
exports.obtenerPendientesCajero = obtenerPendientesCajero;
exports.asignarCajero = asignarCajero;
exports.confirmarPagoUsuario = confirmarPagoUsuario;
exports.confirmarPorCajero = confirmarPorCajero;
exports.cancelarTransaccionJugador = cancelarTransaccionJugador;
exports.rechazarTransaccion = rechazarTransaccion;
exports.obtenerHistorial = obtenerHistorial;
exports.obtenerEstadisticas = obtenerEstadisticas;
exports.procesarTransaccionAutomatica = procesarTransaccionAutomatica;
exports.obtenerEstadoTransaccion = obtenerEstadoTransaccion;
exports.procesarReembolso = procesarReembolso;
exports.procesarReembolsosMasivos = procesarReembolsosMasivos;
```

## Archivos a Modificar

1. **Crear:** `controllers/transacciones/handlers/solicitudHandler.js`
2. **Crear:** `controllers/transacciones/handlers/asignacionHandler.js`
3. **Crear:** `controllers/transacciones/handlers/consultaHandler.js`
4. **Crear:** `controllers/transacciones/handlers/confirmacionHandler.js`
5. **Crear:** `controllers/transacciones/handlers/cancelacionHandler.js`
6. **Crear:** `controllers/transacciones/handlers/rechazoHandler.js`
7. **Crear:** `controllers/transacciones/handlers/historialHandler.js`
8. **Crear:** `controllers/transacciones/procesamiento/procesamientoAutomatico.js`
9. **Crear:** `controllers/transacciones/procesamiento/reembolsos.js`
10. **Modificar:** `controllers/transaccionController.js` - Refactorizar para re-exportar desde handlers

## Compatibilidad

- La interfaz pública se mantiene intacta (todas las funciones exportadas)
- `routes/transacciones.js` no requiere cambios
- `controllers/salasController.js` no requiere cambios (usa `procesarReembolso` y `procesarReembolsosMasivos`)
- Todos los endpoints HTTP funcionan igual

## Consideraciones Especiales

### 1. Función `procesarReembolso` y dependencia circular

**Problema:** `procesarReembolso` actualmente llama a `this.procesarTransaccionAutomatica` usando un mock de req/res.

**Solución:** 
- Extraer la lógica de `procesarTransaccionAutomatica` a una función interna `_procesarTransaccionInterna(datosTransaccion, session, usuarioId)` en `procesamientoAutomatico.js`
- `procesarTransaccionAutomatica` (endpoint HTTP) llama a `_procesarTransaccionInterna`
- `procesarReembolso` también llama a `_procesarTransaccionInterna` directamente, sin pasar por HTTP

### 2. Logs de debug en `procesarTransaccionAutomatica`

El archivo tiene muchos `console.log("🔍 [DEBUG] ...")`. Mantenerlos por ahora para no romper el debugging, pero se pueden limpiar en una refactorización futura.

### 3. Función `procesarReembolsosMasivos` y `this.procesarReembolso`

**Problema:** `procesarReembolsosMasivos` llama a `this.procesarReembolso`.

**Solución:** Importar `procesarReembolso` desde el mismo módulo (sin `this.`).

## Pasos de Implementación

1. Crear estructura de carpetas `controllers/transacciones/handlers/` y `controllers/transacciones/procesamiento/`
2. Extraer `solicitudHandler.js` y probar endpoint
3. Extraer `asignacionHandler.js` y probar endpoints
4. Extraer `consultaHandler.js` y probar endpoints
5. Extraer `confirmacionHandler.js` y probar endpoints (importante: transacciones de BD)
6. Extraer `cancelacionHandler.js` y probar endpoint
7. Extraer `rechazoHandler.js` y probar endpoint
8. Extraer `historialHandler.js` y probar endpoints
9. Extraer `procesamientoAutomatico.js` con función interna `_procesarTransaccionInterna`
10. Extraer `reembolsos.js` usando `_procesarTransaccionInterna`
11. Refactorizar `transaccionController.js` para re-exportar desde handlers
12. Verificar que todas las rutas funcionan correctamente
13. Verificar que `salasController.js` puede usar `procesarReembolso` y `procesarReembolsosMasivos`

## Notas Importantes

- Seguir el patrón de `depositoController.js` y `socketManager.js` para consistencia
- Mantener todas las exportaciones para compatibilidad
- Las funciones auxiliares (`procesarReembolso`, `procesarReembolsosMasivos`) deben seguir siendo exportadas desde el controlador principal
- No cambiar la lógica de negocio, solo reorganizar el código
- Mantener todos los logs y mensajes de error existentes
- Las funciones que usan `mongoose.startSession()` deben mantener esa lógica
- `procesarReembolso` debe poder llamar a la función interna de procesamiento sin pasar por HTTP
