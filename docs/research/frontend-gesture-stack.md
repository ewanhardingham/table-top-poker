# Research: frontend stack for Phase 2 gesture work

Resolves [#8](https://github.com/ewanhardingham/table-top-poker/issues/8).
Feeds [#14](https://github.com/ewanhardingham/table-top-poker/issues/14) (framework and client architecture) and [#3](https://github.com/ewanhardingham/table-top-poker/issues/3) (repo structure and build tooling).
Touches [#7](https://github.com/ewanhardingham/table-top-poker/issues/7) (hosting on a Pi — see the HTTPS finding in §7), [#9](https://github.com/ewanhardingham/table-top-poker/issues/9)/[#11](https://github.com/ewanhardingham/table-top-poker/issues/11) (wire contract — see the "reveal is a client-side act" finding in §8).

**Question.** Which frontend stack best serves a gesture-driven, animated playing-card UI in a phone browser, and what must Phase 1 avoid doing to keep that door open?

Phase 2 is out of scope to build. Not painting Phase 1 into a corner is in scope. The bulk of the value in this document is **§8: the Phase 1 decisions that would be expensive to reverse.**

---

## 0. The headline, for the impatient

**Recommendation: React + Motion (`motion/react`) + `@use-gesture/react`, built as a plain Vite SPA, rendering cards as DOM elements.** The tie-breaker is Motion's `layoutId` — cross-tree shared-element animation (a card leaving your hand and *becoming* a card on the board) is one line in React and has no first-party equivalent in any other framework. **Svelte 5 + GSAP is a genuinely strong alternative** with a gentler learning curve and better dependency-durability signals; see §9 for that case made properly.

**But the framework matters far less than you'd expect.** A 60fps card drag is, in every framework, the same four lines: listen to `pointermove`, write `element.style.transform`, never touch framework state. What the framework choice actually buys you is the *settle* — the animation after you let go, and the reflow when cards move between places. That's where React's ecosystem is ahead, and it's the only reason it wins.

**The single most important Phase 1 rule**, if you read nothing else: *every player action must be dispatched through one function, the client must already hold its own hole cards before any reveal, and the phone screen must never be a scrolling page.* Everything else in §8 is cheaper to fix later than those three.

---

## 1. Framework candidates, judged on gesture and animation work

First, the thing nobody tells a backend engineer coming to this, because to frontend people it's ambient knowledge:

### 1.1 Why the framework is *almost* irrelevant to the drag itself

A finger drag at 60fps means: every ~16ms, take the finger's new position and move a card to match. The fast path is always the same — get a direct handle on the DOM element and set `element.style.transform = 'translate(120px, 40px)'`. That's a compositor-only property; the browser can move it on the GPU without recalculating layout or repainting anything ([Chrome, animations guide](https://web.dev/articles/animations-guide)).

The trap is routing that through the framework's state system. If each `pointermove` sets framework state, the framework does its full update cycle 60 times a second — and in React specifically, that means re-running your component function, diffing a virtual DOM, and committing. It often *works* on a desktop and then falls over on a phone. Every serious animation library for every framework exists partly to give you a legitimate way around this.

So the honest framing: **all four frameworks can do a smooth drag.** The differences are (a) how easy it is to accidentally do it wrong, and (b) what's already built for the parts that aren't the drag.

### 1.2 The parts that aren't the drag

Phase 2 as described in the ticket is really three distinct problems:

1. **Continuous, interruptible drag** — thumb moves, card follows, no lag. Solved by pointer events + direct DOM writes. Framework-neutral.
2. **Physics settle** — you let go, the card springs back or flies off with the velocity you gave it. Needs a spring/inertia implementation that can be *interrupted*: you grab a card mid-flight and it redirects smoothly from its current position and current velocity, rather than snapping. This is what separates "feels like an app" from "feels like a webpage."
3. **Layout animation / "cards move and settle"** — the board deals a card, hands reorder, a folded card leaves and the remaining ones close the gap. The technique is **FLIP** (First, Last, Invert, Play): measure where things were, let the layout change, measure where they are now, apply a `transform` that visually undoes the move, then animate that transform to zero. Done right it's transform-only and therefore free. Doing FLIP by hand is fiddly; having it built in is a real productivity difference.

Judge the frameworks on 2 and 3, not on 1.

### 1.3 The four candidates

**React.** Virtual DOM, re-runs your component function on every state change. That render model is the worst fit of the four *in principle* for per-frame updates — and yet React wins on this task, because its ecosystem has spent a decade building the escape hatches. React's own docs frame direct DOM access as legitimate: refs are "an escape hatch… you should only use them when you have to 'step outside React'," with the caveat "avoid changing DOM nodes managed by React" ([React docs, Manipulating the DOM with refs](https://react.dev/learn/manipulating-the-dom-with-refs)). Motion's `MotionValue` and react-spring's `SpringValue` are precisely the sanctioned version of this: a value that lives outside React's render cycle and writes straight to the DOM, so a drag never triggers a re-render. Plus Motion's `layout` prop, which is automatic FLIP with no measurement code at all — the closest thing to a purpose-built answer to "cards move and settle" in any framework.

*Cost to a beginner:* you must learn the rule "drag state does not go in `useState`", and you will hit it. *Benefit:* when you're stuck, there are ten thousand people who have been stuck on the same thing, and the reference implementations of every card/swipe/deck UI on the web are in React.

**Svelte (v5).** Compiles away; since v5's runes, updates are fine-grained — changing one value updates one DOM property, no diffing. The trap from §1.1 barely exists here. And a surprising amount of Phase 2 is *in the box*: `svelte/motion` exports a `Spring` class taking `stiffness`, `damping`, `precision`, with `.target` and `.current`, and `spring.set(value, { preserveMomentum })` where the spring "will continue on its current trajectory for the specified number of milliseconds" — a documented fling primitive ([svelte.dev, svelte/motion](https://svelte.dev/docs/svelte/svelte-motion)). And `animate:flip` from `svelte/animate` is built-in FLIP: it "calculates the start and end position of an element and animates between them," with the one constraint that it must be inside a **keyed** `{#each}` block ([svelte.dev, svelte/animate](https://svelte.dev/docs/svelte/svelte-animate)).

That keyed-block constraint is itself a Phase 1 finding — see §8.3.

*Cost:* thinner gesture ecosystem; you'll likely write your own pointer handling (~80 lines, and honestly a good way to learn) or wrap a framework-agnostic gesture library in a Svelte action. No built-in cross-container shared-element animation equivalent to Motion's `layoutId`. *Benefit:* by a distance the gentlest learning curve for someone new to frontend, and the fewest dependencies to rot.

**Solid.** Technically the best-matched render model of the four: signals, no virtual DOM, no component re-execution — setting a signal updates exactly the one DOM attribute bound to it. For per-frame work it is the most naturally efficient. Its problem is entirely sociological: the smallest community, the thinnest library ecosystem, and the fewest answers when you're stuck at 11pm before poker night. For a solo beginner project this is a real cost that outweighs a performance edge you will never actually measure.

**Vue.** The comfortable middle. Excellent official documentation — genuinely the best-written of the four for a newcomer. Built-in `<Transition>` and `<TransitionGroup>`, and `<TransitionGroup>` does FLIP-based move animations out of the box. Motion ships a Vue package. Nothing about Vue is *wrong* for this; it just doesn't win on any axis for this project, and its gesture ecosystem is thinner than React's.

### 1.4 Verdict

| | drag ergonomics | interruptible spring | layout/FLIP | gesture libs | beginner help available |
|---|---|---|---|---|---|
| React | needs a rule learned | best (Motion, react-spring) | **best — `layout` + cross-tree `layoutId`** | best (`@use-gesture`) | best |
| Svelte 5 | easiest | good, built-in (`Spring` + `preserveMomentum`) | good in-list (`animate:flip`); cross-tree needs `crossfade` or GSAP Flip | thin (GSAP or hand-rolled) | good |
| Vue | easy | good (Motion Vue) | good in-list (`<TransitionGroup>`, CSS-based); cross-tree manual | thin | good |
| Solid | easiest | adequate | adequate | thinnest; **upstream archived** | weakest |

React wins on ecosystem for exactly the two hard parts — and specifically on cross-tree shared-element animation, which is the one capability with no easy equivalent elsewhere. Svelte wins on simplicity, learning curve, and dependency durability. See §9 for how to break the tie if you weight those differently.

---

## 2. The animation and gesture libraries

Sizes are minified+gzipped from bundlephobia, and maintenance figures are from the npm registry and GitHub API, as of July 2026. **For a LAN app served off a Pi to phones on the same wifi, bundle size is close to irrelevant** — there is no cold 4G download. Judge these on maturity and API quality, not kilobytes. This is a genuine departure from standard web advice, and it frees you to pick the better-documented library.

### 2.1 Summary table

| Library | Frameworks | Latest / last push | Stars | Size (gz) | Springs | Interruptible | Layout/FLIP |
|---|---|---|---|---|---|---|---|
| **Motion** (`motion`) | React, Vue, vanilla | 12.42.2, 2026-07-01 | 32.9k | ~45 kB headline; ~2–5 kB "mini", ~17–18 kB hybrid after tree-shaking | yes | yes (velocity carried) | **yes — `layout`/`layoutId`, React only** |
| **`@use-gesture`** | React, vanilla | 10.3.1 (2024-03), pushed 2024-07 | 9.6k | 8.9 kB | n/a (gesture only) | n/a | n/a |
| **react-spring** | React | 10.1.2, 2026-07-22 | 29.1k | 20.1 kB | yes | yes | no |
| **GSAP** | agnostic | 3.15.0, 2026-04-13 | 27.0k, **7 open issues** | 27.4 kB core + plugins | via InertiaPlugin | yes | **yes — Flip plugin** |
| **`svelte/motion` + `svelte/animate`** | Svelte | ships with Svelte 5.56.8 (2026-07-24) | — | **0** (built in) | yes (`Spring`) | yes (`preserveMomentum`) | yes (`animate:flip`, list-scope) |
| **`<TransitionGroup>`** | Vue | ships with Vue | — | **0** (built in) | no (CSS) | no | yes (`.list-move`, list-scope) |
| **anime.js v4** | agnostic | 4.5.0, 2026-06-22 | 71.5k | 40.3 kB | — | — | — |
| **Hammer.js** | agnostic | **abandoned** — last commit 2019, npm 2016 | — | — | — | — | — |

### 2.2 The React pairing (recommended)

**Motion** (`motion.dev`, formerly Framer Motion; `motion/react` for React, plus a vanilla build and a Vue package). The mature centre of gravity for web animation — 32.9k stars, pushed within the last month. What matters here:

- **Springs are interruptible by design.** Motion's docs: "Physics-based spring animations are set via `stiffness`, `damping` and `mass`, and these incorporate the velocity of any existing gestures or animations for natural feedback" ([motion.dev, transitions](https://motion.dev/docs/react-transitions)). That velocity carry-over is exactly the "grab a card mid-flight and redirect it" property. Values live in `MotionValue`s outside React's render cycle, so a drag never re-renders.
- **`layout` prop** — put `layout` on an element and Motion performs FLIP automatically whenever its position or size changes for *any* reason. This is the "cards move and settle" feature and it costs one word of code.
- **`layoutId`** — two elements anywhere in the tree sharing a `layoutId` animate into one another. This is the shared-element transition: a card leaving your hand and arriving on the board as the same physical object. **Nothing in Svelte, Vue or Solid has a first-party equivalent** — their built-ins do FLIP within a list, not across the tree (§2.5).
- **Hybrid engine** — a "mini" path (~2.3–4.6 kB) using the native Web Animations API, which runs off the main thread, and a "hybrid" engine (~17–18 kB) adding JS-driven springs, independent transforms and layout animation ([motion.dev, reduce bundle size](https://motion.dev/docs/react-reduce-bundle-size)).

**Important caveat:** `layout`/`layoutId` are documented only for the **React** package. Motion's Vue and vanilla docs show no equivalent. If Motion's layout animation is why you pick Motion, that argues for React specifically.

**`@use-gesture`** (`@use-gesture/react`, `@use-gesture/vanilla`). 8.9 kB, 9.6k stars. It "is not responsible for actually moving the component" — it hands you gesture data (position, movement, **velocity**, direction, `down`/`last`) and you feed it to a spring ([pmndrs/use-gesture README](https://github.com/pmndrs/use-gesture)). Built on Pointer Events. Its docs explicitly recommend `touch-action: none` on draggable elements and flag the tradeoff, offering `preventScroll`/`preventScrollAxis` as a hold-delay alternative when drag and scroll must coexist ([use-gesture options](https://use-gesture.netlify.app/docs/options/)) — which matches §3 exactly.

**Maintenance note, stated honestly:** `@use-gesture`'s last release was **10.3.1 in March 2024** and its last repo push July 2024 — over two years quiet as of July 2026. With 53 open issues and a stable, mature API this reads as "finished" rather than "abandoned," and Pointer Events aren't going to change under it. But it is the least actively developed dependency in the recommended stack, and you should know that going in. Mitigations: Motion has its own `drag` support that covers simpler cases without `@use-gesture` at all, and the gesture layer is the easiest piece to replace (§8.11).

**react-spring** (`@react-spring/web`, 20.1 kB, 29.1k stars, pushed 2026-07-22). Spring-physics-first, from the same pmndrs org as `@use-gesture`, and the pairing shown throughout `@use-gesture`'s own docs. Imperative `api.start()` drives animation without re-rendering. Springs are naturally interruptible because they carry initial velocity. Equally legitimate as a springs-only alternative to Motion — but it has **no `layout`-prop equivalent**, which is the main reason to prefer Motion here.

**dnd-kit** — exists, but it's for *drag-and-drop* (sortable lists, drop targets, keyboard fallbacks). Phase 2 is direct manipulation with physics, not drag-and-drop. Wrong tool.

### 2.3 Framework-agnostic

**GSAP** (`gsap.com`) — ~20 years old, framework-agnostic, exceptionally documented. 27k stars and **only 7 open issues**, which is a remarkable health signal. **The licensing question resolves cleanly:** gsap.com now states "GSAP is now 100% free for all users, thanks to Webflow's support," and every formerly paid Club plugin — including **Draggable, Flip, InertiaPlugin, MorphSVG, ScrollTrigger** — is now free ([gsap.com/pricing](https://gsap.com/pricing/)). `Draggable` with `inertia: true` gives momentum/flick deceleration ([GSAP Draggable docs](https://gsap.com/docs/v3/Plugins/Draggable/)); `Flip` gives arbitrary cross-tree layout diffing — i.e. GSAP is the one non-React path to `layoutId`-class behaviour.

GSAP is a JS tween/timeline engine, not WAAPI. Timeline-first rather than physics-first, which suits choreographed sequences (a deal animation) better than finger-tracking, but Draggable+Inertia is a serious drag option. **Because it is independent of any framework's release cadence, GSAP is arguably the single lowest-abandonment-risk choice in this document** — worth remembering if you pick Svelte, Vue or Solid.

**Web Animations API** — the no-library baseline. `Element.animate()` gives play/pause/seek/reverse over keyframes ([MDN, WAAPI](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)), and runs on the compositor for transform/opacity. Fine for deal/discard. No spring physics, no velocity-aware retargeting — which is why the libraries exist.

**anime.js v4** — 4.5.0 (2026-06-22), 71.5k stars, 40.3 kB. Very actively maintained and the most-starred thing here, but it is a general-purpose tween engine with no drag/gesture or layout-diff story. Not a fit for this specific problem.

**Motion One / Popmotion** — both superseded by Motion. `motiondivision/motionone` is **archived** on GitHub; Popmotion's last push was March 2024. Don't start on either.

**Hammer.js** — **confirmed abandoned.** Last real commit May 2019, last npm publish April 2016. Do not use.

### 2.4 The Svelte, Vue and Solid pairings

**Svelte.** Built-ins cover a surprising amount, at zero dependency cost: `Spring` and `Tween` classes from `svelte/motion` (Svelte 5.8+, superseding the deprecated `spring()`/`tweened()` stores), `animate:flip` from `svelte/animate`, the `transition:`/`in:`/`out:` directives, and `crossfade` for send/receive pairs. `Spring.set(v, { preserveMomentum })` is a documented fling primitive. There is **no official Motion Svelte package** — gesture handling is `@use-gesture/vanilla` in a Svelte action, GSAP Draggable, or ~80 hand-rolled lines.

**Vue.** `<TransitionGroup>` applies a `.list-move` class automatically to reordering elements, producing FLIP glide with no library ([vuejs.org, TransitionGroup](https://vuejs.org/guide/built-ins/transition-group.html)). It is CSS-transition-based, so it is not spring physics and not drag-interruptible; Vue's own docs show wiring GSAP into the `@enter`/`@leave` hooks when you need more. Motion ships an actively maintained Vue package sharing the same engine as React's — minus `layout`/`layoutId`.

**Solid — the weak spot.** The official `@motionone/solid` is **stale** (last publish Sept 2023) and its parent repo is **archived**. The living option is the community fork `solid-motionone` (1.0.4, April 2025, 215 stars). `solid-transition-group` is 0.3.0 (Jan 2025, 299 stars). Both are roughly a year quiet and an order of magnitude smaller than the other frameworks' options. If you chose Solid, the sane play would be to skip Solid-specific libraries entirely and drive GSAP by hand.

### 2.5 Where ecosystem depth genuinely differs

This is the crux, and it is narrower than "React has more libraries":

- **Within-list reordering** — cards in a hand shuffling to close a gap. **All four frameworks handle this well**, three of them with zero dependencies (Svelte `animate:flip`, Vue `.list-move`, React via Motion `layout`). Not a differentiator.
- **Cross-tree shared-element** — a card that leaves your hand and *becomes* a card on the board, a different DOM subtree entirely. **React + Motion does this near-free with `layoutId`.** Svelte's `crossfade` is a partial answer; Vue and Solid need manual `getBoundingClientRect()` bookkeeping or GSAP's Flip plugin. This is the one place the gap is real, and it happens to be a plausible Phase 2 requirement for a card game.
- **Drag with velocity into an interruptible spring** — React has the most direct path (`@use-gesture` + Motion/react-spring). Everyone else can get there via GSAP Draggable+Inertia or by hand.

### 2.6 On abandonment risk

For a hobby project picked up and put down over years, ranked on "will this still be maintained and documented in two years":

**the platform itself** (Pointer Events, WAAPI, CSS transforms — never breaks) > **framework built-ins** (Svelte's `svelte/motion`, Vue's `<TransitionGroup>` — they ship with the framework; Svelte published a release the day before this was written) ≈ **GSAP** (20 years, Webflow-funded, 7 open issues, framework-independent) > **Motion** (32.9k stars, monthly releases) ≈ **react-spring** > **`@use-gesture`** (mature but two years quiet) > **anything Solid-specific** (archived upstream, community forks a year stale).

Note the implication: **Svelte's built-ins and GSAP both score better on this axis than the recommended React stack does.** That is a real point against the recommendation, and it is why §9 gives the counter-argument properly.

---

## 3. How touch gestures actually behave in a phone browser

This section is the part where a backend engineer loses a weekend if nobody tells them. All of it is Phase-1-relevant because most of it is *global CSS and markup*, which is cheap now and annoying later.

### 3.1 Use Pointer Events. Not touch events.

Pointer Events unify mouse, pen, and touch into one model — "a single DOM event model to handle pointing input devices such as a mouse, pen/stylus, or touch" ([MDN, Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)). MDN marks the feature as well established, available across browsers since July 2020; WebKit shipped it in Safari 13 (iOS 13). For a project targeting current phones there is no remaining reason to write `touchstart`/`touchmove` handlers.

The events you need are `pointerdown`, `pointermove`, `pointerup`, `pointercancel`. Two APIs matter more than they look:

- **`pointerId`** — a unique id per pointer. With multiple fingers on the screen (very plausible: two hole cards, two thumbs) each is a separate id, and you must track them separately rather than assuming one active drag.
- **`element.setPointerCapture(pointerId)`** — "designate a specific element as the capture target of future pointer events. Subsequent events for the pointer will be targeted at the capture element until capture is released" ([MDN, setPointerCapture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture)). Call this on `pointerdown`. Without it, when the finger slides off the card's hit box mid-drag — which it will, constantly — you stop getting events and the card sticks. This is the single most common "my drag is broken" bug, and it's one line.

### 3.2 `pointercancel`: the browser can steal your gesture, and `preventDefault()` will not stop it

`pointercancel` fires when "the user agent detects that the web page is unlikely to continue to receive pointer events with a specific pointerId." The spec's list of triggers includes modal dialogs opening, the device disconnecting, screen orientation changes, palm rejection, too many simultaneous pointers, and — the important one — **"the pointer is subsequently used by the user agent to manipulate the page viewport (e.g. panning or zooming)"** ([W3C Pointer Events](https://w3c.github.io/pointerevents/)). MDN adds app-switching, the browser deciding the input was accidental, and `touch-action` preventing the input from continuing ([MDN, pointercancel](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event)).

Now the part that catches everyone. From the spec:

> Viewport manipulations (panning and zooming) … are intentionally **NOT** a default action of pointer events, meaning that these behaviors … cannot be suppressed by canceling a pointer event. Authors must instead use `touch-action` to explicitly declare the direct manipulation behavior for a region.
> — [W3C Pointer Events](https://w3c.github.io/pointerevents/)

**You cannot `preventDefault()` your way out of the page scrolling under your drag.** The only lever is the `touch-action` CSS property, and it is evaluated *before* the gesture starts: "after a gesture starts, changes to `touch-action` will not have any impact on the behavior of the current gesture" ([MDN, touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)). Setting it in a `pointerdown` handler is too late.

You must also handle `pointercancel` as a real code path — it is not an error case, it is Tuesday. A drag that only handles `pointerup` will leave cards stranded mid-screen the first time someone gets a notification.

### 3.3 `touch-action`

Values ([MDN, touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)):

- `auto` — default, browser handles all panning and zooming.
- `none` — the browser does no panning or zooming for this element. **This is what a draggable card wants.**
- `pan-x`, `pan-y`, and the directional `pan-left`/`pan-right`/`pan-up`/`pan-down` — allow only that axis/direction of browser panning, leaving the other for you. Useful for "this list scrolls vertically but cards drag horizontally."
- `pinch-zoom` — allow multi-finger zoom; combinable with the pan values.
- `manipulation` — "enable panning and pinch zoom gestures, but disable additional non-standard gestures such as double-tap to zoom," equivalent to `pan-x pan-y pinch-zoom`. Its documented benefit is removing "delay in click event generation."

`manipulation` on interactive elements is worth doing in Phase 1 for reasons in §3.5.

### 3.4 Passive listeners — a real cross-browser divergence

If you do end up touching raw touch events (you shouldn't, but libraries might): MDN on `addEventListener()` states that the `passive` option "defaults to `false` – except that in browsers **other than Safari**, it defaults to `true` for `wheel`, `mousewheel`, `touchstart` and `touchmove` events on the document-level nodes `Window`, `Document`, and `Document.body`," and "if a passive listener calls `preventDefault()`, nothing will happen and a console warning may be generated" ([MDN, addEventListener](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)).

So the same code silently does nothing in Chrome and works in Safari. If you need `preventDefault()` on a document-level touch listener you must pass `{ passive: false }` explicitly. Another reason to stay on Pointer Events + `touch-action`.

### 3.5 Stopping scroll and rubber-banding

Three layers, in order of reliability:

1. **`touch-action: none` on the drag surface.** The spec-sanctioned, universally supported mechanism. Non-negotiable.
2. **Don't have a scrolling page at all.** The most robust fix. If the phone screen is a fixed-size app shell that never scrolls, there is nothing to rubber-band. See §8.4 — this is a Phase 1 layout decision.
3. **`overscroll-behavior`** on any inner scroll container. `contain` keeps bounce local and, per MDN, "disables native browser navigation, including … vertical pull-to-refresh gesture [and] horizontal swipe navigation"; `none` additionally kills the bounce effect ([MDN, overscroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior)). **Caveat:** MDN flags this property as "Limited availability … not Baseline because it does not work in some of the most widely-used browsers." Compat data indicates iOS Safari 16+ for the base property with uneven support for the axis-specific variants. Verify the current compat table before relying on it; treat it as defence in depth, not as the mechanism.

### 3.6 iOS Safari quirks, with primary sources

**The tap delay.** WebKit's own explanation: "WebKit cannot tell if the user intends on tapping again to trigger a double tap gesture. Since double tapping is defined as two taps within a short time interval (350ms), WebKit must wait for this time interval to pass before we're sure that the user intended to tap only once." Applying `touch-action: manipulation` means "single taps are dispatched immediately," and the benefit propagates to descendants ([WebKit, More Responsive Tapping on iOS](https://webkit.org/blog/5610/more-responsive-tapping-on-ios/)). **This is a Phase 1 win, not a Phase 2 one** — your tap-a-button UI feels 350ms snappier with one CSS line.

**Long-press callout and text selection.** `-webkit-touch-callout: none` suppresses the long-press callout/share menu; MDN documents it as non-standard, values `default | none` ([MDN, -webkit-touch-callout](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-touch-callout)). Pair with `user-select: none` to stop text selection. A slow thumb press on a card that pops up a share sheet or a selection loupe destroys the illusion completely. (The selection-loupe-under-drag behaviour specifically I could not confirm from a primary WebKit source — the mitigation is the same two properties.)

**Screen-edge gestures.** iOS reserves the screen edges: Safari's own left/right edge swipe navigates back/forward, and the top/bottom edges belong to Control Centre and Notification Centre. Apple's HIG is explicit that apps should not fight this — "people generally expect standard gestures to work the same across the system and in every app," and overriding edge gestures should be "implemented sparingly" ([Apple HIG, Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)). There is no web API to suppress OS-level edge gestures. **Design implication for Phase 2: keep the active hit zone for any drag inset from the physical screen edges.** A "swipe the card off the left edge to fold" gesture that starts at x=0 will fight Safari's back-swipe and lose. This is worth knowing now because it affects where you put things in Phase 1's layout.

**Pinch-zoom cannot be disabled.** Apple's Safari 10.0 release notes, under Accessibility: "Pinch-to-zoom is always enabled for all users. The viewport setting for `user-scalable` is ignored." WebKit's blog confirms the scope: "Now, we ignore the `user-scalable`, `min-scale` and `max-scale` settings" ([WebKit, New Interaction Behaviors in iOS 10](https://webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/)). This is deliberate and permanent. Your design must survive a user accidentally zooming — which in practice means `touch-action` on the card surface (so a two-finger gesture there doesn't zoom) and a layout that isn't destroyed if they do.

**The URL bar and viewport height.** `100vh` on iOS is the *large* viewport — MDN: "currently, all default viewport units (`vh`, `vw`, etc.) are equivalent to their large viewport counterparts (`lvh`, `lvw`, etc.)" — i.e. the height with the browser chrome retracted, so content is cut off when the URL bar is showing. The alternatives: `svh` (small viewport — worst case, chrome fully expanded; safe, may leave a gap) and `dvh` (dynamic — tracks the chrome as it moves, but MDN warns it "can cause the content to resize while a user is scrolling a page … [which] can lead to degradation of the user interface and cause a performance hit") ([MDN, viewport-percentage lengths](https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage_lengths)).

For a card surface where a card is being flung and must not be clipped by the viewport resizing mid-gesture, **`svh` is the right default**, despite `dvh` looking more correct. `100vh` is wrong. This is a one-character Phase 1 decision with a Phase 2 consequence.

**Notch and safe areas.** `<meta name="viewport" content="viewport-fit=cover">` disables the automatic inset so the page goes edge to edge, and `env(safe-area-inset-top/right/bottom/left)` gives you the sizes to pad by; WebKit recommends wrapping in `max()` so padding never drops below a comfortable minimum ([WebKit, Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)).

---

## 4. What "peel back a card" actually requires

The gesture being modelled is the poker *squeeze*: two cards face down on the table, thumb bends the near corner up just far enough to read the rank and suit in the index corner. Note what that means — **the whole point is revealing the corner index, not the whole face.** That simplifies the problem considerably.

Three implementations, in increasing cost:

### 4.1 Slide-reveal under a clip (cheapest, and genuinely good)

Card face sits inside a container with `overflow: hidden`; the drag translates the face out from behind a cover. Per frame, only `transform` changes. Composited, effectively free, works everywhere, ~30 lines. Reads as sliding a card out of a shoe rather than peeling — but paired with a slight rotation and a shadow it is convincing at phone scale, and it is the safe floor if the fancier version misbehaves.

### 4.2 Rigid corner flap via a 3D rotation about a diagonal axis (the sweet spot)

The realistic-looking version that stays on the compositor. Structure:

- **Layer 1 (bottom):** the card face.
- **Layer 2 (middle):** the card back, with the corner triangle removed via a *static* `clip-path` polygon.
- **Layer 3 (the flap):** a copy of the card back clipped to that same corner triangle, with `transform-origin` on the fold line and `transform: rotate3d(1, 1, 0, θdeg)` under a `perspective` on the parent.

`rotate3d(x, y, z, a)` takes an arbitrary axis vector — "the axis of rotation is defined by an [x, y, z] vector and pass by the origin (as defined by the `transform-origin` property)" — so a diagonal fold line across the corner is directly expressible ([MDN, rotate3d()](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/rotate3d)). The finger's drag distance maps to θ.

Why this holds 60fps: the `clip-path` values are **static**, so they cost paint once, at setup. Per frame only `transform` on one layer changes. That is compositor work.

The failure mode to avoid: animating `clip-path` or `filter: drop-shadow` per frame. Chromium engineering is blunt about this — "properties like `filter: drop-shadow()`, `clip-path`, and `box-shadow` fall back to software rasterization, rather than GPU compositing," and where GPU-composited properties "cost fractions of a millisecond per frame," these "can consume an entire CPU core at 60fps" ([Chromium paint-dev, Moving clip-path to the compositor](https://groups.google.com/a/chromium.org/g/paint-dev/c/3bXUo0X3C5I)). Only rectangular `clip-path` animations are specially accelerated. **Bake the flap's shadow into an image or a static gradient element that you fade and move with `transform`/`opacity`; never recompute a live drop-shadow per frame.** Same warning applies to `mask-image` — treat it as paint-cost-bearing.

One WebKit-specific hazard: `transform-style: preserve-3d` has a documented history of rendering defects in Safari, including nested-element display errors ([WebKit bug 71624](https://bugs.webkit.org/show_bug.cgi?id=71624), [bug 182520](https://bugs.webkit.org/show_bug.cgi?id=182520)) and a regression where a working `preserve-3d` + pseudo-element pattern broke in a Safari update ([mdn/browser-compat-data #19472](https://github.com/mdn/browser-compat-data/issues/19472)). Keep the 3D nesting shallow — one flap element in one perspective container — and test on a real iPhone rather than assuming Chrome parity.

### 4.3 True cylindrical curl (don't)

An actual paper-curl needs a deformed mesh: WebGL, or canvas redrawing slices every frame, or an SVG displacement filter. All repaint every frame. On a mid-range Android this is the one that drops frames. It is also invisible at 4cm across. Skip it.

### 4.4 Will it hold 60fps on a mid-range phone?

**Yes, for 4.1 and 4.2**, provided the per-frame work is `transform` and `opacity` only. Chrome's guidance is to "restrict animations to `opacity` and `transform` to keep animations on the compositing stage" ([web.dev, animations guide](https://web.dev/articles/animations-guide)).

The realistic threats to your frame rate are not the peel itself. They are:

- **A framework re-render during the drag** — see §1.1 and §8.6.
- **A WebSocket message arriving mid-drag** causing a whole-screen re-render.
- **Live `filter: drop-shadow` / `backdrop-filter` / large blurred `box-shadow`** on the table felt or the cards.
- **Card images not decoded before first use** — a stutter on the first drag. Preload and decode card art at load time.
- **Overuse of `will-change`.** MDN is direct: "use the `will-change` property as a last resort … don't use it to anticipate performance problems," because "excessive use … will result in excessive memory use and will cause more complex rendering" ([MDN, will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)). Apply it on `pointerdown`, remove it on settle.

Useful tool: `contain: layout paint` (or `contain: content`) on each card and on the table region restricts layout and paint recalculation to that subtree, so a change inside one card can't force layout of the whole screen ([MDN, Using CSS containment](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Using_CSS_containment)).

Use `requestAnimationFrame` for any hand-rolled animation loop — it "requests the browser to call a user-supplied callback function before the next repaint," matches the display refresh rate, and is paused in background tabs; use the timestamp it hands you rather than `performance.now()` so speed doesn't vary with refresh rate ([MDN, requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)). Note phones at 120Hz exist — don't hard-code 16ms.

### 4.5 A note on View Transitions

The View Transitions API (`document.startViewTransition()`, `view-transition-name`) is the platform's own answer to shared-element animation — you mutate the DOM inside a callback and the browser animates the before/after states ([MDN, View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)). Safari shipped same-document view transitions in **Safari 18.0** and cross-document in **18.2** ([WebKit Features in Safari 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/), [18.2](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/)).

It is attractive for the *dealing* animation and for board state changes. It is **not** the tool for a finger-driven peel: it is a fire-and-forget transition with programmatic skip, not a gesture-scrubbable one. Use it, if at all, for discrete state changes; use springs for anything a thumb is touching.

---

## 5. React/Vue/Svelte/Solid: does the choice constrain the peel?

No. §4 is pure CSS and pointer events. Any of the four can host it. Confirming the §1.1 point: **the framework choice is about the settle and the ecosystem, not about whether the effect is possible.**

---

## 6. Rendering technology: DOM, canvas, or WebGL?

**DOM.** Firmly. A poker table has fewer than 15 moving elements. DOM + CSS transforms gives you GPU compositing for free, accessibility for free, text rendering for free, devtools inspection for free, and access to every library in §2. Canvas or WebGL would mean writing your own hit testing, your own layout, your own text, and your own accessibility, and would rule out every animation library named above.

This is worth stating explicitly because it's a §8 item: **choosing canvas in Phase 1 would be the single most expensive decision to reverse.**

---

## 7. Is a PWA or full-screen web app needed?

**Not needed. Meaningfully better. And it collides with the Pi hosting decision.**

### 7.1 What standalone mode buys you

Adding to the Home Screen with `display: standalone` (or Apple's legacy `<meta name="apple-mobile-web-app-capable" content="yes">`) launches without browser chrome. Apple's own reference: with `content="yes"` the web app "runs in full-screen mode," without "the address bar at the top and the navigation bar at the bottom," and `window.navigator.standalone` reports the state; `apple-mobile-web-app-status-bar-style` controls the status bar and "has no effect unless you first specify full-screen mode" ([Apple, Supported Meta Tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html)). WWDC23's "What's new in web apps" describes home-screen web apps as getting "a standalone, app-like experience on iOS, with separate cookies and storage from the browser."

For a gesture UI the concrete wins are: no URL bar eating vertical space and no URL-bar show/hide viewport resizing (which neutralises most of the `vh`/`dvh` problem in §3.6), no pull-to-refresh, and no Safari edge swipe-to-navigate competing with a horizontal card swipe. That last one is the biggest — it removes a genuine gesture conflict rather than working around it.

### 7.2 What it costs

Almost nothing: a `manifest.json` and a couple of meta tags. You do **not** need a service worker, offline support, or any of the rest of the PWA checklist to get standalone mode. Skip all of it.

Caveats: on iOS 16.3 and earlier PWAs can only be installed via Safari; from 16.4 the Share-menu install works from other browsers too; and `beforeinstallprompt` (the custom "install this app" banner) "is not supported on iOS" — installation is always a manual Share → Add to Home Screen ([MDN, Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)). Ship both the manifest and the legacy Apple meta tags; Apple still documents the latter.

The Fullscreen API is not an alternative on iPhone: `requestFullscreen()` on arbitrary elements is not supported in Safari on iPhone (it works on iPad, prefixed). Don't plan around it.

### 7.3 The collision with #7 (hosting on a Pi) — flag this

**A LAN origin like `http://192.168.1.50` is not a secure context.** MDN's list of "potentially trustworthy origins" covers `http://localhost`, `http://127.0.0.1`, `http://*.localhost`, `file://` and `wss://` — a private LAN IP over plain HTTP is not among them ([MDN, Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)). Service workers require a secure context, and manifest-driven installation is gated behind the same requirement on most platforms.

So: **if Phase 2 wants the standalone-mode feel, the Pi must serve a trusted HTTPS origin with a real hostname**, not a bare `http://` IP. That is a hosting decision made in [#7](https://github.com/ewanhardingham/table-top-poker/issues/7), in Phase 1, and it is not trivial on a LAN (self-signed certificates are not trusted; the usual answers are a real domain with DNS-01 ACME pointing at a private IP, or `.local` mDNS plus a locally-installed CA, both of which have consequences for how guests join). Also note `getCoalescedEvents()` — the API for smoothing fast drags — requires a secure context.

**Recommendation: Phase 1 should treat "the app is served over HTTPS from a stable hostname" as a requirement, not a nice-to-have.** Retrofitting it means changing the join URL that everyone has bookmarked, re-adding home-screen icons, and possibly re-provisioning trust on every guest's phone.

---

## 8. The Phase 1 decisions that would be expensive to reverse

This is the operative section. Each item is graded by how painful reversal would be.

### 8.1 Rendering the table in canvas or WebGL — **catastrophic**

Reversing means rewriting the entire client. Every library in §2 is DOM-based. **Phase 1 must render cards as DOM elements.** (See §6.)

### 8.2 The framework itself — **very expensive**

Every component is written twice. Pick now, informed by this document, in [#14](https://github.com/ewanhardingham/table-top-poker/issues/14). There is no cheap migration path between React, Svelte, Solid and Vue.

Sub-decision with the same weight: **don't adopt a heavy opinionated component library** (MUI, Vuetify, Ionic, Quasar) for the card surface. Those libraries own their own DOM, their own event handling, their own animations, and their own stacking and overflow contexts — all four of which a custom gesture layer has to fight. A poker table has maybe ten distinct UI elements. Write them. If you want help, prefer copy-into-your-repo approaches (shadcn-style) or a headless/unstyled library over one that renders DOM you don't control. Reversing a component-library commitment is a re-skin of the whole app.

### 8.3 Card identity: stable keys, from the wire contract outward — **expensive, and it reaches into #9/#11**

Every FLIP-based layout animation works by matching an element before the change to the same element after it. Svelte's `animate:flip` is documented as requiring a **keyed** `{#each}` block; Motion's `layout`/`layoutId` and Vue's `<TransitionGroup>` have the same requirement in different clothes; View Transitions need a unique `view-transition-name`.

If Phase 1 renders cards keyed by array index, then a fold that removes one card renumbers all the others, and every animation library concludes that every card was destroyed and a different set created. You get a flicker instead of a settle.

The fix is cheap now and invasive later, because it isn't only a client concern — **the server's messages must carry stable identities**:

- Each **card** needs a stable id (`"Ah"` is fine — rank+suit is unique within a hand).
- Each **seat** and each **hole-card slot** needs a stable id independent of array position.
- Board cards need stable identity across the flop/turn/river as the array grows.

That is a wire-contract requirement, so it belongs in [#9](https://github.com/ewanhardingham/table-top-poker/issues/9)/[#11](https://github.com/ewanhardingham/table-top-poker/issues/11) now, not later. **Concretely: never render a list of cards keyed by index.**

### 8.4 Making the phone screen a scrolling page — **expensive**

If the player screen is a normal document that scrolls, then in Phase 2 a vertical drag on a card competes with page scroll, and the fix is a layout rewrite plus a war with `touch-action` and rubber-banding (§3.5).

**Phase 1 should build the phone client as a fixed app shell that does not scroll**: a root element sized with `100svh` (not `100vh` — §3.6), `overflow: hidden`, with only explicitly designated inner regions scrolling if any need to. Combined with `viewport-fit=cover` plus `env(safe-area-inset-*)` padding. Getting this right on day one costs an hour; retrofitting it means re-doing every screen's layout.

Related and cheap, but do it now so it's never a question: a base stylesheet on the app shell with `touch-action: manipulation` (kills the 350ms tap delay — §3.6, a Phase 1 benefit in its own right), `user-select: none`, `-webkit-touch-callout: none`, and `overscroll-behavior: none`. Then `touch-action: none` specifically on card elements in Phase 2.

### 8.5 Actions dispatched inline from buttons — **moderate, but it touches every file**

Phase 1's UI is tap-a-button: Fold, Check, Call, Raise. The temptation is `<button onClick={() => socket.send({type:'fold'})}>`.

In Phase 2, "swipe the card away" must do *exactly what the fold button does* — including validation, optimistic state, error handling, and disabled/not-your-turn logic. If that logic is inlined in button handlers scattered across components, Phase 2 either duplicates it or refactors every screen.

**Phase 1 rule: every player action goes through one intent layer** — a single module exposing `fold()`, `check()`, `call()`, `raise()` plus a derived `legalActions` for the current state. Buttons call it. In Phase 2, gestures call the same functions. This costs nothing now.

Corollary worth stating: **Phase 1's buttons are not scaffolding to delete.** Gestures must never be the only way to act — they fail, they're inaccessible, and a player with one hand holding a beer needs a tap. The button UI is the permanent base layer that the gesture layer sits on top of. Building it as if it's throwaway is the mistake.

### 8.6 A single monolithic client state object re-rendered wholesale — **moderate to expensive**

Phase 1's natural shape is "server pushes a `GameState`, client re-renders." That's fine at tap-a-button speed. In Phase 2, a state push arriving mid-drag would re-render the whole screen and stutter the gesture — cards move at 60fps while server events arrive at unpredictable times.

**Phase 1 should structure client state so that an update to one part doesn't re-render everything.** In Svelte 5 and Solid this is largely automatic (fine-grained signals). In React it means a store with selectable slices (Zustand, Jotai, or `useSyncExternalStore`) rather than one `useState` at the root threaded down through props. Reversing this in React is a refactor of the whole component tree's data flow.

### 8.7 Reveal modelled as a server round trip — **expensive, and it's a protocol decision**

The peel is a *client-side* reveal of information the client already holds. If Phase 1 designs the protocol as "player taps to look at their card → client asks server → server returns the card," then Phase 2's smooth thumb-tracked peel needs the card value already present in the DOM before the gesture begins, and the round trip is in the wrong place.

**Phase 1's contract must deliver a player their own hole cards as soon as they're dealt**, in the same push as everything else. Concealment from *that player* is a rendering concern, not a transport concern. (Concealment from *other* players remains the engine's `view(state, seatId)` projection — that's a map constraint and it's unaffected. This is only about the owning player's own cards.)

This belongs in [#9](https://github.com/ewanhardingham/table-top-poker/issues/9)/[#11](https://github.com/ewanhardingham/table-top-poker/issues/11) now. It also means the card component must be able to render its face and its back simultaneously (stacked layers, §4.2), rather than rendering nothing when face-down — so define `<Card>` from the start as taking rank, suit and a face-down flag, never as an `<img>` swapped between two sources.

### 8.8 No optimistic / pending local state — **moderate**

Phase 2's swipe-to-fold must animate the moment your thumb releases, not when the server acknowledges. If Phase 1's model is strictly "disable buttons, wait for the server event, then update," Phase 2 needs a "locally pending intent" concept added to client state, and every screen has to learn about it.

Cheap version to do now: represent an action as `pending` locally between send and acknowledgement, and render the button state from that. Phase 2's animation then hangs off a concept that already exists. This overlaps with [#14](https://github.com/ewanhardingham/table-top-poker/issues/14)'s "how client state relates to server state" question.

### 8.9 SSR / a full-stack meta-framework — **moderate**

Next.js, Nuxt and SvelteKit-with-SSR add server rendering and hydration. A gesture layer is client-only by nature, and this app is a LAN SPA served off a Pi to a handful of phones — there is no SEO, no cold-start latency problem, and no first-paint budget worth optimising. SSR adds hydration complexity that fights client-only interactive code for zero benefit here.

**Recommend: a plain Vite SPA**, static files served by whatever serves the API. This is a [#3](https://github.com/ewanhardingham/table-top-poker/issues/3) decision. Unwinding SSR later is a build and routing rewrite.

### 8.10 HTTPS and the join URL — **expensive, and it's really a #7 item**

Per §7.3: a plain-HTTP LAN IP origin is not a secure context, blocking service workers, gating PWA install, and blocking `getCoalescedEvents()`. If Phase 2 wants standalone mode, Phase 1's hosting must produce a trusted HTTPS origin at a stable hostname. Changing the origin later invalidates bookmarks, home-screen icons and any stored client state. **Flag this on [#7](https://github.com/ewanhardingham/table-top-poker/issues/7).**

### 8.11 Cheap to reverse — explicitly do not agonise over these

For balance, these are *not* worth constraining Phase 1 over:

- Which animation library. Swapping Motion for react-spring is localised.
- Card art and asset format. Swap freely — as long as `<Card>` has a props API (§8.7) rather than being a raw `<img>`.
- Styling approach (CSS modules, Tailwind, plain CSS). Mechanical to change.
- The specific spring constants, thresholds and easings. These are tuned by feel in Phase 2 and cannot be decided now.
- Bundle size. LAN-served; irrelevant (§2).

---

## 9. Recommendation, and the honest case against it

### Recommended stack

| Layer | Choice |
|---|---|
| Framework | **React** (TypeScript, per the map's standing constraint) |
| Build | **Vite**, SPA, no SSR |
| Animation | **Motion** (`motion/react`) — springs, `layout`, `layoutId` |
| Gestures | **`@use-gesture/react`** — Pointer Events, velocity, drag (or Motion's own `drag` for simple cases) |
| Rendering | **DOM + CSS transforms.** No canvas, no WebGL |
| Component kit | **None** for the table. Headless or hand-rolled only |
| Delivery | Manifest + Apple meta tags for standalone mode; **no service worker** |

The reasoning is not "React is popular." It's that Phase 2 has exactly two hard requirements — interruptible spring drag, and layout animation when cards move — and one of them, **cross-tree shared-element animation** (a card leaving your hand and becoming a card on the board), has a one-line first-party answer in React and nowhere else: Motion's `layoutId`, which is documented for the React package only (§2.5).

### The case against, which is real

**Svelte 5 is the better choice if you weight learning curve and dependency durability above ecosystem depth.** Its `Spring` class with `preserveMomentum` and its `animate:flip` directive ship *inside the framework* — per §2.6 that is the most durable place a dependency can live, and Svelte published a release the day before this was written. Its reactivity model makes the §1.1 performance trap nearly impossible to fall into. And it is materially more pleasant to learn if this is your first frontend project.

Two things sharpen the case against the recommendation:

1. **The weakest link in the recommended stack is `@use-gesture`** — mature and stable, but two years without a release (§2.2). It is not abandoned and it is easy to replace, but it is fair to note that the Svelte path's equivalent (framework built-ins, or GSAP) has *better* maintenance signals than the React path's.
2. **GSAP closes most of the gap for non-React frameworks, and it is now free.** GSAP's `Draggable` (with `InertiaPlugin` for flick momentum) and `Flip` (cross-tree layout diffing) together approximate `@use-gesture` + Motion `layoutId`, are framework-independent, and sit on a 20-year-old, Webflow-funded codebase with 7 open issues (§2.3). **Svelte 5 + built-in `Spring`/`animate:flip` + GSAP Draggable/Flip is a genuinely strong stack** and beats the recommendation on abandonment risk.

What you'd still give up with Svelte: fewer worked examples of card/swipe UIs to copy, and fewer people to ask when stuck.

**How to break the tie honestly:** if you expect to lean on AI assistance and on copying patterns from existing card-UI implementations, take React — that corpus is overwhelmingly React, and for a frontend beginner "someone has already written this and documented it" outweighs architectural elegance. If you'd rather install fewer things, write less code, and understand all of it, take Svelte 5 + GSAP. Both are defensible; neither is a mistake. Vue is a fine third choice that wins nothing specific here. **Solid is the one to avoid** — not on merit, but because its animation ecosystem is archived upstream and its community forks are a year stale (§2.4).

**Critically, §8 is identical either way.** Every expensive-to-reverse decision listed there is framework-independent. That is the real output of this research: you can defer §9 and still start Phase 1 safely, as long as you honour §8.

---

## 10. Sources

**Specs and platform**
- [W3C Pointer Events](https://w3c.github.io/pointerevents/)
- [MDN, Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [MDN, Element.setPointerCapture()](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture)
- [MDN, pointercancel event](https://developer.mozilla.org/en-US/docs/Web/API/Element/pointercancel_event)
- [MDN, PointerEvent.getCoalescedEvents()](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents)
- [MDN, touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
- [MDN, overscroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/overscroll-behavior)
- [MDN, EventTarget.addEventListener()](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget/addEventListener)
- [MDN, -webkit-touch-callout](https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-touch-callout)
- [MDN, CSS length — viewport-percentage lengths](https://developer.mozilla.org/en-US/docs/Web/CSS/length#viewport-percentage_lengths)
- [MDN, Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts)
- [MDN, will-change](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change)
- [MDN, requestAnimationFrame()](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [MDN, Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)
- [MDN, View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API)
- [MDN, rotate3d()](https://developer.mozilla.org/en-US/docs/Web/CSS/transform-function/rotate3d)
- [MDN, mask-image](https://developer.mozilla.org/en-US/docs/Web/CSS/mask-image)
- [MDN, Using CSS containment](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Using_CSS_containment)
- [MDN, Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

**WebKit / Apple**
- [WebKit, More Responsive Tapping on iOS](https://webkit.org/blog/5610/more-responsive-tapping-on-ios/)
- [WebKit, New Interaction Behaviors in iOS 10](https://webkit.org/blog/7367/new-interaction-behaviors-in-ios-10/)
- [WebKit, Designing Websites for iPhone X](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)
- [WebKit Features in Safari 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)
- [WebKit Features in Safari 18.2](https://webkit.org/blog/16301/webkit-features-in-safari-18-2/)
- [WebKit bug 71624 — nested preserve-3d display errors](https://bugs.webkit.org/show_bug.cgi?id=71624)
- [WebKit bug 182520 — transform-style: preserve-3d](https://bugs.webkit.org/show_bug.cgi?id=182520)
- [Apple, Safari HTML Reference — Supported Meta Tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariHTMLRef/Articles/MetaTags.html)
- [Apple, Safari 10.0 release notes](https://developer.apple.com/library/archive/releasenotes/General/WhatsNewInSafari/Articles/Safari_10_0.html)
- [Apple HIG, Gestures](https://developer.apple.com/design/human-interface-guidelines/gestures)
- [Apple, WWDC23 — What's new in web apps](https://developer.apple.com/videos/play/wwdc2023/10120/)

**Chrome / Chromium**
- [web.dev, Animations guide](https://web.dev/articles/animations-guide)
- [web.dev, CSS masking](https://web.dev/articles/css-masking)
- [Chromium paint-dev, Moving clip-path to the compositor](https://groups.google.com/a/chromium.org/g/paint-dev/c/3bXUo0X3C5I)

**Frameworks and libraries**
- [React, Manipulating the DOM with refs](https://react.dev/learn/manipulating-the-dom-with-refs)
- [Svelte, svelte/motion](https://svelte.dev/docs/svelte/svelte-motion)
- [Svelte, svelte/animate](https://svelte.dev/docs/svelte/svelte-animate)
- [Motion — docs](https://motion.dev/docs), [transitions](https://motion.dev/docs/react-transitions), [motion component (`layout`/`layoutId`)](https://motion.dev/docs/react-motion-component), [reducing bundle size](https://motion.dev/docs/react-reduce-bundle-size)
- [@use-gesture — docs](https://use-gesture.netlify.app/docs/), [options (`touch-action`, `preventScroll`)](https://use-gesture.netlify.app/docs/options/), [pmndrs/use-gesture](https://github.com/pmndrs/use-gesture)
- [react-spring](https://www.react-spring.dev/)
- [GSAP — pricing/licensing (now free)](https://gsap.com/pricing/), [Draggable](https://gsap.com/docs/v3/Plugins/Draggable/)
- [Vue, Transition](https://vuejs.org/guide/built-ins/transition.html), [TransitionGroup](https://vuejs.org/guide/built-ins/transition-group.html)
- [solid-transition-group](https://github.com/solidjs-community/solid-transition-group), [solid-motionone](https://github.com/solidjs-community/solid-motionone)

Package sizes from [bundlephobia](https://bundlephobia.com/); version, release-date, star and open-issue figures from the npm registry and the GitHub API, July 2026.

---

## 11. Caveats and unverified claims

Stated plainly so they aren't mistaken for settled facts:

- **react-spring's interruptibility** — sourced from cached react-spring.dev text rather than a live fetch (the site returned 403 to the research tooling). The claim is standard and uncontroversial for a spring solver, but it is not a directly-quoted primary source.
- **`overscroll-behavior` on iOS Safari** — MDN flags the property as "Limited availability." iOS 16+ for the base property with uneven axis-variant support comes from compat-data aggregation, not a directly-quoted MDN table. Verify before depending on it. `touch-action: none` and a non-scrolling app shell are the reliable mechanisms.
- **The iOS selection loupe/magnifier under a slow drag** — widely reported, but not confirmed against a primary WebKit source here. Mitigation (`user-select: none`, `-webkit-touch-callout: none`) is sound regardless.
- **Whether Web Animations API animations run on the compositor** identically to CSS transitions — not confirmed from MDN in this pass.
- **How completely current iOS implements the Web App Manifest spec** vs. still relying on the legacy Apple meta tags — not confirmed. Recommendation is to ship both, which is safe either way.
- **`getPredictedEvents()`** — exists in the same interface family as `getCoalescedEvents()`, but its prediction-window guarantees were not verified.
- **GSAP licensing** — verified directly from [gsap.com/pricing](https://gsap.com/pricing/): "GSAP is now 100% free for all users, thanks to Webflow's support," including formerly-paid Club plugins (Draggable, Flip, InertiaPlugin). The page did not state the transition date. Re-check before adopting, since this is the one dependency here with a licence history.
- **Whether Motion's Vue or vanilla packages have any `layout`/`layoutId` equivalent** — the docs fetched show none, but absence in docs is weaker evidence than an explicit statement. If you pick Vue and want layout animation, check this yourself before assuming you must hand-roll it.
- **Library figures in §2** are point-in-time (July 2026). Star counts and last-release dates move; re-check `@use-gesture` in particular, since its staleness is the one maintenance concern in the recommended stack.
