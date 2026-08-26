#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

caddy_version="${CADDY_VERSION:-v2.11.3}"
duckdns_version="${DUCKDNS_VERSION:-v0.5.0}"
output_path="${CADDY_OUTPUT:-build/caddy}"

if ! command -v xcaddy >/dev/null 2>&1; then
	printf 'build-caddy: xcaddy is required\n' >&2
	exit 1
fi

mkdir -p "$(dirname -- "$output_path")"
GOOS=linux GOARCH=arm64 xcaddy build "$caddy_version" \
	--with "github.com/caddy-dns/duckdns@${duckdns_version}" \
	--output "$output_path"

printf 'build-caddy: wrote linux/arm64 binary to %s\n' "$output_path"
