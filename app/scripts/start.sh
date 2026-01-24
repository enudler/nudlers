#!/bin/bash
set -e

# =============================================================================
# Entrypoint script that handles permissions and drops privileges
# =============================================================================

APP_USER="pptruser"
APP_GROUP="pptruser"
DATA_DIR="/app/.wwebjs_auth"

# Function to clean up stale Chromium lock files
# These can persist if the container crashes or is forcefully stopped
cleanup_stale_locks() {
    echo "Cleaning up stale Chromium lock files..."
    find "$DATA_DIR" -name "SingletonLock" -delete 2>/dev/null || true
    find "$DATA_DIR" -name "SingletonCookie" -delete 2>/dev/null || true
    find "$DATA_DIR" -name "SingletonSocket" -delete 2>/dev/null || true
    # Also clean up any leftover Chrome/Chromium lock files
    find "$DATA_DIR" -name ".org.chromium.Chromium.*" -delete 2>/dev/null || true
    find "$DATA_DIR" -name "lockfile" -delete 2>/dev/null || true
}

# Function to start Xvfb and the app
start_app() {
    echo "Starting Xvfb..."
    export DISPLAY=:99
    Xvfb :99 -screen 0 1920x1080x24 &
    sleep 1

    echo "Starting Nudlers app..."
    exec node server.js
}

# If running as root, fix permissions and re-exec as pptruser
if [ "$(id -u)" = "0" ]; then
    echo "Running as root - fixing permissions on $DATA_DIR..."

    # Create data directory if it doesn't exist
    mkdir -p "$DATA_DIR"

    # Clean up stale lock files before fixing permissions
    cleanup_stale_locks

    # Fix ownership of the data directory
    chown -R "$APP_USER:$APP_GROUP" "$DATA_DIR"

    echo "Dropping privileges to $APP_USER..."

    # Re-execute this script as pptruser using gosu
    exec gosu "$APP_USER" "$0" "$@"
fi

# If we get here, we're running as pptruser
echo "Running as $(whoami)"

# Also clean up locks when running as non-root (in case container started without root)
cleanup_stale_locks

start_app
