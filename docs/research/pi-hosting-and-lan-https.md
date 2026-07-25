# Hosting the poker server on a Pi, and the LAN HTTPS question

**Researched 2026-07-25. All facts checked against primary sources on that date.**
Version-sensitive claims are dated inline. Anything I could not verify from a primary
source is called out explicitly in the body and again in
"[Open questions / could not verify](#open-questions--could-not-verify)".

Context: TypeScript Texas hold'em. Node server on a home LAN, one iPad as the "table top"
central device, ~9 phones as player clients, websockets, ~10 concurrent connections,
LAN-only, no public internet exposure.

---

## TL;DR

1. **Ship plain HTTP over a LAN IP, and design the app so it never needs a secure-context
   API.** The cost of HTTPS on a LAN is paid by your *guests*, not by you: every phone you
   don't control has to either click through a scary interstitial or install a root CA
   profile. For a one-night poker game with 10 phones, that is the wrong trade.
2. **The one real casualty is the Screen Wake Lock API**, which is secure-context-only
   ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)) and is
   genuinely the API you'd most want (phones dimming and locking mid-hand). Mitigate in
   the app (see [§6.2](#62-phones-sleeping-and-backgrounded-tabs)) rather than by taking
   on a cert. Everything else you plausibly need — websockets, fetch, localStorage,
   IndexedDB, `crypto.getRandomValues()`, fullscreen — works fine over plain HTTP.
3. **If you later decide you must have HTTPS**, the least-bad option for untouched guest
   phones is a **publicly-trusted cert on a real domain whose DNS points at the private
   IP**, obtained via a **DNS-01 ACME challenge**. It needs no inbound ports and no
   per-phone setup. Its traps are router DNS-rebinding protection and needing internet at
   renewal time. `traefik.me` is the zero-effort version of this but its private key is
   public, so it provides zero actual confidentiality.
4. **Self-signed / mkcert is fine for you and the iPad, and terrible for guests.** mkcert's
   own README is explicit that mobile devices require manually installing the root CA
   ([mkcert README](https://github.com/FiloSottile/mkcert#mobile-devices)), and on iOS that
   is a *two-step* process — install the profile, then separately flip it on under
   Settings > General > About > Certificate Trust Settings
   ([Apple HT102390](https://support.apple.com/en-us/102390)).
5. **Tailscale gives you a real Let's Encrypt cert on a `*.ts.net` name, but every guest
   phone must be running Tailscale and be on (or shared into) your tailnet**
   ([Tailscale KB 1153](https://tailscale.com/kb/1153/enabling-https)). That is worse than
   installing a CA profile, for a poker night. Funnel avoids the app requirement but routes
   your LAN game over the public internet through Tailscale relays.
6. **Let's Encrypt IP-address certificates went GA on 2026-01-15
   ([Let's Encrypt](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability))
   but they do not help you** — 160-hour lifetime, http-01/tls-alpn-01 only (no DNS-01), and
   CA/Browser Forum rules have prohibited certs for Reserved IP Addresses since 2016-01-01
   ([CA/B Forum](https://cabforum.org/working-groups/server/internal-names/)). RFC1918
   addresses are out.
7. **Hardware: a Pi 4 (2GB) or Pi 5 is overkill-but-sane; a Pi Zero 2 W is genuinely
   sufficient** for 10 websockets of tiny JSON. Use **64-bit Raspberry Pi OS**, run Node
   under **systemd** (not pm2, not Docker), **ship compiled JS** rather than building TS on
   the Pi, and use **ethernet** if you can.
8. **The single most likely thing to ruin the night is guest-Wi-Fi / AP client isolation.**
   Put every phone on the *main* SSID. Second most likely: someone's phone screen locks and
   your "disconnected players auto-fold" rule fires spuriously.

---

## 1. HTTPS on a private LAN

### 1.1 What's actually gated behind a secure context

MDN maintains the canonical list: **[Features restricted to secure
contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts/features_restricted_to_secure_contexts)**
(page last modified 2026-03-08). Filtering it to things a poker app might plausibly want:

| Feature | Secure context only? | Notes / source |
|---|---|---|
| **Service Workers** (⇒ PWA install, offline) | **Yes** | On the MDN restricted list. No SW ⇒ no offline caching, no "Add to Home Screen" installable PWA behaviour. |
| **Screen Wake Lock API** | **Yes** | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API) states "available only in secure contexts (HTTPS)". Baseline 2025. **This is the painful one.** |
| **`crypto.subtle`** (Web Crypto) | **Yes** | [MDN Crypto.subtle](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle): "available only in secure contexts (HTTPS)". |
| **`crypto.getRandomValues()`** | **No — works on plain HTTP** | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues): "`getRandomValues()` is the only member of the `Crypto` interface which can be used from an insecure context." Your shuffle can use it. (Shuffle should be server-side anyway.) |
| **Notifications API / Push API** | **Yes** (both) | Both on the MDN restricted list. |
| **Web Share API** | **Yes** | On the MDN restricted list. |
| **Async Clipboard API** (`navigator.clipboard`) | **Yes** | On the MDN restricted list. Note the legacy `document.execCommand('copy')` is *not* gated — that's the HTTP fallback for "copy the join link". |
| **`getUserMedia()`** | **Yes** | MDN lists it under "partially restricted": the method requires a secure context even though the parent API doesn't. |
| **Device Orientation / Device Motion** | **Yes** | On the MDN restricted list. (On iOS there is *additionally* a permission prompt.) |
| **Storage API** (`navigator.storage.persist()`, `estimate()`) | **Yes** | On the MDN restricted list. Note this is the *quota/persistence* API — plain `localStorage` and IndexedDB are **not** gated. |
| **Web Bluetooth / WebUSB / Web NFC / WebHID** | **Yes** (all four) | All on the MDN restricted list. Irrelevant here. |
| **Web Authentication (passkeys)** | **Yes** | On the MDN restricted list. Rules out passkey-based player identity over HTTP. |
| **Web Locks, Cookie Store, Badging, Battery Status, Idle Detection, WebTransport, WebCodecs, WebGPU** | **Yes** | All on the MDN restricted list. |
| **Fullscreen API** | **No** | Not on the MDN restricted list. Requires user activation, not a secure context. Works over HTTP. |
| **`navigator.vibrate()`** | **No** | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate) documents *sticky user activation* as the requirement, not a secure context. Separately it is **not Baseline** — Safari/iOS has never shipped it, so it is unusable for iPhone players regardless of HTTP vs HTTPS. |

**What works perfectly well over plain HTTP** (so you know the true cost of staying put):

- **`ws://` websockets** from an `http://` page. Unrestricted. This is your entire transport.
- **`fetch()` / XHR** to the same origin.
- **`localStorage`, `sessionStorage`, `IndexedDB`, cookies.**
- **`crypto.getRandomValues()`.**
- **Fullscreen, Page Visibility API, `requestAnimationFrame`, Canvas/WebGL, CSS, audio via
  `<audio>`, `AudioContext`.**
- **`document.execCommand('copy')`** as a clipboard fallback.

So the honest cost of plain HTTP for this app is: **no wake lock, no installable
offline PWA, no `crypto.subtle`, no notifications, no `navigator.clipboard`.** Of those,
only the wake lock has real product impact.

### 1.2 The exact rule: is `192.168.1.50` a secure context?

**No.** MDN's [Secure
Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) page (last
modified 2025-11-30) enumerates the non-HTTPS origins that are nevertheless
"potentially trustworthy":

- `http://127.0.0.1`
- `http://localhost`
- `http://*.localhost` (e.g. `http://dev.whatever.localhost/`)
- `file://` URLs
- `wss://` URLs

Private LAN IPs are **not** in that list, and MDN does not carve them out anywhere. The
normative source is the W3C **Secure Contexts** spec and WHATWG's
["potentially trustworthy origin"
algorithm](https://w3c.github.io/webappsec-secure-contexts/), which whitelists the loopback
ranges `127.0.0.0/8` and `::1/128` and the `localhost` name specifically — RFC1918 ranges
are deliberately excluded because "on my LAN" is not the same trust claim as "on this
machine".

Practical consequence: **`http://192.168.1.50:3000` gives `window.isSecureContext === false`
in every browser.** Feature-detect with `window.isSecureContext` rather than sniffing the
URL.

> Worth knowing for development: `http://localhost:3000` **is** a secure context. So a
> service worker or wake lock will work on your dev machine and then silently fail on the
> phones. Guard everything and test on a phone against the LAN IP early.

### 1.3 Local Network Access (formerly Private Network Access / CORS-RFC1918)

Chrome shipped a **Local Network Access permission prompt**, per
[developer.chrome.com/blog/local-network-access](https://developer.chrome.com/blog/local-network-access):

- It **replaces** Private Network Access (PNA, formerly CORS-RFC1918). The Chrome post notes
  PNA's preflight/target-opt-in design "was put on hold" in favour of a user-permission model.
- Timeline: opt-in flag in **Chrome 138** (June 2025), launched in **Chrome 142**
  (announced for September 2025; press coverage puts the broad rollout at late Oct 2025 and
  widespread user-visible impact by early 2026 —
  [Chrome Platform Status entry](https://cr-status.appspot.com/feature/5152728072060928)).
- It gates requests **from a public-network page to a local destination**: private IPv4
  (`192.168.x.x`), IPv6 link-local, loopback (`127.0.0.1`, `::1`), and `.local` names.

**What this means for you: essentially nothing.** The restriction is on *cross-address-space*
requests — a page loaded from the public internet reaching into the LAN. Your page is
*served from* the LAN IP and talks *to* the same LAN IP, i.e. local→local, same origin.
The Chrome post is explicit that the current shipping behaviour does not cover this, though
it flags an intent to "extend these restrictions to cover all cross-origin requests" in
future. Two things to keep in mind:

- Keep everything **same-origin**. If the page is served from `192.168.1.50:3000` and the
  websocket goes to `ws://192.168.1.50:3000`, you are in the clear. Don't serve the client
  from a public CDN/dev-tunnel and point it at the LAN box — that is exactly the pattern LNA
  is designed to prompt on.
- If you ever host the client on e.g. Vercel and connect back to the Pi, expect an LNA
  permission prompt on every guest's phone in Chrome. Avoid.

### 1.4 Certificate options, and what each one costs a guest's phone

#### (a) Self-signed certificate

What happens in practice:

- **Android Chrome**: full-page interstitial ("Your connection is not private",
  `NET::ERR_CERT_AUTHORITY_INVALID`). There is an "Advanced → Proceed to … (unsafe)" path.
  Once proceeded, the exception is remembered for that host **for the session**; it does not
  survive indefinitely. Chromium's own docs and the [Chromium security
  FAQ](https://chromium.googlesource.com/chromium/src/+/main/docs/security/faq.md) describe
  proceed-through decisions as non-permanent, but I could not find an authoritative statement
  of the exact retention window — **treat "it will be remembered" as unverified**.
- **iOS Safari**: an interstitial with "Show Details → visit this website", which is
  click-through-able. I could **not** find any Apple primary source documenting either the
  interstitial or how long the exception persists. Apple does not document this. Everything
  written about it online is anecdotal. **Label this unverified.**
- Additionally, a self-signed cert leaves the page **not a secure context** in practice?
  No — this is a common confusion. Once the user clicks through, the origin *is* HTTPS and
  `isSecureContext` is `true`, but Chrome marks the page as having a **broken/invalid
  certificate state**, which blocks some powerful features anyway (service worker
  registration is refused on origins with cert errors). So clicking through does **not**
  reliably buy you back the secure-context APIs. If your whole reason for HTTPS is the wake
  lock, a clicked-through self-signed cert is a poor way to get it.

To actually make a self-signed CA trusted on iOS you need **both** steps:

1. Install the root CA as a **configuration profile** — download it, then
   Settings > General > VPN & Device Management > install.
2. **Separately** enable it under **Settings > General > About > Certificate Trust
   Settings** → "Enable full trust for root certificates".
   [Apple: "Trust manually installed certificate profiles in iOS, iPadOS and
   visionOS"](https://support.apple.com/en-us/102390) — "manually installed certificate
   profiles in iOS are not automatically trusted for SSL, and you must manually turn on
   trust for SSL/TLS". Certificates deployed via **Apple Configurator or MDM** are
   auto-trusted, which is irrelevant for guest phones.

Apple's cert content requirements
([Requirements for trusted certificates in iOS 13 and macOS
10.15](https://support.apple.com/en-us/103769)):

- RSA ≥ 2048 bits (or ECC P-256/P-384); SHA-2 family hash.
- DNS name **must** be in the **Subject Alternative Name** extension. `CommonName` is
  ignored.
- Issued on/after 2019-07-01: must carry **ExtendedKeyUsage with `id-kp-serverAuth`**, and
  validity **≤ 825 days**.

And the later 398-day rule
([Apple: About upcoming limits on trusted
certificates](https://support.apple.com/en-us/102028)): TLS certs issued on/after
2020-09-01 must not exceed 398 days — but Apple states this "will not affect certificates
issued from user-added or administrator-added Root CAs" and affects only certs from the
**preinstalled** roots.

**Does the 825-day / SAN / EKU set still apply to user-added roots?** Yes for validity, per
empirical testing: Michal Špaček binary-searched it and found Safari accepts 825 days and
rejects 826 for a user-added CA
([michalspacek.com, 2023-08-18](https://www.michalspacek.com/validity-period-of-https-certificates-issued-from-a-user-added-ca-is-essentially-2-years)).
He did **not** test SAN/EKU/key-size for user-added roots — **that part is unverified**,
though mkcert defaults (SAN-based, `serverAuth` EKU, 825-day leaf) exist precisely because
of these rules, which is suggestive.

**Verdict:** fine for you and the iPad. Not viable for 10 guest phones.

#### (b) mkcert

mkcert generates a local CA and issues leaf certs from it, and *automatically installs the
CA into local trust stores* — but only these
([README, "Supported root stores"](https://github.com/FiloSottile/mkcert#supported-root-stores)):
macOS system store, Windows system store, Linux (`update-ca-trust` / `update-ca-certificates` /
`trust`), Firefox (macOS+Linux), Chrome/Chromium, Java.

**No mobile store is in that list.** The README's [Mobile
devices](https://github.com/FiloSottile/mkcert#mobile-devices) section says it plainly:

> "For the certificates to be trusted on mobile devices, you will have to install the root
> CA. It's the `rootCA.pem` file in the folder printed by `mkcert -CAROOT`."
> On iOS: "you need to install the profile in Settings > Profile Downloaded and then enable
> full trust in it." On Android: "You will have to install the CA and then enable user roots
> in the development build of your app."

Also from the README: "The `rootCA-key.pem` file that mkcert automatically generates gives
complete power to intercept secure requests from your machine. Do not share it." Note the
implication — you distribute `rootCA.pem` (public) to phones, never the key. But you are
still asking guests to install a root CA that *you* control onto their personal phone. That
is a big ask socially, and a genuine security concession on their part.

**Verdict:** mkcert is the *best tool* for the self-signed approach, and the self-signed
approach is still wrong for guests.

#### (c) A publicly-trusted cert for a public domain that resolves to a private IP

This **works**, and it is the only option that requires *zero* action on a guest phone.

- **Is it allowed?** Yes — the certificate is issued for a **public DNS name**, which is
  perfectly legal. What is prohibited is issuing for **Internal Names and Reserved IP
  Addresses**: CAs "MUST NOT issue any new Subscriber certificates … with Reserved IP
  Address or Internal Name" effective 2016-01-01, and all such existing certs were revoked
  by 2016-10-01
  ([CA/Browser Forum, Guidance on Internal
  Names](https://cabforum.org/working-groups/server/internal-names/)). The CA never sees or
  cares what A record you publish.
- **How to get it without inbound ports 80/443:** the **DNS-01** challenge. You prove
  control of the domain by publishing a `_acme-challenge` TXT record; nothing has to be
  reachable from the internet. This is the standard route and every mainstream ACME client
  supports it with DNS-provider plugins (Cloudflare, Route53, etc.).
- **Renewal needs internet.** The Pi (or wherever you run the ACME client) needs outbound
  internet and DNS API credentials every ~60 days. If the house broadband is down on poker
  night *and* the cert expired yesterday, you're broken. Renew early, monitor it, and keep a
  plain-HTTP fallback port open.
- **The DNS rebinding trap — this is real and it will bite you.** Many home routers run
  dnsmasq with rebind protection: `--stop-dns-rebind` "Reject (and log) addresses from
  upstream nameservers which are in the private ranges. This blocks an attack where a
  browser behind a firewall is used to probe machines on the local network"
  ([dnsmasq man page](https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html)). A public
  domain resolving to `192.168.1.50` is *exactly* that pattern. Fritz!Box and OpenWrt ship
  this on. The fixes: `--rebind-domain-ok=/poker.example.com/` (or the router's
  "DNS rebind protection exceptions" field), or serve the record from the router's own DNS
  (a local override / "DNS host entry"), which bypasses upstream entirely.
- **Turnkey services:**
  - **`nip.io` / `sslip.io`** — [sslip.io](https://sslip.io/) is a DNS service only:
    "when queried with a hostname with an embedded IP address, returns that IP address",
    e.g. `www.192.168.0.1.nip.io` → `192.168.0.1`. It explicitly states it does **not**
    support wildcard certificates; you'd get your own via HTTP-01, which you can't do for a
    private IP from the internet. So: **DNS only, no cert.** Still useful purely as a stable
    *name* if combined with your own DNS-01 cert on a domain you own.
  - **`traefik.me`** — [GitHub](https://github.com/pyrou/traefik.me) — same magic-DNS trick
    (`10.0.0.1.traefik.me` → `10.0.0.1`) **plus** a genuine Let's Encrypt wildcard cert for
    `*.traefik.me`, regenerated roughly every 60 days, offered for download. It works: no
    interstitial on any phone, no setup. **But the private key is published publicly**, so
    the TLS gives you secure-context status and nothing else — anyone can MITM you. For a
    LAN poker game where the threat model is "nobody", that may be an acceptable trade, but
    be clear-eyed that it is theatre. Also: same rebinding-protection trap, and you are
    dependent on a hobbyist service staying alive on the night.
  - The old `xip.io` is dead; `nip.io`/`sslip.io` are the live successors as of 2026-07.
- **Let's Encrypt IP-address certs — do NOT help.** GA'd 2026-01-15
  ([Let's Encrypt](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)),
  with a **160-hour (~6 day)** lifetime and requiring the `shortlived` ACME profile. The
  announcement post
  ([2025-07-01](https://letsencrypt.org/2025/07/01/issuing-our-first-ip-address-certificate))
  states "only the http-01 and tls-alpn-01 methods can be used" — **no DNS-01**, so you must
  be reachable from the internet at that IP. Combined with the CA/B Forum ban on Reserved IP
  Addresses, **RFC1918 addresses are not obtainable.** I did not find a sentence in a
  Let's Encrypt primary source literally saying "no private IPs" — I'm inferring it from the
  CA/B Forum Reserved IP Address prohibition plus the http-01-only validation requirement,
  which is a strong inference but flag it as such.

**Verdict:** the only cert option that scales to untouched guest phones. Cost: you need a
domain, a DNS provider with an API, an ACME client on a renewal timer, and you must defuse
your router's rebind protection.

#### (d) Tailscale

- **`tailscale cert`** provisions a real Let's Encrypt certificate for
  `machine-name.tailnet-name.ts.net`, validated by DNS-01 against Tailscale's own `*.ts.net`
  DNS ([Tailscale KB 1153](https://tailscale.com/kb/1153/enabling-https)). Requires MagicDNS
  and HTTPS enabled on the tailnet. Certs are 90 days and **you are responsible for renewing**
  unless you use an integration like Caddy. The machine needs internet to reach Let's Encrypt.
- **The killer for poker night: every guest phone must be running Tailscale and be on your
  tailnet** (or be a shared node). The KB is explicit that "access to your devices is still
  restricted by Tailscale as normal", and the MagicDNS `.ts.net` name is served by
  Tailscale's in-tailnet resolver at `100.100.100.100`
  ([MagicDNS docs](https://tailscale.com/kb/1081/magicdns),
  [DNS in Tailscale](https://tailscale.com/kb/1054/dns)). A phone sitting on the same
  physical Wi-Fi with no Tailscale app cannot resolve or reach it. **There is no way to give
  a non-tailnet phone HTTPS access to the tailnet name over the LAN.** Installing an app +
  creating an account is a bigger ask than installing a CA profile.
- **Tailscale Funnel** removes the app requirement — it "lets you route traffic from the
  broader internet to a local service", and end users do not need Tailscale
  ([KB 1223](https://tailscale.com/kb/1223/funnel)). But: ports restricted to 443/8443/10000,
  TLS only, traffic flows **through Tailscale's relay servers over the public internet**,
  and it is "subject to non-configurable bandwidth limits". That defeats "LAN-only", adds a
  round trip out of the house and back for every card dealt, and makes your game depend on
  the broadband.
- **Cloudflare Tunnel / ngrok**: same shape as Funnel — real certs, no client setup, but
  every websocket frame hairpins out to the internet and back. Latency goes from
  sub-millisecond LAN to tens of ms, and the game dies when the broadband does. For a game
  where all participants are in one room, this is architecturally silly.

#### (e) Frank ranking for "10 guests' phones, some you will not touch, one night"

1. **Plain HTTP on a LAN IP.** Zero friction, zero failure modes, works on every phone
   including the one belonging to the friend who won't hand you their device. Design around
   the missing APIs.
2. **Publicly-trusted cert via DNS-01 on a domain you own**, pointing at the private IP.
   Zero guest friction, real security. Costs you a domain, an ACME timer, and a fight with
   router rebind protection. Do this if and only if you decide you need the wake lock or a
   PWA badly enough.
3. **`traefik.me`** — same zero-friction result for near-zero effort, but the private key is
   public so it's cosmetic TLS, and you're depending on someone's side project.
4. **mkcert root CA installed on each phone.** Actually secure, but you must physically
   handle 10 phones and walk each through a two-step iOS trust dance. Fine for the iPad and
   your own phone; a non-starter for guests.
5. **Bare self-signed with click-through.** Ugly interstitial, doesn't reliably restore
   secure-context features anyway, and trains people to click through cert warnings.
6. **Tailscale (tailnet mode).** Requires an app and an account on every guest phone.
7. **Funnel / Cloudflare Tunnel / ngrok.** Routes an in-room game through the internet.

---

## 2. How phones address the box

### 2.1 Raw IPv4 address

`http://192.168.1.50:3000`. Works on literally everything, no resolution step, no mDNS, no
DNS, no router cooperation. The only problem is that the address can change (see
[§6.3](#63-dhcp-reassigning-the-address)) and that it's tedious to type. Both are solvable.

### 2.2 mDNS `.local` (RFC 6762)

[RFC 6762](https://www.rfc-editor.org/rfc/rfc6762) reserves `.local` for link-local
multicast name resolution over UDP/5353.

- **macOS / iOS / iPadOS**: Bonjour is Apple's implementation and has been in the OS
  forever. `pokerpi.local` resolves in Safari on iOS. This is solid.
- **Windows**: since Windows 10 (1803-ish) there's a built-in mDNS resolver; Bonjour
  (via iTunes) covers older.
- **Android**: this is where the folklore is. The historical truth is that Android had
  `NsdManager` for *apps* but **no system resolver for `.local` names**, so typing
  `foo.local` in Chrome failed. That changed: Android gained `.local` mDNS resolution in the
  **DNS resolver Mainline module**, rolled out silently around **November 2021** and
  applying to **Android 12 and later** (not backported to 11 or earlier)
  ([Android Police, 2022-06-10](https://www.androidpolice.com/android-mdns-local-hostname/);
  tracked at [issuetracker.google.com/issues/140786115](https://issuetracker.google.com/issues/140786115),
  which Google reportedly never marked resolved).
- **Chrome's role**: Chrome does not implement mDNS for navigation itself — when a `.local`
  name is requested, Chrome **delegates host resolution to the OS**, so it resolves via mDNS
  if and only if the OS does. See the discussion on
  [chromium-discuss](https://groups.google.com/a/chromium.org/g/chromium-discuss/c/6b0vVreNTvQ)
  and the long-standing
  [crbug 41127207 "Consider bypassing Android resolution to allow .local"](https://issues.chromium.org/issues/41127207).
- **Important non-implication**: Chrome *does* use mDNS names (`<uuid>.local`) to obfuscate
  local IPs in **WebRTC ICE candidates**. That is an entirely separate mechanism —
  Chrome resolves those internally for its own ICE stack. It tells you **nothing** about
  whether the omnibox will resolve `pokerpi.local`.

**Honest status (2026-07-25): `.local` should work on Android 12+ and iOS, but I could not
find an official Google/Chromium statement guaranteeing it, and reports of it failing on
particular OEM builds and on mesh/multi-AP networks are common.** Treat mDNS as a *nice
shortcut you test in advance*, never as the primary addressing plan. Have the raw IP ready.

### 2.3 Router DNS / DHCP static lease + hostname

Most home routers run dnsmasq (or a lookalike) that registers DHCP client hostnames into its
own resolver, so `pokerpi` or `pokerpi.lan` / `pokerpi.home.arpa` / `pokerpi.fritz.box`
resolves. Why this is unreliable:

- **The suffix is vendor-specific and inconsistent**: `.lan`, `.home`, `.localdomain`,
  `.fritz.box`, `.home.arpa`, or nothing at all. Some routers don't do it whatsoever.
- **Phones may not use the router's DNS search suffix.** The DHCP "domain search" option
  (option 119) is inconsistently honoured by mobile OSes, and the bare hostname `pokerpi`
  typed into a browser is frequently treated as a **search query** rather than a hostname —
  so it goes to Google instead of the Pi. Typing `http://pokerpi/` (with the scheme) forces
  hostname interpretation, which helps but doesn't fix the missing suffix.
- **Phones on cellular-plus-Wi-Fi, or with Private DNS / DNS-over-HTTPS enabled, bypass the
  router's resolver entirely.** Android's "Private DNS" (DoT) defaults to Automatic and can
  silently take DNS away from the router. This is a very common cause of "it works on my
  laptop but not my phone".

**Verdict:** worth setting up as a convenience, never worth relying on.

### 2.4 The actually-good answer: a QR code

Sidestep the whole problem. Display a QR code encoding `http://192.168.1.50:3000/` on the
iPad table-top screen (and/or print one). Guests point their camera at it; both iOS and
Android camera apps offer to open the URL. **No typing, no DNS, no mDNS, no `.local`.**

- Generate it server-side at boot from the box's actual current IP, so it's always right even
  if DHCP moved you.
- Show it permanently in a corner of the table-top UI, plus full-screen on demand ("new
  player joining").
- **Caveat:** a QR code carrying `https://` with a bad cert still lands on the interstitial —
  the QR code solves *addressing*, not *trust*. This is another reason plain HTTP + QR is
  such a clean combination.
- Consider encoding a short join path with the table code baked in
  (`http://192.168.1.50:3000/j/ABCD`) so the phone lands directly in the game.

### 2.5 Port: is `:443` worth it?

Mildly. It removes `:3000` from what a human types, and matters not at all if you're using a
QR code. Weigh against the extra config.

If you do want a low port with a non-root Node process, three options:

1. **systemd ambient capabilities** — cleanest. Per
   [systemd.exec(5)](https://manpages.debian.org/testing/systemd/systemd.exec.5.en.html),
   `AmbientCapabilities=` "Controls which capabilities to include in the ambient capability
   set for the executed process", and is described as useful "if you want to execute a
   process as a non-privileged user but still want to give it some capabilities". Combine
   with `CapabilityBoundingSet=`:
   ```ini
   User=poker
   CapabilityBoundingSet=CAP_NET_BIND_SERVICE
   AmbientCapabilities=CAP_NET_BIND_SERVICE
   ```
2. **`net.ipv4.ip_unprivileged_port_start`** — a sysctl that "defines the first unprivileged
   port in the network namespace. Privileged ports require root or CAP_NET_BIND_SERVICE in
   order to bind to them", default **1024**
   ([kernel ip-sysctl docs](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html)).
   Setting it to e.g. `80` is a blunt system-wide change; prefer option 1.
3. **Reverse proxy** (Caddy/nginx) on 80/443 forwarding to Node on 3000. Adds a moving part.
   Only worth it if you take on TLS, in which case **Caddy is the right answer** because it
   handles ACME renewal for you.

If you stay on plain HTTP, honestly: **just use port 80** via ambient capabilities, or keep
`:3000` and let the QR code carry it. Don't build a reverse proxy for nothing.

---

## 3. Packaging and running on the Pi

### 3.1 systemd vs pm2 vs Docker

**Use bare Node under systemd.** Reasoning:

- **systemd is already there**, is the init system, handles restart, boot ordering, logging,
  resource limits, user isolation, and capabilities — all in ~15 lines of config with no
  extra dependency.
- **pm2** duplicates what systemd already does. Its own
  [startup docs](https://pm2.keymetrics.io/docs/usage/startup/) reveal the overhead: you run
  `pm2 startup`, paste back a generated sudo command that installs a systemd unit, then
  `pm2 save` to persist the process list — and **"When upgrading Node.js, reinstall the
  startup script by running `pm2 unstartup` then `pm2 startup` again"**. That's a second
  layer of state (the dumped process list) that can drift from your repo. pm2's cluster mode
  and log rotation are genuinely nice, but you have one process and journald.
- **Docker**: **you cannot build images in this WSL dev environment right now** (Docker is
  not available), so the whole "build image locally, push, pull on Pi" loop is closed to you
  today. You could build *on the Pi*, but that means installing Docker on the Pi, pulling
  base layers over the house broadband, and burning SD-card writes — to containerise a
  single Node process with no dependencies. Not worth it. If you later want reproducibility,
  revisit; the systemd unit is a 10-minute migration either way.

### 3.2 Sample systemd unit

`/etc/systemd/system/poker.service`:

```ini
[Unit]
Description=Table Top Poker server
Documentation=https://github.com/ewanhardingham/table-top-pocker
# See §5 for why network-online.target is a weaker promise than it looks
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=poker
Group=poker
WorkingDirectory=/opt/poker/current
EnvironmentFile=/etc/poker/poker.env
ExecStart=/usr/bin/node /opt/poker/current/dist/server.js
Restart=always
RestartSec=2
# Don't give up after 5 rapid restarts — a poker night is not a production SLO
StartLimitIntervalSec=0

# Only if you want to bind :80 / :443 as a non-root user
# CapabilityBoundingSet=CAP_NET_BIND_SERVICE
# AmbientCapabilities=CAP_NET_BIND_SERVICE

# Cheap hardening; all supported on Raspberry Pi OS
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/poker

# journald picks up stdout/stderr automatically
StandardOutput=journal
StandardError=journal
SyslogIdentifier=poker

[Install]
WantedBy=multi-user.target
```

Directive semantics per
[systemd.exec(5)](https://manpages.debian.org/testing/systemd/systemd.exec.5.en.html) and
[systemd.service(5)](https://manpages.debian.org/testing/systemd/systemd.service.5.en.html):
`User=` "Set the UNIX user or group that the processes are executed as"; `WorkingDirectory=`
sets the cwd; `EnvironmentFile=` reads `KEY=value` lines into the environment.

Operating it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now poker        # enable = survives reboot
sudo systemctl restart poker
systemctl status poker
journalctl -u poker -f                   # live tail
journalctl -u poker -b                   # this boot only
journalctl -u poker --since "1 hour ago"
```

Note `StartLimitIntervalSec=0`: by default systemd gives up after 5 restarts in 10 seconds
and leaves the unit dead. On poker night you want it to keep trying forever.

### 3.3 Node version and ARM

From [nodejs.org/en/download](https://nodejs.org/en/download) (checked 2026-07-25):
**Node 24.18.0 is the active LTS**, 26.5.0 is Current. Use the **LTS**.

Platform tiers from
[nodejs/node BUILDING.md](https://github.com/nodejs/node/blob/main/BUILDING.md):

| Arch | Requirements | Tier |
|---|---|---|
| GNU/Linux **arm64** | kernel ≥ 4.18, glibc ≥ 2.28 | **Tier 1** |
| GNU/Linux **armv7** | kernel ≥ 4.18, glibc ≥ 2.28 | **Experimental** — "Downgraded as of Node.js 24" |
| GNU/Linux **armv6** | — | **Not listed. Not supported.** |

Consequences:

- **Run 64-bit Raspberry Pi OS and the arm64 Node build.** That's Tier 1 — the same support
  level as x86-64 Linux.
- **armv7 (32-bit Pi OS) was downgraded to Experimental in Node 24.** Test failures on armv7
  no longer block releases. Avoid it.
- **ARMv6 devices — Pi 1, Pi Zero / Zero W (BCM2835, ARM1176) — have no official Node build
  at all.** There are unofficial builds but you don't want to depend on them. **Do not use a
  Pi Zero W (the original).**
- The Pi Zero 2 W is fine: Raspberry Pi's own product page specifies **"1GHz quad-core
  64-bit Arm Cortex-A53 CPU"**
  ([raspberrypi.com](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/)), so it
  runs 64-bit Pi OS and Tier-1 arm64 Node. Note its **512MB RAM** — plenty for your server,
  tight if you also try to build TypeScript on it.
- Raspberry Pi's [OS docs](https://www.raspberrypi.com/documentation/computers/os.html)
  state the 64-bit version is for "Raspberry Pi 3, 4, and 5" and the 32-bit for "the original
  Raspberry Pi, Raspberry Pi 2, and Raspberry Pi Zero". (The Zero 2 W is 64-bit-capable
  despite the family name — go by the Cortex-A53 core, not the "Zero" label.)

### 3.4 Build TS locally, ship JS

**Ship compiled JavaScript. Do not run `tsc` on the Pi.** Reasons:

- `tsc` on 512MB (Zero 2 W) or 1GB (Pi 3B+) is slow and can OOM. On a Pi 4/5 it's fine but
  still pointless.
- It forces `devDependencies` and a full `node_modules` onto the box, multiplying SD-card
  writes and install time.
- It makes the Pi's state depend on a toolchain that may drift from your dev machine.
- Deploying a build artifact means the thing you tested is byte-for-byte the thing that runs.

Concretely: `npm ci && npm run build` on the dev machine → `dist/` + `package.json` +
`package-lock.json`, then `npm ci --omit=dev` on the Pi (or ship `node_modules` too if you
have no native deps and matching arch — you don't, so prefer `npm ci --omit=dev`). Even
better: bundle to a single file with esbuild and ship one `.js`, making the Pi's
`node_modules` empty. For a small game server with a handful of deps (`ws`, maybe
`express`), that's very achievable and makes deploy an `rsync` of one file.

---

## 4. Which Pi

The workload — ~10 websockets, small JSON messages, a pure in-memory game engine, no
database of consequence, no media — is **trivial**. It would run on hardware from 2005.
Choose for reliability and convenience, not performance.

From [raspberrypi.com/documentation/computers/raspberry-pi.html](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html)
and the product pages:

| Model | SoC / core | RAM | Notes for this job |
|---|---|---|---|
| **Pi Zero W** (original) | BCM2835, ARM1176 (**ARMv6**) | 512MB | ❌ **No official Node build.** Also weak Wi-Fi. Avoid. |
| **Pi Zero 2 W** | RP3A0, quad Cortex-A53 (64-bit) | 512MB | ✅ Fully sufficient. 2.4GHz Wi-Fi only, no ethernet. Cheapest viable. Build TS elsewhere. |
| **Pi 3B+** | BCM2837B0, Cortex-A53 | 1GB | ✅ Has **gigabit-over-USB2 ethernet** (~300Mbps real) and dual-band Wi-Fi. Great if you already own one. |
| **Pi 4** | BCM2711, Cortex-A72 | 1–8GB | ✅✅ **Sweet spot.** True gigabit ethernet, dual-band Wi-Fi, **USB mass-storage boot** (get off the SD card). USB-C, 5V/3A (15W). |
| **Pi 5** | BCM2712, Cortex-A76 | 1–16GB | ✅ Overkill but pleasant. **NVMe boot** via M.2 HAT+. Needs 5V/5A (25W) for full capability, or 5V/3A with a 600mA peripheral limit. Runs hotter; wants active cooling. |

**Non-Pi alternatives:**

- **An old laptop.** Genuinely the best "free" option: x86-64 (Tier 1 Node), an SSD instead
  of an SD card, a **built-in UPS** (the battery), ethernet, and a screen for debugging.
  Downsides: idle power draw, fan noise, lid-close suspend (set
  `HandleLidSwitch=ignore` in `logind.conf`), and it's ugly on the sideboard.
- **A mini PC** (N100-class). Silent, ~6W idle, NVMe, x86-64. The "grown-up" answer if you
  want an always-on home server for more than poker.
- **A Mac mini.** Fine, wildly over-specced, and macOS is a worse fit for unattended service
  management than systemd.
- **The iPad itself.** No. iOS/iPadOS does not let a third-party app run a persistent
  background TCP listener — background execution is tightly limited, the app is suspended
  when backgrounded or the screen locks, and there is no way to run Node. Even if you wrote
  a native Swift server, it would die the moment the table-top app wasn't frontmost. The
  iPad is a *client*, not the host. (A laptop acting as both server and table-top display is
  the sane version of this idea.)

**SD card wear is the real reliability risk** for an always-on box. Flash cards die from
write cycles, and Linux writes logs, atime updates and swap continuously. Mitigations, in
order of effectiveness:

1. **Boot from USB SSD (Pi 4/5) or NVMe (Pi 5).** Both officially supported per the
   Raspberry Pi docs. Eliminates the problem.
2. Buy a **quality A2-rated card** from a real vendor and don't trust cheap ones.
3. Cap journald: `Storage=volatile` or `SystemMaxUse=50M` in `/etc/systemd/journald.conf`.
4. Mount with `noatime`. Disable swap (`dphys-swapfile`) if you have the RAM.
5. **Keep a known-good image.** The correct disaster plan for a dead SD card is "swap in the
   spare", so `dd` an image of the working card once it's set up.

**Power supply**: use the **official** PSU for the model. Under-voltage on a Pi presents as
random freezes, USB dropouts and SD corruption, and is very commonly misdiagnosed as
software. Pi 4 wants 5V/3A USB-C; Pi 5 wants 5V/5A. Check `vcgencmd get_throttled` /
`dmesg | grep -i voltage` if anything is flaky.

---

## 5. Deployment and surviving reboots

### 5.1 Getting code onto the Pi

Options, worst to best for this use case:

- **Git pull on the Pi.** Requires the toolchain and a build on the Pi (§3.4 says no), plus
  git credentials on the box. Skip.
- **Tarball + scp + manual untar.** Works, but every step is manual and therefore skippable
  at 7pm on game night.
- **rsync over SSH.** ✅ **Recommended.** Fast (delta transfer), idempotent, one command,
  no agent on the Pi beyond sshd.

A ~15-line `deploy.sh` on the dev machine is the whole answer:

```bash
#!/usr/bin/env bash
set -euo pipefail
HOST=poker@192.168.1.50          # or pokerpi.local
REMOTE=/opt/poker

npm ci
npm run build
npm test

# Ship dist + manifests. Atomic-ish: stage into a release dir, then flip a symlink.
REL="$REMOTE/releases/$(date +%Y%m%d-%H%M%S)"
ssh "$HOST" "mkdir -p $REL"
rsync -az --delete dist/ "$HOST:$REL/dist/"
rsync -az package.json package-lock.json "$HOST:$REL/"
ssh "$HOST" "cd $REL && npm ci --omit=dev --no-audit --no-fund"
ssh "$HOST" "ln -sfn $REL $REMOTE/current && sudo systemctl restart poker"
ssh "$HOST" "systemctl is-active poker"
```

The symlink flip gives you a one-line rollback (`ln -sfn releases/<older> current &&
systemctl restart poker`), which is worth more than it costs. Grant the `poker` user a
narrow sudoers rule for `systemctl restart poker` so deploy needs no interactive password.

If you bundle to a single JS file with esbuild, the `npm ci --omit=dev` step disappears
entirely and deploy is one `rsync` + one `systemctl restart`. Strongly recommended.

### 5.2 Boot survival

`sudo systemctl enable poker` creates the `multi-user.target.wants` symlink and is all you
need. Verify with `systemctl is-enabled poker` and, more usefully, **actually reboot the Pi
once and confirm the game comes back** — this is the single highest-value five minutes of
testing you can do.

**The `network-online.target` trap.** From systemd's own
[NETWORK_ONLINE doc](https://systemd.io/NETWORK_ONLINE/):

> "network-online.target means that the network connectivity has been reached, not that it
> is currently available. By the very nature and design of the network, connectivity may
> briefly or permanently disappear"

and

> "network-online.target will time out after 90s. Enabling this might considerably delay
> your boot even if the timeout is not reached."

systemd explicitly recommends *against* depending on it, and instead writing services that
react to network changes. What this means for you:

- `After=network-online.target` does **not** guarantee DNS works, or that Wi-Fi has
  associated, or that the address won't change afterwards.
- Your Node server must **bind lazily and retry**, or bind to `0.0.0.0` (which succeeds
  before any interface has an address) rather than to a specific IP. **Bind `0.0.0.0` and
  the ordering question mostly evaporates.**
- If you generate the QR code from the box's own IP, generate it **on request**, not once at
  startup — the address at boot may not be the address later.
- Use `systemd-analyze blame` / `systemd-analyze critical-chain poker.service` if boot is
  slow.

### 5.3 Unattended upgrades

`unattended-upgrades` is **not enabled by default on Raspberry Pi OS** — the official
[OS documentation](https://www.raspberrypi.com/documentation/computers/os.html) tells users
to run `sudo apt update && sudo apt full-upgrade` manually, and does not mention automatic
updates. Debian ships the package but security-only auto-upgrades are opt-in on Pi OS. The
`apt-daily.timer` / `apt-daily-upgrade.timer` units exist and will *download* updates.

If you do enable it, the relevant knob is `Unattended-Upgrade::Automatic-Reboot` in
`/etc/apt/apt.conf.d/50unattended-upgrades`, which **defaults to `"false"`** — so the
nightmare scenario (box reboots mid-hand) does not happen out of the box.

**Recommendation:** leave unattended-upgrades **off**, or enable it with
`Automatic-Reboot "false"` and patch manually. This box is not internet-exposed; the attack
surface is your own LAN. Being a month behind on patches is a far smaller risk than an
unexpected reboot or a kernel update that breaks Wi-Fi on game night. **Never patch on the
day of a game.** If you must automate, set
`Unattended-Upgrade::Automatic-Reboot-Time "04:00"` and accept the risk.

---

## 6. Failure modes to design against

### 6.1 Guest Wi-Fi / AP client isolation — the #1 killer

**AP isolation** (also "client isolation", "wireless isolation", "station isolation") is a
layer-2 feature on the access point that blocks frame forwarding between clients on the same
SSID. Devices can talk to the router and out to the internet, and to **nothing else on the
LAN** ([TP-Link: What Is AP Isolation?](https://www.tp-link.com/us/blog/2586/what-is-ap-isolation-and-when-to-enable-it-/)).

It is **commonly on by default for guest networks** specifically — that's largely the point
of a guest network. Defaults vary by vendor (Cisco SMB ships it off; ASUS/TP-Link guest
networks commonly ship it on), so you cannot assume.

**Symptoms**: the phone has full internet, the Wi-Fi icon looks perfect, and
`http://192.168.1.50:3000` just times out. It fails silently and looks like your server is
broken. This will cost you 20 minutes of debugging if you haven't pre-diagnosed it.

**Detection** (do this the day before, not on the night):
- From a phone on the guest SSID, try to load the server. If it times out while the internet
  works, that's your answer.
- Compare: same phone on the main SSID works, guest SSID doesn't → isolation.
- The guest network is often on a **different subnet** entirely (e.g. `192.168.3.x` vs
  `192.168.1.x`) — check the phone's assigned IP; a different first-three-octets is a
  giveaway that guests are routed, not bridged, and likely firewalled.

**Mitigation: put everyone on the main SSID.** Write the main Wi-Fi password on the QR-code
card next to the join URL, or better, print a **Wi-Fi QR code** (`WIFI:S:<ssid>;T:WPA;P:<pw>;;`)
alongside the join QR code — both iOS and Android cameras join a network from that. Two QR
codes on one card and the whole onboarding problem disappears.

(Turning AP isolation off on the guest network is the other fix, but you're then handing
guests LAN access anyway, so you may as well use the main SSID.)

### 6.2 Phones sleeping and backgrounded tabs

This is the second-biggest practical risk and it interacts directly with your
**"disconnected players auto-fold"** rule.

**What actually happens.** Per Chrome's
[Page Lifecycle API docs](https://developer.chrome.com/docs/web-platform/page-lifecycle-api):

- **hidden** — the page is no longer visible. "Often the last state that's reliably
  observable by developers (especially on mobile)". Detect via
  `document.visibilityState` / `visibilitychange` (Page Visibility API).
- **frozen** — the browser may freeze a hidden page to save resources: "freezable tasks in
  the task queues are suspended until the page is unfrozen". Timers and fetch callbacks stop.
  `freeze` / `resume` events fire (Chrome 68+).
- **discarded** — the tab is unloaded entirely. "No tasks, event callbacks, or JavaScript of
  any kind can run in this state." You only learn it happened via `document.wasDiscarded` on
  reload.

The Chrome guidance is explicit: on entering frozen you should "**Stop any network polling or
close any open Web Socket connections**".

**bfcache** (back/forward cache) applies the same freezing. Per
[web.dev/articles/bfcache](https://web.dev/articles/bfcache): "Chrome (as of 149) and Safari
do **not** block on open WebSockets but other browsers do" — meaning your open socket won't
prevent the page being bfcached, but it also won't be usefully alive while cached. The
recommended pattern is to close on `pagehide`/`freeze` and reopen on `pageshow`/`resume`.
On iOS, all browsers use WebKit, so they all behave like Safari.

**Safari / iOS specifics.** iOS is the aggressive one: when the screen locks or the user
switches apps, Safari suspends the page quickly, JS stops, and the TCP connection is
typically torn down within seconds-to-tens-of-seconds. It does **not** send a clean
WebSocket close in all cases, so **the server frequently learns about it only via ping
timeout, not via a `close` event**. I could not find an Apple primary source that documents
the timings — WebKit does not publish them. **Treat exact timeouts as unverified/anecdotal;
design as if disconnection is instant and unannounced.**

**Screen Wake Lock** is the direct fix and it is **secure-context-only**
([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)) — this is the
one genuine product reason to want HTTPS. Support:

- **Safari iOS 16.4+** — announced in
  [WebKit Features in Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
  (2023-03-27): "The Screen Wake Lock API provides a mechanism to prevent devices from
  dimming or locking the screen." Confirmed by [caniuse](https://caniuse.com/wake-lock),
  which shows iOS Safari 16.4 through current (26.x) supported.
- **Chrome Android** — supported. MDN marks the API **Baseline 2025** ("Since March 2025,
  this feature works across the latest devices and browser versions"); global support ~93%
  per caniuse. (Caniuse's Chrome-Android column renders oddly; I did not independently
  confirm the exact first-supporting Chrome Android version — treat "Chrome 84" as the
  commonly-cited figure but **unverified** here.)
- Note the wake lock is **released automatically when the page becomes hidden**, so you must
  re-acquire it on `visibilitychange` back to visible. That is by spec, not a bug.

**Design advice — this is the important part:**

1. **Assume disconnects are normal, frequent, and meaningless.** A phone locking is not a
   player leaving.
2. **Make reconnect cheap and automatic.** On `pageshow`/`resume`/`visibilitychange→visible`,
   reconnect immediately. Exponential backoff with a short floor (200ms) and jitter.
3. **Identity must survive the socket.** Give each player a durable token in `localStorage`
   (or an httpOnly cookie). On reconnect, the client presents the token and the server
   re-attaches it to the existing seat — the *seat* is the entity, the socket is just a pipe.
4. **Send full state on reconnect,** not a delta. Cheap at this scale, and it removes an
   entire category of bug.
5. **Decouple "socket closed" from "player disconnected".** Grace period before you even
   consider a player gone. Something like: socket closes → seat enters `stale` (UI shows a
   subtle indicator) → after N seconds with no reconnect → `disconnected`.
6. **⚠️ The auto-fold rule must not fire on a lock screen.** Concretely:
   - Auto-fold should be driven by the **action clock**, not by socket state. If it's your
     turn and you don't act within the timer, you fold — same rule whether you're
     disconnected or just thinking. That's a rule players understand and it's independent of
     network flakiness.
   - Give a generous grace period (≥30–60s) before a disconnect *shortens* anything.
   - **Never auto-fold a player who is not facing a decision.** A disconnected player with
     no pending action should just... sit there.
   - Consider auto-check-when-free instead of auto-fold when there's no bet to call — folding
     a free option is strictly worse for the player and feels punitive.
   - Surface it on the table-top iPad ("Dave's phone went to sleep — 45s") so the room can
     shout at Dave instead of the game silently robbing him.
7. **Server-side heartbeat.** `ws` gives you `ping`/`pong`; ping every ~15s and treat two
   missed pongs as stale. Don't rely on TCP to tell you.
8. **Keep the table-top iPad awake by other means.** It's a device you control: Settings >
   Display & Brightness > Auto-Lock > Never, and plug it in. Don't burn your HTTPS decision
   on the one device you can configure by hand.

### 6.3 DHCP reassigning the address

- **DHCP reservation on the router** (bind the Pi's MAC to a fixed IP) — ✅ **preferred.**
  The Pi still does normal DHCP, so it gets correct gateway/DNS/subnet automatically and
  cannot conflict with the pool. One place to change it. Works identically on Wi-Fi and
  ethernet — but note **the Wi-Fi and ethernet interfaces have different MACs**, so reserve
  both if you might switch.
- **Static IP configured on the Pi** (NetworkManager `ipv4.method manual` on Bookworm+) —
  works, but you must pick an address outside the DHCP pool by hand, you hardcode
  gateway/DNS, and the box breaks in a confusing way if you ever move it to another network.
  Use only if the router won't do reservations.
- **mDNS sidesteps it** — `pokerpi.local` follows the box wherever it lands, if `.local`
  resolution works on the client (§2.2). Belt and braces: do the reservation *and* run
  Avahi.
- **QR code sidesteps it too** — generate the QR from the interface's current address at
  request time and the address never matters.

Do all three. They're each five minutes and they fail independently.

### 6.4 Wi-Fi vs ethernet, and power save

- **Use ethernet if the Pi can reach a socket.** It removes an entire class of problem:
  no association drops, no band steering, no power save, no channel congestion from ten
  phones. On a Pi 4/5 that's real gigabit.
- **Wi-Fi power save on the Pi is a classic silent killer.** The `brcmfmac` driver enables
  power management by default; the interface sleeps between beacons and *inbound* packets to
  an idle server get delayed by tens to hundreds of milliseconds, or the association drops
  entirely after a quiet period. Symptom: the game is fine while busy and hangs after
  everyone folds quickly. Check with `iw dev wlan0 get power_save`; disable with
  `sudo iw dev wlan0 set power_save off`, and persist it (a `systemd` oneshot unit
  `Before=poker.service`, or `wifi.powersave = 2` in a NetworkManager conf drop-in). **Do
  this — it's one line and it prevents a genuinely maddening bug.**
- **Mesh networks and multiple bands.** Two problems:
  - Some mesh/extender setups put satellite clients on a **different subnet** or NAT them,
    so a phone on the far node can't reach the Pi on the main node at all.
  - **mDNS is link-local by design** (RFC 6762 — multicast to `224.0.0.251`, TTL 1). It does
    not cross subnets and is not routed. Many mesh systems and managed APs **do not forward
    multicast between radios or nodes**, or aggressively rate-limit it. So `.local` can work
    from the sofa and fail from the kitchen. Consumer mesh (Eero, Deco, Google Wifi)
    generally bridges properly and forwards mDNS, but "generally" is doing a lot of work in
    that sentence.
  - 2.4GHz vs 5GHz on the *same* SSID is normally fine (same bridge, same subnet) but is
    another thing to check if one phone misbehaves.
- **Practical:** test from the **furthest room you'll actually play in**, on the SSID
  everyone will use, before the night.

---

## 7. Recommended setup

### The decision on HTTPS, stated plainly

**Stay on plain HTTP over a LAN IP. Design the app to avoid secure-context APIs.**

Reasoning:

- The friction of HTTPS on a LAN falls entirely on the people you can least afford to
  inconvenience — guests, at the start of a social evening, some of whose phones you will
  never hold.
- The set of secure-context APIs you actually lose is small and mostly replaceable: no
  service worker (you don't need offline — the server is 3 metres away), no `crypto.subtle`
  (do crypto server-side; use `getRandomValues` client-side, which is not gated), no
  notifications (the table-top iPad is your notification surface), no `navigator.clipboard`
  (use `execCommand('copy')` or a QR code).
- The only real loss is **Screen Wake Lock**, and the mitigations in §6.2 — a robust
  reconnect path, seat identity that outlives the socket, and an action-clock-based auto-fold
  rather than a disconnect-based one — are things you should build **anyway**, because the
  wake lock is not a guarantee. It is released whenever the page is hidden, users can still
  lock their phone manually, and Low Power Mode interferes. **A wake lock reduces the
  frequency of the problem; it does not remove the need to handle it.** So the engineering
  work is not avoidable, which means the cert doesn't actually buy you out of anything.
- The threat model is ten friends in one room. TLS defends against a network attacker you do
  not have. (Do still keep secrets out of the client — hole cards go only to the seat that
  owns them, enforced server-side. That's an application concern, not a transport one.)

**Cost of this decision:** no installable PWA, no push notifications, screens dim during
long hands. Accept it, and put a big "keep your screen on" note in the join screen.

**If you later change your mind**, the migration is: get a domain, run Caddy with a DNS-01
ACME provider module, point Caddy at Node on `localhost:3000`, add a router DNS override so
`poker.example.com` → `192.168.1.50` (dodging rebind protection), and switch the client from
`ws://` to `wss://`. **Note:** once the page is HTTPS you **must** use `wss://` — plain
`ws://` from an `https://` page is blocked as mixed content (the W3C Mixed Content spec
treats `wss` as an *a priori authenticated* URL and `ws` as not; MDN's
[Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content) page
describes the general blockable/upgradable split but does not name WebSockets explicitly —
so I'm citing the spec's classification rather than an MDN sentence). Build the client so
the scheme is derived from `location.protocol`, never hardcoded, and this migration is a
non-event.

### The build

| Decision | Choice |
|---|---|
| Hardware | **Pi 4 (2GB)** if buying — true gigabit ethernet + USB-SSD boot. **Pi Zero 2 W** if minimising cost/space. **An old laptop** if you have one spare (built-in UPS!). |
| OS | **Raspberry Pi OS Lite, 64-bit** (Bookworm or later) |
| Storage | USB SSD boot on Pi 4/5; otherwise a quality A2 SD card + `noatime` + capped journald. Keep a spare imaged card. |
| Network | **Ethernet.** If Wi-Fi: main SSID, 5GHz, `power_save off` persisted. |
| Address | **DHCP reservation** on the router **and** Avahi (`pokerpi.local`) **and** a QR code generated from the live IP. |
| Runtime | **Node 24 LTS, arm64** (Tier 1) |
| Transport | **HTTP + `ws://`**, same origin, port 80 (via `AmbientCapabilities=CAP_NET_BIND_SERVICE`) or 3000 |
| Process mgmt | **systemd**, `Restart=always`, `StartLimitIntervalSec=0`, `systemctl enable` |
| Build | **`tsc`/esbuild on the dev machine**, ship `dist/` (ideally a single bundled file) |
| Deploy | **`rsync` over SSH** into a timestamped release dir, flip a `current` symlink, `systemctl restart` |
| Logs | `journalctl -u poker -f` |
| Updates | unattended-upgrades **off**; patch manually, never on game day |
| Onboarding | Two QR codes on a printed card: **Wi-Fi join** + **game URL** |

### What to do on the night — checklist

- [ ] **Day before:** power the Pi, `systemctl status poker`, reboot it, confirm the game
      comes back on its own.
- [ ] **Day before:** load the game on *two different phones* (one iPhone, one Android) on
      the SSID guests will use, from the **furthest room** you'll play in.
- [ ] **Day before:** confirm `iw dev wlan0 get power_save` is `off` (if on Wi-Fi), and that
      the DHCP reservation held.
- [ ] Print the card: **Wi-Fi QR + game QR + the raw `http://192.168.1.50:3000` as text**
      (fallback for anyone whose camera app misbehaves).
- [ ] Plug the Pi into a socket that nobody will kick. Ideally a UPS or at least not the
      switched extension lead.
- [ ] iPad: Auto-Lock → **Never**, plugged in, screen brightness up, browser in fullscreen.
- [ ] Everyone on the **main SSID**, not the guest network. Say it out loud.
- [ ] Tell players: **keep your screen on / the app in the foreground**; you'll be re-seated
      automatically if it sleeps.
- [ ] Have your laptop nearby with SSH already authenticated, so `journalctl -u poker -f` is
      one command away.

### Traps list

1. **AP isolation on the guest network** — silent, total, looks like a server bug. Main SSID.
2. **A different subnet on the guest/mesh network** — check the phone's IP prefix matches
   the Pi's.
3. **Android "Private DNS"** silently bypassing your router's resolver, breaking any
   router-DNS-based hostname.
4. **`.local` not resolving** on some Android build or across a mesh node. Always have the
   raw IP.
5. **DHCP moved the Pi** and your QR code was baked at build time. Generate it live.
6. **`localhost` works, LAN IP doesn't** — because `localhost` is a secure context and your
   LAN IP isn't. Test on a phone against the real IP early and often.
7. **Wi-Fi power save on the Pi** — game hangs during quiet periods.
8. **Under-powered PSU** — presents as random freezes and SD corruption, not as "low power".
9. **A phone locking triggers auto-fold** — make the auto-fold clock-driven, not
   socket-driven.
10. **Node binding to a specific IP at startup** before the network is up. Bind `0.0.0.0`.
11. **`network-online.target` promising more than it delivers** — don't rely on it.
12. **An OS update the day before** breaking Wi-Fi or the Node version.
13. **Router DNS rebinding protection** silently NXDOMAINing your public-domain-to-private-IP
    record (only if you take the cert route).
14. **Forgetting `wss://`** if you ever go HTTPS — derive the scheme from
    `location.protocol`.
15. **`systemd` giving up after 5 rapid restarts** — set `StartLimitIntervalSec=0`.

### Fallback plan

- **Game won't load on a phone** → check SSID first (guest vs main), then try the raw IP
  instead of `.local`, then check the phone's IP prefix.
- **Server dead** → `systemctl restart poker`, `journalctl -u poker -n 100`.
- **Pi unreachable** → look at `arp -a` from your laptop, or plug a monitor in. If the SD
  card is dead, swap the spare image.
- **Total hardware failure** → run the same `dist/` on your laptop
  (`node dist/server.js`), reconnect everyone to the laptop's IP via a freshly generated QR
  code. **This is why you build a single-file bundle and don't containerise: the fallback
  host is any machine with Node on it.** Rehearse this once.
- **Wi-Fi itself down** → you have a deck of physical cards. Ship the digital one with
  humility.

---

## Open questions / could not verify

Listed honestly, because being wrong about these would be worse than not knowing.

1. **iOS Safari's self-signed-cert interstitial behaviour.** Apple publishes nothing about
   whether the "visit this website" click-through exists in all current iOS versions, or how
   long the exception persists. All available accounts are anecdotal. **Unverified.**
2. **Android Chrome's cert-exception retention window.** Chromium describes proceed-through
   decisions as non-permanent but I found no authoritative statement of duration.
   **Unverified.**
3. **Whether a clicked-through self-signed cert restores all secure-context APIs.** I am
   confident service worker registration is refused on origins with cert errors and that
   Chrome treats the origin as having a broken security state, but I did not find a single
   normative source enumerating exactly which features are withheld. **Partially verified;
   directionally reliable, details uncertain.**
4. **Whether Apple's SAN / EKU-`serverAuth` / RSA-2048 / SHA-2 requirements apply to certs
   from *user-added* roots.** Apple's 398-day doc explicitly exempts user-added roots from
   the *validity* rule, and Špaček's empirical testing shows 825 days is the real ceiling
   there — but nobody has published tests for SAN/EKU/key-size against user-added roots.
   **Unverified.** (Assume they apply; mkcert does.)
5. **Whether Let's Encrypt explicitly refuses RFC1918 IPs.** I could not find that sentence
   in a Let's Encrypt primary source. The conclusion follows from (a) the CA/B Forum
   prohibition on Reserved IP Addresses since 2016-01-01 and (b) http-01/tls-alpn-01-only
   validation making a private IP unvalidatable from the internet. **Strong inference, not a
   direct quote.**
6. **Whether `.local` reliably resolves in Chrome on all Android 12+ devices.** The Mainline
   DNS resolver change is real and reported (Nov 2021, Android 12+), but Google never
   officially announced it, the tracking issue was never marked fixed, and OEM builds vary.
   **Treat as "probably works, must be tested".** My primary source here is Android Police,
   which is a secondary source citing AOSP documentation — I could not reach the AOSP doc or
   the issue tracker directly (issuetracker.google.com requires sign-in).
7. **Exact first Chrome-for-Android version supporting Screen Wake Lock.** MDN's Baseline
   2025 label and caniuse's ~93% figure confirm broad current support; the specific version
   number I could not read cleanly out of caniuse. **Unverified detail, immaterial in
   practice.**
8. **The exact timings of iOS Safari tearing down a WebSocket on screen lock / app switch.**
   WebKit does not publish these. **Unverified — design as if it's immediate.**
9. **Vendor defaults for AP isolation on guest networks.** Varies by manufacturer and
   firmware version; there is no cross-vendor authority. **Must be tested on your specific
   router.**
10. **traefik.me's exact certificate/key publication policy and its longevity.** The README I
    could reach describes the DNS behaviour; the wildcard-cert and published-key details come
    from secondary summaries and the project website rather than a quote I verified in the
    repo. **Partially verified — check it yourself before depending on it.**
11. **`systemd.exec` on freedesktop.org returned HTTP 403** to automated fetching; I used the
    Debian manpage mirror instead, which is the same content but is a mirror.

---

## Sources

**Secure contexts and web APIs**
- MDN, [Features restricted to secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts/features_restricted_to_secure_contexts) (last modified 2026-03-08)
- MDN, [Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) (last modified 2025-11-30)
- W3C, [Secure Contexts specification](https://w3c.github.io/webappsec-secure-contexts/)
- MDN, [Crypto.subtle](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/subtle)
- MDN, [Crypto.getRandomValues()](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues)
- MDN, [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)
- MDN, [Navigator.vibrate()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)
- MDN, [Mixed content](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)
- caniuse, [Screen Wake Lock API](https://caniuse.com/wake-lock)
- WebKit, [WebKit Features in Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/) (2023-03-27)

**Local Network Access**
- Chrome for Developers, [New permission prompt for Local Network Access](https://developer.chrome.com/blog/local-network-access)
- Chrome Platform Status, [Local network access restrictions](https://cr-status.appspot.com/feature/5152728072060928)
- blink-dev, [Intent to Ship: Local network access restrictions](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY)

**Certificates**
- Apple, [Trust manually installed certificate profiles in iOS, iPadOS, and visionOS](https://support.apple.com/en-us/102390)
- Apple, [Requirements for trusted certificates in iOS 13 and macOS 10.15](https://support.apple.com/en-us/103769)
- Apple, [About upcoming limits on trusted certificates](https://support.apple.com/en-us/102028)
- Michal Špaček, [Validity period of HTTPS certificates issued from a user-added CA is essentially 2 years](https://www.michalspacek.com/validity-period-of-https-certificates-issued-from-a-user-added-ca-is-essentially-2-years) (2023-08-18)
- mkcert, [README](https://github.com/FiloSottile/mkcert) — [Mobile devices](https://github.com/FiloSottile/mkcert#mobile-devices), [Supported root stores](https://github.com/FiloSottile/mkcert#supported-root-stores)
- CA/Browser Forum, [Guidance on Internal Names](https://cabforum.org/working-groups/server/internal-names/)
- CA/Browser Forum, [Guidance on IP Addresses in Certificates](https://cabforum.org/working-groups/server/guidance-ip-addresses-certificates/)
- Let's Encrypt, [6-day and IP Address Certificates are Generally Available](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability) (2026-01-15)
- Let's Encrypt, [We've Issued Our First IP Address Certificate](https://letsencrypt.org/2025/07/01/issuing-our-first-ip-address-certificate) (2025-07-01)
- Tailscale, [Enabling HTTPS](https://tailscale.com/kb/1153/enabling-https)
- Tailscale, [Tailscale Funnel](https://tailscale.com/kb/1223/funnel)
- Tailscale, [MagicDNS](https://tailscale.com/kb/1081/magicdns) and [DNS in Tailscale](https://tailscale.com/kb/1054/dns)
- [sslip.io / nip.io](https://sslip.io/)
- [traefik.me](https://github.com/pyrou/traefik.me)

**Naming and networking**
- IETF, [RFC 6762 — Multicast DNS](https://www.rfc-editor.org/rfc/rfc6762)
- Android Police, [Android silently picks up long-awaited mDNS feature](https://www.androidpolice.com/android-mdns-local-hostname/) (2022-06-10)
- Google Issue Tracker, [Add .local mDNS resolving to Android (140786115)](https://issuetracker.google.com/issues/140786115)
- Chromium, [Consider bypassing Android resolution to allow .local (crbug 41127207)](https://issues.chromium.org/issues/41127207)
- chromium-discuss, [Chrome browser — multicast DNS support](https://groups.google.com/a/chromium.org/g/chromium-discuss/c/6b0vVreNTvQ)
- dnsmasq, [man page](https://thekelleys.org.uk/dnsmasq/docs/dnsmasq-man.html) (`--stop-dns-rebind`, `--rebind-domain-ok`)
- TP-Link, [What Is AP Isolation? (And When to Enable It)](https://www.tp-link.com/us/blog/2586/what-is-ap-isolation-and-when-to-enable-it-/)

**Runtime, systemd, hardware**
- Node.js, [Download](https://nodejs.org/en/download) (Node 24.18.0 LTS / 26.5.0 Current as of 2026-07-25)
- Node.js, [BUILDING.md platform support](https://github.com/nodejs/node/blob/main/BUILDING.md)
- systemd, [systemd.exec(5)](https://manpages.debian.org/testing/systemd/systemd.exec.5.en.html)
- systemd, [systemd.service(5)](https://manpages.debian.org/testing/systemd/systemd.service.5.en.html)
- systemd, [Running Services After the Network Is Up](https://systemd.io/NETWORK_ONLINE/)
- Linux kernel, [ip-sysctl documentation](https://www.kernel.org/doc/html/latest/networking/ip-sysctl.html) (`ip_unprivileged_port_start`)
- pm2, [Startup script generator](https://pm2.keymetrics.io/docs/usage/startup/)
- Raspberry Pi, [Raspberry Pi hardware documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html)
- Raspberry Pi, [Raspberry Pi OS documentation](https://www.raspberrypi.com/documentation/computers/os.html)
- Raspberry Pi, [Raspberry Pi Zero 2 W product page](https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/)

**Page lifecycle**
- Chrome for Developers, [Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)
- web.dev, [Back/forward cache](https://web.dev/articles/bfcache)
