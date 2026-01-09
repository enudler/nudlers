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

# Add user so we don't need --no-sandbox in Puppeteer
# Do this BEFORE installing packages to avoid permission issues
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser

# Install dependencies required by Chromium and noVNC in a single layer
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
    xdg-utils \
    chromium \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    openbox \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean \
    && rm -rf /var/cache/apt/archives/*

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROME_PATH=/usr/lib/chromium/

# Copy standalone build output with proper ownership (avoids extra chown layer)
# The standalone output includes only production node_modules
COPY --from=builder --chown=pptruser:pptruser /app/.next/standalone ./
COPY --from=builder --chown=pptruser:pptruser /app/.next/static ./.next/static
COPY --from=builder --chown=pptruser:pptruser /app/public ./public

# Create startup script with optional noVNC support
# Set ENABLE_VNC=true to enable browser debugging via web interface on port 6080
RUN echo '#!/bin/sh\n\
export DISPLAY=:99\n\
\n\
# Start Xvfb with larger resolution for browser debugging\n\
Xvfb :99 -screen 0 1920x1080x24 &\n\
sleep 1\n\
\n\
# If VNC is enabled, start openbox window manager, x11vnc, and noVNC\n\
if [ "$ENABLE_VNC" = "true" ]; then\n\
    echo "Starting VNC server for browser debugging..."\n\
    # Start a simple window manager\n\
    openbox &\n\
    # Start VNC server (no password for simplicity, use with caution)\n\
    x11vnc -display :99 -forever -shared -nopw -rfbport 5900 &\n\
    # Start noVNC web server (access at http://localhost:6080/vnc.html)\n\
    /usr/share/novnc/utils/novnc_proxy --vnc localhost:5900 --listen 6080 &\n\
    echo "noVNC available at http://localhost:6080/vnc.html"\n\
fi\n\
\n\
export PUPPETEER_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu --disable-software-rasterizer --disable-extensions"\n\
exec node server.js' > /app/start.sh && \
    chmod +x /app/start.sh && \
    chown pptruser:pptruser /app/start.sh

# Switch to non-root user
USER pptruser

# Expose app port and optional noVNC port
EXPOSE 3000
EXPOSE 6080

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["/app/start.sh"]
