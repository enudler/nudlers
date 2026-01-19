# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM node:22-bookworm-slim AS deps

WORKDIR /app

# Prevent Puppeteer from downloading Chromium during npm install if we want to manage it manually
# However, for Chrome for Testing, we might want it to download during install or later.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy only package files and patches (if they exist) for better layer caching
COPY package.json package-lock.json* yarn.lock* ./
COPY patches* ./patches/

# Install dependencies
RUN npm ci

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM node:22-bookworm-slim AS builder

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
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PORT=3000 \
    HOSTNAME="0.0.0.0"

# Install runtime dependencies for Chrome/Puppeteer on Debian
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
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
    xvfb \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome for Testing using Puppeteer's utility
RUN npx @puppeteer/browsers install chrome@stable --path /opt/chrome && \
    chmod -R 755 /opt/chrome

# Set the executable path to the downloaded Chrome for Testing
# The path structure is /opt/chrome/chrome/<platform>-<version>/chrome-linux64/chrome
RUN CHROME_PATH=$(find /opt/chrome -name chrome -type f -executable | head -n 1) && \
    echo "export PUPPETEER_EXECUTABLE_PATH=$CHROME_PATH" >> /etc/environment && \
    ln -s $CHROME_PATH /usr/bin/google-chrome-for-testing

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-for-testing

# Create a non-root user
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser /app /opt/chrome

# Copy standalone build output and scripts with proper ownership
COPY --from=builder --chown=pptruser:pptruser /app/.next/standalone ./
COPY --from=builder --chown=pptruser:pptruser /app/.next/static ./.next/static
COPY --from=builder --chown=pptruser:pptruser /app/public ./public
COPY --from=builder --chown=pptruser:pptruser /app/scrapers ./scrapers
# Copy scripts directory from source (not from standalone build)
COPY --chown=pptruser:pptruser scripts ./scripts
COPY --from=builder --chown=pptruser:pptruser /app/utils ./utils
COPY --from=builder --chown=pptruser:pptruser /app/pages ./pages

# Ensure startup script is executable
RUN chmod +x /app/scripts/start.sh

# Switch to non-root user
USER pptruser

# Expose app port
EXPOSE 3000

# Use tini as the entrypoint to handle signals and zombie processes
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["/app/scripts/start.sh"]
