#!/usr/bin/env bash
# Build the site and publish it to the nginx web root. Run on the server from the repo checkout:
#   ./deploy/deploy.sh
# Safe to re-run for every update: pulls main, rebuilds, and replaces the files in the web root.
set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/var/www/gullycricket}"
NODE_IMAGE="${NODE_IMAGE:-node:24-alpine}"
# npm's cache and logs live on the host, so rebuilds are quicker and a failed install leaves its log.
NPM_CACHE="${NPM_CACHE:-$HOME/.cache/gullycricket-npm}"

cd "$(dirname "$0")/.."
git pull --ff-only

# Build in a throwaway Node container, so the host's Node version (and the pm2 apps that rely on it)
# is never touched. It uses the host's network, which avoids Docker bridge/DNS trouble when npm
# downloads packages. Falls back to the host's Node (needs 20.19+) if Docker isn't available.
if command -v docker >/dev/null 2>&1; then
  mkdir -p "$NPM_CACHE"
  docker run --rm \
    --network host \
    --user "$(id -u):$(id -g)" \
    --env HOME=/tmp \
    --env npm_config_cache=/npm-cache \
    --volume "$NPM_CACHE":/npm-cache \
    --volume "$PWD":/app \
    --workdir /app \
    "$NODE_IMAGE" \
    sh -c 'npm ci --no-audit --no-fund && npm run build' ||
    { echo "Build failed. npm's log is in $NPM_CACHE/_logs/" >&2; exit 1; }
else
  npm ci --no-audit --no-fund
  npm run build
fi

mkdir -p "$WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT/"
echo "Deployed $(git rev-parse --short HEAD) to $WEB_ROOT"
