#!/usr/bin/env bash
# Builds a deployable release: compiles every package, builds both client
# SPAs against their production base path (/table/, /player/ — see each
# vite.config.ts), and stages the client bundles under packages/server/public
# so the running server can serve them same-origin (docs/research/pi-hosting-and-lan-https.md
# §3.4 "build TS locally, ship JS"; ticket 34).
#
# Usage: npm run build:release
#
# Afterwards, packages/server/{dist,public,package.json} plus the workspace's
# node_modules is what you rsync to the Pi — see docs/deploy-pi.md.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo "==> Building every package (tsc)"
npm run build

echo "==> Building table-client (base: /table/)"
npm run -w @table-top-poker/table-client build:app

echo "==> Building player-client (base: /player/)"
npm run -w @table-top-poker/player-client build:app

echo "==> Staging client builds into packages/server/public"
rm -rf packages/server/public/table packages/server/public/player
mkdir -p packages/server/public/table packages/server/public/player
cp -r packages/table-client/build/. packages/server/public/table/
cp -r packages/player-client/build/. packages/server/public/player/

echo "==> Release staged. packages/server/{dist,public,package.json} is what to deploy."
