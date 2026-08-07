#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${DEV_SERVERS_STATE_DIR:-$repo_root/.dev}"
pid_dir="$state_dir/pids"
log_dir="$state_dir/logs"
profile_file="$state_dir/profile"

server_port=3000
table_port=5173
player_port=5174

readonly service_names=(server table player)

usage() {
  cat <<'EOF'
Usage:
  scripts/dev-servers.sh start [local|wsl|tailscale]
  scripts/dev-servers.sh stop
  scripts/dev-servers.sh restart [local|wsl|tailscale]
  scripts/dev-servers.sh status

Profiles:
  local       Bind to localhost.
  wsl         Bind externally and use the detected WSL2 address.
  tailscale   Bind externally and use TAILSCALE_ADDRESS, .env.local, or the
              local Tailscale CLI to find the browser-facing address.

Overrides:
  WSL2_ADDRESS=...          WSL2 address to advertise.
  TAILSCALE_ADDRESS=...     Tailscale hostname or IP to advertise.
  DEV_SERVERS_STATE_DIR=... Directory for PID files and logs.
EOF
}

die() {
  printf 'dev-servers: %s\n' "$*" >&2
  exit 1
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

configured_allowed_hosts() {
  if [[ -n "${DEV_ALLOWED_HOSTS:-}" ]]; then
    printf '%s' "$DEV_ALLOWED_HOSTS"
    return
  fi

  if [[ -f "$repo_root/.env.local" ]]; then
    sed -n 's/^[[:space:]]*DEV_ALLOWED_HOSTS[[:space:]]*=[[:space:]]*//p' \
      "$repo_root/.env.local" | tail -n 1 | sed 's/[[:space:]]*$//'
  fi
}

first_allowed_host() {
  local hosts="$1"
  local host
  local -a values

  IFS=',' read -r -a values <<< "$hosts"
  for host in "${values[@]}"; do
    host="$(trim "$host")"
    if [[ -n "$host" && "$host" != "*" ]]; then
      printf '%s' "$host"
      return
    fi
  done
}

detect_wsl_address() {
  local address

  if command -v ip >/dev/null 2>&1; then
    address="$(ip -4 route get 1.1.1.1 2>/dev/null |
      sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n 1)"
    if [[ -n "$address" ]]; then
      printf '%s' "$address"
      return
    fi
  fi

  hostname -I 2>/dev/null | tr ' ' '\n' |
    awk '/^[0-9]+(\.[0-9]+){3}$/ && $0 !~ /^127\./ { print; exit }'
}

tailscale_command() {
  if command -v tailscale >/dev/null 2>&1; then
    command -v tailscale
  elif command -v tailscale.exe >/dev/null 2>&1; then
    command -v tailscale.exe
  elif [[ -x "/mnt/c/Program Files/Tailscale/tailscale.exe" ]]; then
    printf '%s' '/mnt/c/Program Files/Tailscale/tailscale.exe'
  fi
}

detect_tailscale_address() {
  local configured_hosts="$(configured_allowed_hosts)"
  local address="${TAILSCALE_ADDRESS:-}"
  local command

  if [[ -z "$address" ]]; then
    address="$(first_allowed_host "$configured_hosts")"
  fi
  if [[ -n "$address" && "$address" != "localhost" && "$address" != "127.0.0.1" ]]; then
    printf '%s' "$address"
    return
  fi

  command="$(tailscale_command)"
  if [[ -n "$command" ]]; then
    address="$("$command" ip -4 2>/dev/null | tr -d '\r' | awk 'NF { print $1; exit }')"
  fi

  [[ -n "$address" ]] || die "could not find a Tailscale address; set TAILSCALE_ADDRESS"
  printf '%s' "$address"
}

resolve_profile() {
  local profile="${1:-local}"
  local configured_hosts

  profile="${profile,,}"
  case "$profile" in
    local|localhost)
      profile_name=local
      public_host=localhost
      bind_host=127.0.0.1
      allowed_hosts=localhost,127.0.0.1
      ;;
    wsl|wsl2)
      profile_name=wsl
      public_host="${WSL2_ADDRESS:-${WSL2_IP:-$(detect_wsl_address)}}"
      [[ -n "$public_host" ]] || die "could not find a WSL2 address; set WSL2_ADDRESS"
      bind_host=0.0.0.0
      configured_hosts="$(configured_allowed_hosts)"
      allowed_hosts="$public_host${configured_hosts:+,$configured_hosts},localhost,127.0.0.1"
      ;;
    tailscale|tailnet)
      profile_name=tailscale
      public_host="$(detect_tailscale_address)"
      bind_host=0.0.0.0
      configured_hosts="$(configured_allowed_hosts)"
      allowed_hosts="$public_host${configured_hosts:+,$configured_hosts},localhost,127.0.0.1"
      ;;
    *)
      die "unknown profile '$profile' (expected local, wsl, or tailscale)"
      ;;
  esac
}

pid_file_for() {
  printf '%s/%s.pid' "$pid_dir" "$1"
}

log_file_for() {
  printf '%s/%s.log' "$log_dir" "$1"
}

valid_pid() {
  [[ "$1" =~ ^[1-9][0-9]*$ && "$1" -gt 1 ]]
}

process_group_running() {
  local pid="$1"
  valid_pid "$pid" && kill -0 -- "-$pid" 2>/dev/null
}

