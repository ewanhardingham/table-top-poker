# 0011 — Serve the Pi through trusted HTTPS with DuckDNS and Caddy

## Status

Accepted and implemented in #279.

## Context

The Phase 1 hosting research chose plain HTTP on a LAN IP because it avoided
guest-phone certificate setup. The turn-sound feature changed that trade-off:
browser microphone access requires a secure context, so the deployed feature
would be unavailable on the Pi's HTTP origin.

The Pi has a private LAN address and cannot receive an inbound ACME challenge.
The router may also reject a public DNS name that resolves to a private address
unless that name is explicitly exempted from DNS-rebinding protection.

## Decision

Use a free DuckDNS subdomain whose A record points to the Pi's DHCP-reserved
LAN address. Put Caddy in front of the existing Node service and use the
DuckDNS Caddy module to complete Let's Encrypt DNS-01 challenges. DNS-01
requires only outbound access to DuckDNS and the ACME CA; no port forwarding or
public tunnel is needed.

Caddy owns ports 80 and 443, redirects HTTP to HTTPS, proxies HTTP and
WebSocket traffic to Node on `127.0.0.1:3000`, and manages renewal itself. Its
certificate state lives in `/var/lib/caddy`, outside application releases.
The DuckDNS token is supplied through `/etc/caddy/caddy.env`, never embedded
in the tracked Caddyfile or committed to the repository.

The Node service is loopback-only. The server trusts forwarded headers only
from `127.0.0.1`, so Caddy's `X-Forwarded-Proto` can preserve the HTTPS origin
in generated room QR codes without allowing a LAN client to choose that
origin. Client WebSocket URLs already derive `ws:` or `wss:` from the page
protocol.

The operational setup and verification checklist live in
[`docs/deploy-pi.md`](../deploy-pi.md). The router's DNS-rebinding exception
and phone resolution check are prerequisites, not automatable repository
steps.

## Consequences

- Guests get a browser-trusted HTTPS origin and the microphone API without
  installing an app or certificate.
- The Pi needs one custom Caddy build containing the DuckDNS module, a
  DuckDNS token, and a persistent Caddy data directory.
- A DHCP reservation and router DNS-rebinding exception are part of the
  deployment. If the router cannot resolve the private DuckDNS A record, this
  design cannot serve the hostname to phones on that network.
- Application releases and rollbacks continue to change only
  `/opt/poker/current` and restart `poker`; Caddy and its certificate state are
  left running.
- The backend's direct port is no longer a player-facing fallback. If Caddy is
  unavailable, the HTTPS front door is unavailable and the Caddy journal is
  the first diagnostic surface.
