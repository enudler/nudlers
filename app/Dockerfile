# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:22-slim AS deps

WORKDIR /app

# Copy only package files first for better layer caching
COPY package.json package-lock.json* yarn.lock* ./

# Install dependencies (use npm ci for reproducible builds)
RUN npm ci

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:22-slim AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# =============================================================================
# Stage 3: Production
# =============================================================================
FROM node:22-slim AS runner

WORKDIR /app

# Install dependencies required by Chromium in a single layer
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    chromium \
    xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Add user so we don't need --no-sandbox in Puppeteer
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROME_PATH=/usr/lib/chromium/

# Copy only production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js

# Set ownership
RUN chown -R pptruser:pptruser /app

# Create startup script
RUN echo '#!/bin/sh\n\
export DISPLAY=:99\n\
Xvfb :99 -screen 0 1024x768x16 &\n\
sleep 1\n\
export PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --headless --disable-software-rasterizer --disable-extensions --single-process"\n\
exec npm start' > /app/start.sh && \
    chmod +x /app/start.sh && \
    chown pptruser:pptruser /app/start.sh

# Switch to non-root user
USER pptruser

EXPOSE 3000

CMD ["/app/start.sh"]
