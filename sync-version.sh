#!/bin/bash
# Sync package.json version with the latest Git tag

# Get the latest Git tag (remove 'v' prefix if present)
LATEST_TAG=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//')

if [ -z "$LATEST_TAG" ]; then
  echo "No Git tags found. Skipping version sync."
  exit 0
fi

echo "Latest Git tag: v$LATEST_TAG"

# Update package.json version in the app directory
cd app
npm version "$LATEST_TAG" --no-git-tag-version --allow-same-version

echo "✅ Synced package.json version to $LATEST_TAG"
