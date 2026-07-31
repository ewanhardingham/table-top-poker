# Deploying to a Pi (ticket 34)

Full research and reasoning: `docs/research/pi-hosting-and-lan-https.md`. This is the
condensed how-to; that doc is the why.

## What ships

`npm run build:release` (root) builds every package, builds `table-client` and
`player-client` against their production base paths (`/table/`, `/player/`), and stages
both bundles under `packages/server/public/` so one Fastify process serves everything
same-origin — plain HTTP, no certificate (docs/phase-1-spec.md §8).

After it runs, `.release/` is a self-contained deployable unit. The release
script copies workspace symlink targets into its `node_modules`, so the Pi does not need a
source checkout or the development machine's workspace layout.

## One-time Pi setup

1. **OS**: Raspberry Pi OS Lite, 64-bit.
2. **Node**: install the arm64 Node 22 build matching this repo's `engines.node` (`^22.0.0`).
   The service uses `/usr/local/bin/node`; this installs the official binary there:

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
   grep " $NODE_ARCHIVE$" "$NODE_TMP/SHASUMS256.txt" | \
     (cd "$NODE_TMP" && sha256sum -c -)
   sudo tar -xJf "$NODE_TMP/$NODE_ARCHIVE" -C /opt
   sudo ln -sfn "/opt/node-v${NODE_VERSION}-linux-arm64" /opt/node
   for binary in node npm npx corepack; do
     sudo ln -sfn "/opt/node/bin/$binary" "/usr/local/bin/$binary"
   done
   node --version
   ```

3. **Network**: prefer Ethernet. If Wi-Fi, use the main SSID (not a guest network — see
   below) and disable power save: `sudo iw dev wlan0 set power_save off` (persist this,
   it resets on reboot otherwise).
4. **A `poker` system user**, matching `deploy/poker.service`'s `User=`/`Group=`:

   ```bash
   if ! id poker >/dev/null 2>&1; then
     sudo useradd --system --home-dir /opt/poker --create-home \
       --shell /usr/sbin/nologin poker
   fi
   sudo install -d -o poker -g poker -m 0755 /opt/poker
   sudo install -d -o "$USER" -g poker -m 0770 /opt/poker/releases
   sudo install -d -o poker -g poker -m 0750 /etc/poker
   ```

5. Copy `deploy/poker.env.example` to `/etc/poker/poker.env`, set `HOST`/`PORT`, then
   run `sudo chown poker:poker /etc/poker/poker.env && sudo chmod 600 /etc/poker/poker.env`.

## Getting code onto the Pi

Build the release on your dev machine (`npm run build:release`), then `rsync` the
self-contained directory into a timestamped release and flip a `current` symlink:

```bash
RELEASE=/opt/poker/releases/$(date +%Y%m%d%H%M%S)
rsync -az .release/ pi-host:"$RELEASE/"
ssh pi-host "sudo chown -R poker:poker '$RELEASE' && sudo ln -sfn '$RELEASE' /opt/poker/current"
```

The release contains the server's compiled output, both client bundles, `package.json`, and
a dereferenced runtime `node_modules`. No workspace package symlinks point back to the
development checkout.

## systemd

```bash
sudo cp deploy/poker.service /etc/systemd/system/poker.service
sudo systemctl daemon-reload
sudo systemctl enable --now poker
systemctl status poker
journalctl -u poker -f
```

Redeploying is: rsync a new timestamped release, `sudo chown -R poker:poker` it, flip the
symlink, and run `sudo systemctl restart poker`.

## The two things that will actually ruin poker night

- **Guest Wi-Fi AP client isolation.** If the Pi and the phones aren't on the same SSID
  with isolation off, phones get a silent, total connection failure that looks exactly
  like a server bug. Confirm this on the router before the first game — this repo can't
  verify it for you, it's a setting on hardware this codebase has no access to.
- **DHCP reassigning the Pi's address.** Set a DHCP reservation (bind the Pi's MAC to a
  fixed IP) on the router. The QR code is generated live from the request's `Host` header
  (`packages/server/src/qr.ts`), so it's always correct *for whatever address you're
  actually on* — a reservation is still what keeps that address the same across a reboot.

Neither of these has a code-level fix; both are router configuration this codebase can't
reach into. See the verification checklist below.

## Verification checklist

These are ticket 34's acceptance criteria. None of them can be verified by an agent
working in this repo — they require the physical Pi, the physical router's admin page,
and a physical phone. Check them off by hand:

- [ ] `systemctl status poker` shows `active (running)` after a fresh `enable --now`.
- [ ] Reboot the Pi; `poker` comes back on its own with no manual step.
- [ ] The Pi has a DHCP reservation configured on the router; its LAN IP is unchanged
      after that reboot.
- [ ] A phone on the main SSID can create/join a room via the QR code and the raw
      `http://<pi-ip>:<port>` fallback.
- [ ] (If a guest network is available to test) a phone on it is confirmed *unable* to
      reach the server — this documents the AP-isolation constraint rather than working
      around it.

## Traps (condensed from the research doc's full list)

1. Guest Wi-Fi AP isolation — main SSID only.
2. A different subnet on a guest/mesh network — check the phone's IP prefix matches.
3. `.local`/mDNS not resolving on some Android builds — always have the raw IP as a
   fallback, printed alongside the QR code.
4. DHCP moved the Pi and the QR code was baked at build time — it isn't; it's generated
   live from the request `Host` header, so this doesn't apply here, but don't
   "helpfully" hardcode an origin later.
5. `localhost` works, the LAN IP doesn't — because `localhost` is a secure context and a
   LAN IP isn't. Test against the real IP from a real phone, not just from the Pi itself.
6. Wi-Fi power save on the Pi causing hangs during quiet periods.
7. Node binding to a specific interface IP before the network is up at boot — this is
   why `poker.env.example` sets `HOST=0.0.0.0`, not the server's own `127.0.0.1` default.
8. `systemd` giving up after 5 rapid restarts — `StartLimitIntervalSec=0` in
   `poker.service` disables that.

Full list (15 items) and reasoning: `docs/research/pi-hosting-and-lan-https.md` §7,
"Traps list".
