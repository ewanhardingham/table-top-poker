# Deploying to a Pi (ticket 34)

Full research and reasoning: `docs/research/pi-hosting-and-lan-https.md`. This is the
condensed how-to; that doc is the why.

## What ships

`npm run build:release` (root) builds every package, builds `table-client` and
`player-client` against their production base paths (`/table/`, `/player/`), and stages
both bundles under `packages/server/public/` so one Fastify process serves everything
same-origin — plain HTTP, no certificate (docs/phase-1-spec.md §8).

After it runs, `packages/server/{dist,public,package.json}` plus the workspace's installed
`node_modules` is the deployable unit.

## One-time Pi setup

1. **OS**: Raspberry Pi OS Lite, 64-bit.
2. **Node**: version matching this repo's `engines.node` (`^22.0.0`), arm64 build.
3. **Network**: prefer Ethernet. If Wi-Fi, use the main SSID (not a guest network — see
   below) and disable power save: `sudo iw dev wlan0 set power_save off` (persist this,
   it resets on reboot otherwise).
4. **A `poker` system user**, matching `deploy/poker.service`'s `User=`/`Group=`.
5. `sudo mkdir -p /etc/poker /opt/poker/releases`, then copy `deploy/poker.env.example`
   to `/etc/poker/poker.env` (`chmod 600`, owned by `poker`) and adjust `HOST`/`PORT`.

## Getting code onto the Pi

Build the release on your dev machine (`npm run build:release`), then `rsync` it into a
timestamped release directory and flip a `current` symlink:

```bash
RELEASE=/opt/poker/releases/$(date +%Y%m%d%H%M%S)
rsync -az --relative \
  packages/server/dist packages/server/public packages/server/package.json \
  node_modules \
  pi-host:"$RELEASE/"
ssh pi-host "ln -sfn $RELEASE /opt/poker/current"
```

(Adjust for however you actually get `node_modules` over — a full workspace `npm ci` on
the Pi is simplest if disk/time allow; a pruned production install is the smaller-but-
fussier alternative. Either way, `packages/server`'s own `node_modules` needs the
workspace's `@table-top-poker/protocol` resolved, which is why the whole tree's
`node_modules`, not just `packages/server`'s, goes over.)

## systemd

```bash
sudo cp deploy/poker.service /etc/systemd/system/poker.service
sudo systemctl daemon-reload
sudo systemctl enable --now poker
systemctl status poker
journalctl -u poker -f
```

Redeploying is: rsync a new timestamped release, flip the symlink, `sudo systemctl restart
poker`.

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
