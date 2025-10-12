# Dockerfile para producción en Fly.io
FROM node:18-alpine

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copiar solo package files primero (mejor aprovechamiento del cache)
COPY --chown=nodejs:nodejs package*.json ./

# Instalar dependencias de producción
RUN npm install --only=production && \
    npm cache clean --force

# Copiar código fuente
COPY --chown=nodejs:nodejs . .

# Cambiar a usuario no-root
USER nodejs

# Fly.io asigna el puerto dinámicamente via variable PORT
# Por defecto usamos 3000 pero Fly.io lo sobrescribirá
EXPOSE 3000

# Health check optimizado para Fly.io
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Comando de inicio
CMD ["npm", "start"]