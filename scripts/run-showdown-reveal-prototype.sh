#!/usr/bin/env bash
set -euo pipefail

prototype_port="$({
  node -e '
    const probe = require("node:net").createServer();
    probe.listen(0, "0.0.0.0", () => {
      const address = probe.address();
      if (!address || typeof address === "string") process.exit(1);
      probe.close(() => console.log(address.port));
    });
  '
})"

exec npm run dev --workspace @table-top-poker/table-client -- \
  --host 0.0.0.0 \
  --port "$prototype_port" \
  --strictPort \
  --open /prototype/showdown-reveal
