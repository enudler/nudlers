# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:22-alpine AS deps

WORKDIR /app

# Prevent Puppeteer from downloading Chromium during npm install
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy only package files and patches for better layer caching
COPY package.json package-lock.json* yarn.lock* ./
COPY patches ./patches

# Install dependencies
RUN npm ci

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm run build

# =============================================================================
# Stage 3: Runner
# =============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Install runtime dependencies and create user in a single layer to minimize size
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    xvfb \
    bash \
    && addgroup -S pptruser && adduser -S -G pptruser pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser

# Copy standalone build output with proper ownership
COPY --from=builder --chown=pptruser:pptruser /app/.next/standalone ./
COPY --from=builder --chown=pptruser:pptruser /app/.next/static ./.next/static
COPY --from=builder --chown=pptruser:pptruser /app/public ./public
COPY --from=builder --chown=pptruser:pptruser /app/scrapers ./scrapers
COPY --from=builder --chown=pptruser:pptruser /app/scripts ./scripts

# Create startup script
RUN printf '#!/bin/bash\n\
export DISPLAY=:99\n\
Xvfb :99 -screen 0 1920x1080x24 &\n\
sleep 1\n\
\n\
# Start background scheduler\n\
echo "Starting background scheduler..."\n\
node scripts/background-scheduler.js &\n\
\n\
exec node server.js' > /app/start.sh && \
    chmod +x /app/start.sh && \
    chown pptruser:pptruser /app/start.sh

# Switch to non-root user
USER pptruser

# Expose app port
EXPOSE 3000

CMD ["/app/start.sh"]
