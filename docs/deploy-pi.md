# Deploying to a Pi

The Pi runs the game server on `127.0.0.1:3000` and Caddy on the LAN-facing
ports. Players use `https://<subdomain>.duckdns.org`; Caddy terminates TLS,
forwards HTTP and WebSocket traffic to the existing server, and renews the
certificate itself.

The release still contains only the compiled Node server and the two client
bundles. Caddy is a separate, long-lived system service, so an application
release does not replace its certificate state.

## Before installing Caddy

The DNS and router check is the first deployment step. Do not spend time
debugging Caddy until the hostname resolves on a real phone connected to the
same main Wi-Fi network as the Pi.

1. Give the Pi a DHCP reservation. The current Pi address is
   `192.168.1.116`; use the address shown by `hostname -I` if the reservation
   is different.
2. Create a subdomain at [DuckDNS](https://www.duckdns.org/) and set its A
   record to that private address. DuckDNS accepts a private address through
   its update endpoint; the reservation means this is a one-time setup:

   ```bash
   curl --fail --silent --show-error --get \
     https://www.duckdns.org/update \
     --data-urlencode 'domains=YOUR_SUBDOMAIN' \
     --data-urlencode 'token=YOUR_DUCKDNS_TOKEN' \
     --data-urlencode 'ip=192.168.1.116'
   ```

   The response must be `OK`. The `domains` value is the subdomain without
   `.duckdns.org`.
3. With mobile data disabled, use a DNS lookup app on a phone connected to the
   main Wi-Fi and query `YOUR_SUBDOMAIN.duckdns.org` for an A record. It must
   return the Pi's LAN address. A laptop lookup is useful as a second check,
   but does not replace the phone check.
4. If the phone cannot resolve the name, add the DuckDNS domain to the
   router's DNS-rebinding exception list, or configure a local DNS override
   for the name to the Pi's address, then repeat the phone check. Do not work
   around this with a public tunnel: the game remains LAN-local.

Do not publish an AAAA record for a private or ULA IPv6 address. The intended
front door is the reserved IPv4 address above.

## Build the custom Caddy binary

The DuckDNS DNS-01 provider is not part of the stock Caddy binary. Build the
small custom binary on the development machine, targeting the Pi's 64-bit ARM
OS. This does not build TypeScript or install npm packages on the Pi.

Install Go and `xcaddy` on the development machine, then run:

```bash
go install github.com/caddyserver/xcaddy/cmd/xcaddy@v0.4.6
export PATH="$(go env GOPATH)/bin:$PATH"
./scripts/build-caddy.sh
```

The script pins Caddy `v2.11.3` and the DuckDNS module `v0.5.0` by default and
writes the binary to `build/caddy`. Override `CADDY_VERSION`,
`DUCKDNS_VERSION`, or `CADDY_OUTPUT` when deliberately updating them.

## One-time Pi setup

### Caddy

Install the official Caddy package for its system user and support files. The
custom binary below is installed separately at `/usr/local/bin/caddy`, leaving
the package-managed binary untouched:

```bash
sudo apt update
sudo apt install -y ca-certificates curl debian-keyring debian-archive-keyring \
  apt-transport-https gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
  sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' |
  sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
sudo systemctl disable --now caddy || true
```

Copy the custom binary built above to the Pi:

```bash
scp build/caddy raspberrypi:/tmp/caddy
ssh raspberrypi 'sudo install -o root -g root -m 0755 /tmp/caddy /usr/local/bin/caddy'
```

Create the configuration directory and copy the tracked Caddy files. Make a
private copy of the example environment file, set the real subdomain and
DuckDNS token, and never commit that copy:

```bash
ssh raspberrypi 'sudo install -d -o root -g caddy -m 0750 /etc/caddy'
scp deploy/Caddyfile deploy/caddy.service raspberrypi:/tmp/
ssh raspberrypi 'sudo install -o root -g caddy -m 0640 /tmp/Caddyfile /etc/caddy/Caddyfile && \
  sudo install -o root -g root -m 0644 /tmp/caddy.service /etc/systemd/system/caddy.service && \
  sudo install -d -o caddy -g caddy -m 0750 /var/lib/caddy'
cp deploy/caddy.env.example /tmp/caddy.env
$EDITOR /tmp/caddy.env
scp /tmp/caddy.env raspberrypi:/tmp/caddy.env
ssh raspberrypi 'sudo install -o root -g root -m 0600 /tmp/caddy.env /etc/caddy/caddy.env'
```

`deploy/Caddyfile` uses the DuckDNS token only for the ACME DNS-01 TXT
challenge. Caddy stores certificates and account data under `/var/lib/caddy`;
keep that directory across releases and reboots.

### Node and the poker service

Use a 64-bit Raspberry Pi OS and the arm64 Node 22 build matching the
repository's engine requirement:

```bash
sudo apt update
sudo apt install -y ca-certificates curl rsync xz-utils iw

NODE_VERSION=22.22.1
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-arm64.tar.xz"
NODE_TMP=$(mktemp -d)
trap 'rm -rf "$NODE_TMP"' EXIT
curl -fsSLo "$NODE_TMP/$NODE_ARCHIVE" \
  "https://nodejs.org/dist/v${NODE_VERSION}/$NODE_ARCHIVE"
curl -fsSLo "$NODE_TMP/SHASUMS256.txt" \
  "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
grep " $NODE_ARCHIVE$" "$NODE_TMP/SHASUMS256.txt" |
  (cd "$NODE_TMP" && sha256sum -c -)
sudo tar -xJf "$NODE_TMP/$NODE_ARCHIVE" -C /opt
sudo ln -sfn "/opt/node-v${NODE_VERSION}-linux-arm64" /opt/node
for binary in node npm npx corepack; do
  sudo ln -sfn "/opt/node/bin/$binary" "/usr/local/bin/$binary"
done
node --version
```

Create the service user and persistent recording directory:

```bash
if ! id poker >/dev/null 2>&1; then
  sudo useradd --system --home-dir /opt/poker --create-home \
    --shell /usr/sbin/nologin poker
fi
sudo install -d -o poker -g poker -m 0755 /opt/poker
sudo install -d -o "$USER" -g poker -m 0770 /opt/poker/releases
sudo install -d -o poker -g poker -m 0750 /var/lib/poker/recordings
sudo install -d -o poker -g poker -m 0750 /etc/poker
```

Copy `deploy/poker.env.example` to `/etc/poker/poker.env`, keep
`HOST=127.0.0.1` and `PORT=3000`, and set its ownership and mode:

```bash
sudo chown poker:poker /etc/poker/poker.env
sudo chmod 600 /etc/poker/poker.env
```

The Node service is intentionally loopback-only. The Caddy service is the
single LAN-facing entry point and also supplies the `X-Forwarded-Proto` value
used to make QR codes start with `https://`.

## First start

Install the Node unit, validate Caddy with the environment file, then enable
both services:

```bash
sudo install -o root -g root -m 0644 deploy/poker.service /etc/systemd/system/poker.service
sudo /usr/local/bin/caddy validate \
  --config /etc/caddy/Caddyfile \
  --envfile /etc/caddy/caddy.env
sudo systemctl daemon-reload
sudo systemctl enable --now poker caddy
systemctl is-active poker caddy
```

Caddy uses the DNS-01 challenge, so no port forwarding is required. It needs
outbound internet access to DuckDNS and the ACME CA, but the game traffic
stays on the LAN. Certificate renewal is handled by Caddy's service; do not
add a cron job or a second renewal timer.

Verify from a phone on the main Wi-Fi:

```text
https://YOUR_SUBDOMAIN.duckdns.org/
```

There must be no certificate warning. The table's room QR code should now
contain the same HTTPS origin, and the player should receive the microphone
permission prompt after choosing to record a turn sound.

## Building and deploying an application release

Build the release on the development machine. The release contains compiled
JavaScript, client bundles, and a dereferenced runtime `node_modules`; the Pi
does not need the source checkout or the TypeScript toolchain:

```bash
npm ci
npm run build:release
```

Stage it in a new timestamped directory and switch the symlink only after the
copy completes:

```bash
RELEASE=/opt/poker/releases/$(date +%Y%m%d-%H%M%S)
ssh raspberrypi "mkdir -p '$RELEASE'"
rsync -az --delete .release/ "raspberrypi:$RELEASE/"
ssh raspberrypi "sudo chown -R poker:poker '$RELEASE' && \
  sudo ln -sfn '$RELEASE' /opt/poker/current && \
  sudo systemctl restart poker && \
  sudo systemctl is-active poker"
```

Caddy does not need to be restarted for an application release. It keeps
serving the same hostname and certificate while `poker.service` changes its
backend symlink. An application deployment restarts the Node process, so it
ends all active Rooms and Hands held in memory; deploy between games.

The old release directories are deliberately retained. To roll back, point
`current` at a known-good directory and restart only the poker service:

```bash
ssh raspberrypi "sudo ln -sfn /opt/poker/releases/KNOWN_GOOD /opt/poker/current && \
  sudo systemctl restart poker && \
  sudo systemctl is-active poker"
```

When changing Caddy configuration, validate before reloading it. A failed
reload leaves the previous running configuration in place:

```bash
sudo /usr/local/bin/caddy validate \
  --config /etc/caddy/Caddyfile \
  --envfile /etc/caddy/caddy.env
sudo systemctl reload caddy
```

## Room recordings

Every Room is recorded under
`/var/lib/poker/recordings/<room-id>/`: an immutable `room.json` is written
when the Room is created, followed by a context, command, and event file for
each Hand. The directory is keyed by the Room's durable UUID, not its
four-character join code.

Recording is a Room invariant. The server creates and write-checks
`RECORDINGS_DIR` before it listens and refuses to start if the root is not
writable. A Room whose manifest cannot be written never becomes joinable.

Deploying any release from the recording change onward requires
`RECORDINGS_DIR=/var/lib/poker/recordings` in `/etc/poker/poker.env`; do not put
recordings inside `/opt/poker/current`, because the next release replaces that
directory. Leave the old `/var/lib/poker/hands/` tree in place; it is the
pre-Phase-2 layout and has no `room.json`.

## Reboot and game-night checklist

- [ ] A phone on the main Wi-Fi resolves the DuckDNS A record to the Pi's LAN
      address. If not, fix router DNS rebinding protection first.
- [ ] `systemctl is-active poker caddy` is green after a fresh boot.
- [ ] `https://YOUR_SUBDOMAIN.duckdns.org/` loads with no browser warning.
- [ ] A created-room QR code contains the HTTPS hostname and opens the player
      join path.
- [ ] A phone grants microphone access and completes the turn-sound prompt.
- [ ] Caddy's certificate state remains under `/var/lib/caddy` and no cron or
      manual renewal step exists.
- [ ] Everyone is on the main SSID, not a guest network with client isolation.
- [ ] The Pi has a DHCP reservation and, if using Wi-Fi, power save is off:
      `sudo iw dev wlan0 set power_save off`.
- [ ] The table device is plugged in with Auto-Lock disabled.
- [ ] The laptop used for deployment has SSH access ready for
      `journalctl -u poker -f` and `journalctl -u caddy -f`.

Useful diagnostics:

```bash
ssh raspberrypi 'systemctl status poker caddy --no-pager'
ssh raspberrypi 'journalctl -u poker -u caddy -n 100 --no-pager'
curl --fail --silent --show-error https://YOUR_SUBDOMAIN.duckdns.org/
```

If the HTTPS hostname is unavailable, check the phone's SSID and DNS result
first, then the Caddy journal, then the poker journal. A Caddy reload or Node
restart does not erase the older releases or Room recordings.
