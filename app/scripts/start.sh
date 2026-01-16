#!/bin/bash
set -e

# Start Xvfb for Puppeteer
echo "Starting Xvfb..."
export DISPLAY=:99
Xvfb :99 -screen 0 1920x1080x24 &

# Give Xvfb a moment to start
sleep 1

# Give Xvfb a moment to start
sleep 1

# Start the main application
echo "Starting Nudlers app..."
exec node server.js
