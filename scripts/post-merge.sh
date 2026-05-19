#!/bin/bash
set -e

if [ -f "package.json" ]; then
  pnpm install --prefer-offline 2>/dev/null || true
fi

echo "Post-merge setup complete."
