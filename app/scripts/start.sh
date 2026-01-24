#!/bin/bash
set -e

# =============================================================================
# Entrypoint script that handles permissions and drops privileges
# =============================================================================

APP_USER="pptruser"
APP_GROUP="pptruser"
DATA_DIR="/app/.wwebjs_auth"
SCREENSHOTS_DIR="/app/public/debug/screenshots"

# Screenshot retention in days (default 7, configurable via env)
SCREENSHOT_RETENTION_DAYS="${SCREENSHOT_RETENTION_DAYS:-7}"

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

# Function to clean up old debug screenshots to prevent disk fill
cleanup_old_screenshots() {
    if [ -d "$SCREENSHOTS_DIR" ]; then
        echo "Cleaning up screenshots older than ${SCREENSHOT_RETENTION_DAYS} days..."
        find "$SCREENSHOTS_DIR" -name "*.png" -type f -mtime +${SCREENSHOT_RETENTION_DAYS} -delete 2>/dev/null || true
        # Also limit total number of screenshots to 100 most recent
        local count=$(find "$SCREENSHOTS_DIR" -name "*.png" -type f 2>/dev/null | wc -l)
        if [ "$count" -gt 100 ]; then
            echo "Too many screenshots ($count), keeping only 100 most recent..."
            find "$SCREENSHOTS_DIR" -name "*.png" -type f -printf '%T@ %p\n' 2>/dev/null | \
                sort -n | head -n -100 | cut -d' ' -f2- | xargs -r rm -f 2>/dev/null || true
        fi
    fi
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

    # Clean up old screenshots to prevent disk fill
    cleanup_old_screenshots

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
