#!/usr/bin/env bash
# Builds a deployable release: compiles every package, builds both client
# SPAs against their production base path (/table/, /player/ — see each
# vite.config.ts), and stages the client bundles under packages/server/public
# so the running server can serve them same-origin (docs/research/pi-hosting-and-lan-https.md
# §3.4 "build TS locally, ship JS"; ticket 34).
#
# Usage: npm run build:release
#
# Afterwards, .release/ is the self-contained deployable unit —
# see docs/deploy-pi.md.
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

echo "==> Staging self-contained server release"
release_dir=.release
rm -rf "$release_dir"
mkdir -p "$release_dir/packages/server"
cp -a packages/server/dist packages/server/public packages/server/package.json "$release_dir/packages/server/"
# npm workspaces represent local packages as symlinks. Dereference them so
# the release does not depend on the source checkout existing on the Pi.
rsync -aL node_modules/ "$release_dir/node_modules/"

echo "==> Verifying deployable runtime imports"
node --input-type=module -e \
  'await import("./.release/packages/server/dist/app.js")'

echo "==> Release staged at .release/"