process_running() {
  local pid="$1"
  valid_pid "$pid" && (kill -0 "$pid" 2>/dev/null || process_group_running "$pid")
}

pid_for_service() {
  local name="$1"
  local file="$(pid_file_for "$name")"

  [[ -f "$file" ]] || return 1
  tr -d '[:space:]' < "$file"
}

running_services() {
  local name pid

  for name in "${service_names[@]}"; do
    if pid="$(pid_for_service "$name" 2>/dev/null)" && process_running "$pid"; then
      printf '%s\n' "$name"
    fi
  done
}

remove_pid_files() {
  local name

  for name in "${service_names[@]}"; do
    rm -f -- "$(pid_file_for "$name")"
  done
  rm -f -- "$profile_file"
}

start_process() {
  local name="$1"
  shift

  setsid "$@" >"$(log_file_for "$name")" 2>&1 &
  local pid=$!
  printf '%s\n' "$pid" > "$(pid_file_for "$name")"
  printf '  %-7s pid %s (log: %s)\n' "$name" "$pid" "$(log_file_for "$name")"
}

start_servers() {
  local requested_profile="${1:-local}"
  local running

  resolve_profile "$requested_profile"
  mkdir -p "$pid_dir" "$log_dir"

  running="$(running_services)"
  if [[ -n "$running" ]]; then
    die "dev servers already running: $(tr '\n' ' ' <<< "$running"); run 'make dev-stop' first"
  fi
  remove_pid_files

  command -v setsid >/dev/null 2>&1 || die "setsid is required to manage dev-server process groups"

  printf 'Building the server package...\n'
  (cd "$repo_root" && npm run build --workspace @table-top-poker/server)

  printf 'Starting dev servers with the %s profile.\n' "$profile_name"
  start_process server env \
    HOST="$bind_host" \
    PORT="$server_port" \
    npm run start --workspace @table-top-poker/server
  start_process table env \
    DEV_SERVER_HOST="$bind_host" \
    DEV_ALLOWED_HOSTS="$allowed_hosts" \
    BACKEND_ORIGIN="http://127.0.0.1:$server_port" \
    npm run dev --workspace @table-top-poker/table-client -- \
    --host "$bind_host" --port "$table_port" --strictPort
  start_process player env \
    DEV_SERVER_HOST="$bind_host" \
    DEV_ALLOWED_HOSTS="$allowed_hosts" \
    BACKEND_ORIGIN="http://127.0.0.1:$server_port" \
    npm run dev --workspace @table-top-poker/player-client -- \
    --host "$bind_host" --port "$player_port" --strictPort

  printf '%s\n' "$profile_name" > "$profile_file"
  sleep 1
  if [[ -z "$(running_services)" || "$(running_services)" != $'server\ntable\nplayer' ]]; then
    printf 'dev-servers: one or more servers exited during startup.\n' >&2
    for name in "${service_names[@]}"; do
      printf '\n--- %s log ---\n' "$name" >&2
      sed -n '1,80p' "$(log_file_for "$name")" >&2 || true
    done
    stop_servers
    return 1
  fi

  cat <<EOF

Dev servers are running:
  table:  http://$public_host:$table_port
  player: http://$public_host:$player_port
  server: http://$public_host:$server_port

Stop them with: make dev-stop
EOF
}

stop_servers() {
  local name pid found=0
  local -a pids=()

  for name in "${service_names[@]}"; do
    if pid="$(pid_for_service "$name" 2>/dev/null)" && valid_pid "$pid"; then
      pids+=("$pid")
      if process_running "$pid"; then
        found=1
        printf 'Stopping %-7s pid %s\n' "$name" "$pid"
        kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
      fi
    fi
  done

  if [[ "$found" -eq 1 ]]; then
    local deadline=$((SECONDS + 5))
    local still_running=1
    while [[ "$still_running" -eq 1 && "$SECONDS" -lt "$deadline" ]]; do
      still_running=0
      for pid in "${pids[@]}"; do
        if process_running "$pid"; then
          still_running=1
          break
        fi
      done
      [[ "$still_running" -eq 1 ]] && sleep 0.1
    done

    if [[ "$still_running" -eq 1 ]]; then
      for pid in "${pids[@]}"; do
        process_running "$pid" && kill -KILL -- "-$pid" 2>/dev/null || true
      done
    fi
  else
    printf '%s\n' 'No tracked dev servers are running.'
  fi

  remove_pid_files
}

status_servers() {
  local name pid profile="not started"

  if [[ -f "$profile_file" ]]; then
    profile="$(tr -d '[:space:]' < "$profile_file")"
  fi
  printf 'profile: %s\n' "$profile"
  for name in "${service_names[@]}"; do
    if pid="$(pid_for_service "$name" 2>/dev/null)" && process_running "$pid"; then
      printf '  %-7s running (pid %s, log: %s)\n' "$name" "$pid" "$(log_file_for "$name")"
    else
      printf '  %-7s stopped\n' "$name"
    fi
  done
}

main() {
  local action="${1:-}"

  case "$action" in
    start)
      start_servers "${2:-local}"
      ;;
    stop)
      stop_servers
      ;;
    restart)
      stop_servers
      start_servers "${2:-local}"
      ;;
    status)
      status_servers
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
}

cd "$repo_root"
main "$@"
