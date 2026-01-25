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

# Function to get Node.js memory options based on environment
get_node_options() {
    # Default: 512MB heap for low-resource NAS, 2GB for normal operation
    if [ "$LOW_RESOURCES_MODE" = "true" ]; then
        # Ultra-low resource mode uses even less memory
        if [ "$ULTRA_LOW_RESOURCES_MODE" = "true" ]; then
            echo "--max-old-space-size=384"
        else
            echo "--max-old-space-size=512"
        fi
    else
        echo "--max-old-space-size=2048"
    fi
}

# Function to start Xvfb and the app
start_app() {
    echo "Starting Xvfb with minimal settings..."
    export DISPLAY=:99
    # Use smaller virtual screen for low-resource mode
    if [ "$LOW_RESOURCES_MODE" = "true" ]; then
        Xvfb :99 -screen 0 1280x720x16 -nolisten tcp &
    else
        Xvfb :99 -screen 0 1920x1080x24 &
    fi
    sleep 1

    # Set Node.js memory options based on resource mode
    export NODE_OPTIONS="$(get_node_options)"
    echo "Starting Nudlers app with NODE_OPTIONS=$NODE_OPTIONS..."
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
