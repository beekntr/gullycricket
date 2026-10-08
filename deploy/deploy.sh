#!/usr/bin/env bash
# Build the site and publish it to the nginx web root. Run on the server from the repo checkout:
#   ./deploy/deploy.sh
# Safe to re-run for every update: pulls main, rebuilds, and replaces the files in the web root.
set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/var/www/gullycricket}"
NODE_IMAGE="${NODE_IMAGE:-node:22-alpine}"

cd "$(dirname "$0")/.."
git pull --ff-only

# Build in a throwaway Node container, so the host's Node version (and the pm2 apps that rely on it)
# is never touched. Falls back to the host's Node (needs 20.19+) if Docker isn't available.
if command -v docker >/dev/null 2>&1; then
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    --env HOME=/tmp \
    --volume "$PWD":/app \
    --workdir /app \
    "$NODE_IMAGE" \
    sh -c 'npm ci --no-audit --no-fund && npm run build'
else
  npm ci --no-audit --no-fund
  npm run build
fi

mkdir -p "$WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT/"
echo "Deployed $(git rev-parse --short HEAD) to $WEB_ROOT"
