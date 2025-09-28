# WebSocket - Sistema de Depósitos

## 📋 Descripción General

El sistema de depósitos WebSocket permite la comunicación en tiempo real entre jugadores y cajeros para el procesamiento de depósitos, eliminando la necesidad de polling y proporcionando una experiencia fluida.

## 🏗️ Arquitectura

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   App Depósitos │    │  WebSocket       │    │   App Cajeros   │
│   (Telegram)    │◄──►│  Controller      │◄──►│   (Web)         │
│                 │    │  (Depósitos)     │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   Base de Datos  │
                       │   (Transacciones)│
                       └──────────────────┘
```

## 🔄 Flujo de Trabajo

### **Paso 1: Solicitud de Depósito**
1. **Jugador** se conecta y autentica via WebSocket
2. **Jugador** envía evento `solicitar-deposito`
3. **Sistema** crea transacción en BD (estado: `pendiente`)
4. **Sistema** notifica a todos los cajeros conectados

### **Paso 2: Aceptación por Cajero**
1. **Cajero** recibe notificación `nueva-solicitud-deposito`
2. **Cajero** envía evento `aceptar-solicitud`
3. **Sistema** asigna cajero a la transacción (estado: `en_proceso`)
4. **Sistema** envía datos bancarios al jugador

### **Paso 3: Confirmación de Pago**
1. **Jugador** recibe datos bancarios y hace el pago
2. **Jugador** envía evento `confirmar-pago-jugador`
3. **Sistema** actualiza información de pago
4. **Sistema** notifica al cajero para verificación

### **Paso 4: Verificación por Cajero**
1. **Cajero** recibe notificación `verificar-pago`
2. **Cajero** verifica el pago en su cuenta
3. **Cajero** envía evento `verificar-pago-cajero`
4. **Sistema** procesa saldo y completa transacción

## 📡 Eventos WebSocket

### **Eventos del Jugador**

#### `solicitar-deposito`
**Descripción:** Jugador solicita un depósito
**Datos:**
```javascript
{
  monto: 100,
  metodoPago: "pago_movil",
  descripcion: "Depósito para jugar"
}
```
**Respuesta:** `solicitud-creada`

#### `confirmar-pago-jugador`
**Descripción:** Jugador confirma que realizó el pago
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0",
  datosPago: {
    bancoOrigen: "Mercantil",
    telefonoOrigen: "0414-9876543",
    numeroReferencia: "REF123456",
    fechaPago: "2025-01-28"
  }
}
```
**Respuesta:** `pago-confirmado`

### **Eventos del Cajero**

#### `aceptar-solicitud`
**Descripción:** Cajero acepta una solicitud de depósito
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0"
}
```
**Respuesta:** `solicitud-aceptada`

#### `verificar-pago-cajero`
**Descripción:** Cajero verifica y confirma/rechaza el pago
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0",
  confirmado: true,
  notas: "Pago verificado correctamente"
}
```
**Respuesta:** `deposito-completado` o `deposito-rechazado`

### **Eventos del Sistema**

#### `nueva-solicitud-deposito`
**Descripción:** Notificación a cajeros sobre nueva solicitud
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0",
  jugador: {
    id: "64f8a1b2c3d4e5f6a7b8c9d1",
    telegramId: "123456789",
    nombre: "Usuario"
  },
  monto: 100,
  metodoPago: "pago_movil",
  descripcion: "Depósito para jugar",
  timestamp: "2025-01-28T15:30:00Z"
}
```

#### `solicitud-aceptada`
**Descripción:** Notificación al jugador con datos bancarios
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0",
  cajero: {
    id: "64f8a1b2c3d4e5f6a7b8c9d2",
    nombre: "Luis Torres",
    telefono: "0412-1234567",
    datosPago: {
      banco: "Banesco",
      cedula: {
        prefijo: "V",
        numero: "12345678"
      },
      telefono: "0412-1234567"
    }
  },
  monto: 100,
  timestamp: "2025-01-28T15:30:00Z"
}
```

#### `verificar-pago`
**Descripción:** Notificación al cajero para verificar pago
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0",
  jugador: {
    id: "64f8a1b2c3d4e5f6a7b8c9d1",
    telegramId: "123456789",
    nombre: "Usuario"
  },
  monto: 100,
  datosPago: {
    bancoOrigen: "Mercantil",
    telefonoOrigen: "0414-9876543",
    numeroReferencia: "REF123456"
  },
  timestamp: "2025-01-28T15:30:00Z"
}
```

#### `deposito-completado`
**Descripción:** Notificación de depósito completado
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0",
  monto: 100,
  saldoAnterior: 50,
  saldoNuevo: 150,
  mensaje: "¡Depósito completado exitosamente! Gracias por tu confianza.",
  timestamp: "2025-01-28T15:30:00Z"
}
```

#### `deposito-rechazado`
**Descripción:** Notificación de depósito rechazado
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0",
  monto: 100,
  motivo: "Pago no verificado",
  timestamp: "2025-01-28T15:30:00Z"
}
```

## 🔧 Implementación Técnica

### **Archivos Principales**
- `websocket/depositoController.js` - Controlador principal
- `websocket/socketManager.js` - Gestor de conexiones
- `models/Transaccion.js` - Modelo de datos

### **Dependencias**
- Socket.IO para WebSockets
- MongoDB para persistencia
- JWT para autenticación de cajeros
- Telegram Web Apps para autenticación de jugadores

### **Estados de Transacción**
- `pendiente` - Recién creada, esperando cajero
- `en_proceso` - Asignada a cajero, esperando pago
- `confirmada` - Pago verificado por cajero
- `completada` - Saldo actualizado, proceso terminado
- `rechazada` - Rechazada por cajero o sistema

## 🧪 Testing

### **Pruebas Manuales**
1. **Conexión:** Verificar que jugador y cajero se conecten
2. **Solicitud:** Crear solicitud de depósito
3. **Notificación:** Verificar que cajeros reciban notificación
4. **Aceptación:** Cajero acepta solicitud
5. **Datos bancarios:** Jugador recibe datos del cajero
6. **Confirmación:** Jugador confirma pago
7. **Verificación:** Cajero verifica y confirma
8. **Completado:** Verificar actualización de saldo

### **Logs a Monitorear**
- `💰 [DEPOSITO] Nueva solicitud de depósito`
- `✅ [DEPOSITO] Transacción creada`
- `📢 [DEPOSITO] Notificación enviada a X cajeros`
- `🏦 [DEPOSITO] Cajero X asignado a transacción`
- `✅ [DEPOSITO] Depósito completado`

## 🚨 Manejo de Errores

### **Errores Comunes**
- **Jugador no autenticado:** Verificar autenticación WebSocket
- **Cajero no disponible:** Verificar estado del cajero
- **Transacción no encontrada:** Verificar ID de transacción
- **Estado inválido:** Verificar flujo de estados

### **Recuperación**
- Reconexión automática de WebSocket
- Reintento de eventos fallidos
- Logs detallados para debugging

## 📈 Métricas

### **Métricas a Monitorear**
- Tiempo promedio de procesamiento
- Número de cajeros conectados
- Solicitudes pendientes
- Tasa de éxito/fallo
- Latencia de notificaciones

## 🔮 Próximos Pasos

1. **Paso 2:** Integración con controladores HTTP
2. **Paso 3:** Sistema de rooms para cajeros
3. **Paso 4:** Dashboard en tiempo real
4. **Integración:** Apps de depósitos y cajeros
