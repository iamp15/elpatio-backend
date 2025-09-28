# WebSocket Events - Lista Completa

## 📡 Eventos de Autenticación

### `authenticate-jugador`
**Descripción:** Autenticar jugador usando datos de Telegram
**Datos:**
```javascript
{
  telegramId: 123456789,
  initData: "user=%7B%22id%22%3A123456789%7D&auth_date=1234567890&hash=abc123"
}
```
**Respuesta:** `auth-result`

### `authenticate-cajero`
**Descripción:** Autenticar cajero usando JWT
**Datos:**
```javascript
{
  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
**Respuesta:** `auth-result`

### `auth-result`
**Descripción:** Resultado de autenticación
**Datos:**
```javascript
{
  success: true,
  message: "Autenticación exitosa",
  user: {
    id: "64f8a1b2c3d4e5f6a7b8c9d0",
    nombre: "Usuario",
    email: "usuario@ejemplo.com"
  }
}
```

## 💰 Eventos de Depósitos

### `solicitar-deposito`
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

### `solicitud-creada`
**Descripción:** Confirmación de solicitud creada
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0",
  referencia: "DEPOSITO_64f8a1b2c3d4e5f6a7b8c9d0_1759089087362_abc12",
  monto: 100,
  estado: "pendiente",
  timestamp: "2025-01-28T15:30:00Z"
}
```

### `nueva-solicitud-deposito`
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

### `aceptar-solicitud`
**Descripción:** Cajero acepta una solicitud
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0"
}
```
**Respuesta:** `solicitud-aceptada`

### `solicitud-aceptada`
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

### `confirmar-pago-jugador`
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

### `pago-confirmado`
**Descripción:** Confirmación de pago registrado
**Datos:**
```javascript
{
  transaccionId: "64f8a1b2c3d4e5f6a7b8c9d0",
  estado: "esperando_verificacion",
  timestamp: "2025-01-28T15:30:00Z"
}
```

### `verificar-pago`
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

### `verificar-pago-cajero`
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

### `deposito-completado`
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

### `deposito-rechazado`
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

## 🔄 Eventos de Sistema

### `connect`
**Descripción:** Cliente conectado
**Datos:** Información de conexión automática

### `disconnect`
**Descripción:** Cliente desconectado
**Datos:** Razón de desconexión

### `error`
**Descripción:** Error en WebSocket
**Datos:**
```javascript
{
  message: "Descripción del error",
  details: "Detalles adicionales (opcional)"
}
```

## 📊 Eventos de Estadísticas (Futuro)

### `get-stats`
**Descripción:** Solicitar estadísticas del sistema
**Datos:** Ninguno
**Respuesta:** `stats-response`

### `stats-response`
**Descripción:** Estadísticas del sistema
**Datos:**
```javascript
{
  jugadoresConectados: 5,
  cajerosConectados: 2,
  totalConexiones: 7,
  solicitudesPendientes: 3
}
```

## 🏠 Eventos de Rooms (Futuro)

### `join-room`
**Descripción:** Unirse a una sala
**Datos:**
```javascript
{
  room: "cajeros-disponibles"
}
```

### `leave-room`
**Descripción:** Salir de una sala
**Datos:**
```javascript
{
  room: "cajeros-disponibles"
}
```

## 📱 Eventos de Estado (Futuro)

### `update-status`
**Descripción:** Actualizar estado de usuario
**Datos:**
```javascript
{
  status: "disponible" // disponible, ocupado, ausente
}
```

### `status-changed`
**Descripción:** Notificación de cambio de estado
**Datos:**
```javascript
{
  userId: "64f8a1b2c3d4e5f6a7b8c9d0",
  status: "ocupado",
  timestamp: "2025-01-28T15:30:00Z"
}
```

## 🔧 Eventos de Debug

### `ping`
**Descripción:** Ping para verificar conexión
**Datos:** Ninguno
**Respuesta:** `pong`

### `pong`
**Descripción:** Respuesta al ping
**Datos:**
```javascript
{
  timestamp: "2025-01-28T15:30:00Z"
}
```

## 📝 Notas de Implementación

### **Orden de Eventos**
1. `authenticate-jugador` o `authenticate-cajero`
2. `auth-result`
3. Eventos específicos según el tipo de usuario
4. `disconnect` al finalizar

### **Manejo de Errores**
- Todos los eventos pueden devolver `error`
- Siempre verificar `success` en respuestas
- Implementar reconexión automática

### **Validaciones**
- Verificar autenticación antes de eventos sensibles
- Validar datos requeridos
- Verificar permisos de usuario

### **Logs**
- Todos los eventos se registran en logs
- Usar prefijos para identificar origen: `[DEPOSITO]`, `[CAJERO]`, etc.
- Incluir IDs de transacción y usuario en logs
