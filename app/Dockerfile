# =============================================================================
# Stage 1: Dependencies
# =============================================================================
FROM --platform=linux/amd64 node:22-bookworm-slim AS deps

WORKDIR /app

# Prevent Puppeteer from downloading Chromium during npm install
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy only package files and patches (if they exist) for better layer caching
COPY package.json package-lock.json* yarn.lock* ./
COPY patches* ./patches/

# Install dependencies
RUN npm ci

# =============================================================================
# Stage 2: Builder
# =============================================================================
FROM --platform=linux/amd64 node:22-bookworm-slim AS builder

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
# Use the official Puppeteer image which includes Chrome and deps
FROM --platform=linux/amd64 ghcr.io/puppeteer/puppeteer:latest AS runner

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME="0.0.0.0" \
    LOW_RESOURCES_MODE=true

# Switch to root to install utilities and copy files
USER root

# Install Xvfb and Tini (used in start.sh and entrypoint)
RUN apt-get update && apt-get install -y xvfb tini && rm -rf /var/lib/apt/lists/*

# Copy standalone build
# Note: usage of chown to match the pptruser in the base image
COPY --from=builder --chown=pptruser:pptruser /app/.next/standalone ./
COPY --from=builder --chown=pptruser:pptruser /app/.next/static ./.next/static
COPY --from=builder --chown=pptruser:pptruser /app/public ./public
COPY --from=builder --chown=pptruser:pptruser /app/scrapers ./scrapers
COPY --chown=pptruser:pptruser scripts ./scripts
COPY --from=builder --chown=pptruser:pptruser /app/utils ./utils
COPY --from=builder --chown=pptruser:pptruser /app/pages ./pages

RUN chmod +x /app/scripts/start.sh

# Drop back to the non-root user provided by the image
USER pptruser

EXPOSE 3000

# Use tini as the entrypoint to handle signals and zombie processes
ENTRYPOINT ["/usr/bin/tini", "--"]

CMD ["/app/scripts/start.sh"]
