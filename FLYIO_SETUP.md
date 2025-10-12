# Configuración de Variables de Entorno para Fly.io

## Backend (elpatio-backend)

Ejecuta estos comandos desde el directorio `elpatio-backend`:

```bash
# Variables obligatorias
fly secrets set NODE_ENV=production
fly secrets set PORT=3000
fly secrets set MONGODB_URI="mongodb+srv://usuario:password@cluster.mongodb.net/elpatio"
fly secrets set JWT_SECRET="tu_jwt_secret_seguro"
fly secrets set JWT_EXPIRES_IN="24h"

# CORS - Permitir miniapps de Vercel
fly secrets set CORS_ORIGIN="https://elpatio-miniapps.vercel.app,https://tu-dominio.vercel.app"

# Opcionales (si las usas)
# fly secrets set BOT_TOKEN="tu_bot_token"
# fly secrets set MERCADOPAGO_ACCESS_TOKEN="tu_token"
# fly secrets set MERCADOPAGO_PUBLIC_KEY="tu_key"
```

## Verificar secrets configurados

```bash
fly secrets list
```

## Eliminar un secret (si es necesario)

```bash
fly secrets unset VARIABLE_NAME
```

## Notas

- Los secrets se encriptan y no se pueden leer después de configurarlos
- Cada cambio de secret reinicia la aplicación automáticamente
- Para MongoDB Atlas, asegúrate de permitir la IP de Fly.io en Atlas Network Access
  (o permite 0.0.0.0/0 para simplificar en desarrollo)
