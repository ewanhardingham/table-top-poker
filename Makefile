.PHONY: dev dev-start dev-local dev-wsl dev-wsl2 dev-tailscale dev-stop dev-restart dev-status start stop help
.DEFAULT_GOAL := help

DEV_PROFILE ?= local

dev dev-start:
	@./scripts/dev-servers.sh start "$(DEV_PROFILE)"

dev-local:
	@./scripts/dev-servers.sh start local

dev-wsl dev-wsl2:
	@./scripts/dev-servers.sh start wsl

dev-tailscale:
	@./scripts/dev-servers.sh start tailscale

dev-stop stop:
	@./scripts/dev-servers.sh stop

dev-restart:
	@./scripts/dev-servers.sh restart "$(DEV_PROFILE)"

dev-status:
	@./scripts/dev-servers.sh status

start: dev

help:
	@printf '%s\n' \
		'make dev                 Start locally (default)' \
		'make dev-local           Start on localhost' \
		'make dev-wsl             Start using the WSL2 IP address' \
		'make dev-tailscale       Start using the Tailscale address' \
		'make dev DEV_PROFILE=wsl Start with a selected profile' \
		'make dev-stop            Stop all dev servers started by this repo' \
		'make dev-restart         Restart using DEV_PROFILE' \
		'make dev-status          Show the tracked server processes' \
		'TAILSCALE_ADDRESS=...    Override the Tailscale host/IP' \
		'WSL2_ADDRESS=...         Override the WSL2 host/IP'
