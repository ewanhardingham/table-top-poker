# Hole-card gesture surface

The player's own hole cards, modelled as **an object they handle, not a picture
they read** (spec #138). Cards arrive face-down and stay that way until the
player asks for them; nothing in this module touches the server, changes poker
visibility, or affects showdown. Section references (`§4`, `§11`, `story 27`)
point into spec #138.

Directory: `packages/player-client/src/holecards/`.

## Module seam

The module (`index.ts`) exports exactly **two** names: `HoleCardPair` (the
component) and `CardActions` (the Action port it defines for itself). Everything
else — the reducer, the hook, the view adapter, the bendable card, the
constants, the coaching selector — is module-internal and imported by nothing
outside this directory.

That narrow seam is load-bearing. It keeps pointers, bends, and recognizer
states out of `Hand`, and it is what lets each later gesture be an *addition
inside* `holecards/` rather than surgery on the component tree. Two specific
things must never cross the seam: the coaching **selector** (every in-gesture
hint depends on recognizer state nothing outside may see, #135) and any
lifecycle state. Only the persisted discovery set crosses.

## Split by cardinality of change (§13)

The organizing principle. State that changes a handful of times per hand is
**discrete** and goes through `useReducer`; state that changes continuously
under a moving finger is a Motion `MotionValue` written straight from the
pointer handlers.

Consequence: between threshold crossings a drag dispatches nothing, so it
re-renders nothing — not `HoleCardPair`, not `Hand`, not `ActionBar`, not the
turn banner. Peel progress, bend axis, fold offset, and fold fade are all
`MotionValue`s for this reason. Rendering a continuous value through React
(e.g. choosing a hint variant by axis) would re-render the pair every time a
bend wandered across the diagonal — so both variants are rendered and a
`MotionValue` toggles their opacity instead.

## The pure lifecycle (`cardState.ts`)

Presentation and Recognizer are modelled as two orthogonal machines but reduced
by **one** pure `reduce` function, so a coupled event applies atomically and
cannot half-land. Nothing here touches React or the DOM, which is why the whole
behaviour contract is verifiable as plain function calls — no store, no socket,
no simulated pointer.

- `Presentation`: `Absent | FaceDown | Peeking | Turning | Revealed | Leaving`.
  Pair-scoped — both cards always share one presentation.
- `Recognizer`: `Idle | Pressing | Bending | FoldDragging | Ignored | Committed`.
- `armed`: whether releasing now commits the Fold. Only ever true while
  `FoldDragging`.
- `locked`: the pair is inert. Set two ways, and its own field rather than a
  recognizer state or presentation, because the lock is not a gesture outcome
  and `Revealed` is reachable two ways where only one is final.
  - `SHOWDOWN_REVEAL` — showdown reached with this seat still live (story 48):
    inert and face-**up**.
  - `SEALED` — the seat declared all in (issue #253): inert and face-**down**,
    because an all-in Hand is still private until the showing window opens. It
    clears the fold gesture with it, which is the point: an all-in Seat cannot
    fold.

`revealPublishes(from, to, showLegal)` is the other predicate the hook reads off
the lifecycle, alongside `releaseCommitsFold`. Inside the Showdown showing
window a committed flip face-up **is** the `show` (ADR-0008's #253 amendment):
entering `Turning` publishes the Hand, and only on this Seat's turn at the head
of the queue (ADR-0009). A peek does not — it never reaches `Turning` — and
neither does a pair already face-up when the window opened, because
`showdownOpen` rising emits `RESET` for every contestant and puts it face-down
first. That reset is the whole safeguard against publishing by accident, so it
is load-bearing, not tidiness.

`muckLegal` arms the same upward drag that folds during betting, and
`planFinish` sends `muck` in place of `fold` when only it is legal. The two are
never both legal — betting and Showdown do not overlap — so a single armed drag
has exactly one meaning at any moment.

`CardState`/`CardEvent` are intentionally **complete**: every event name the
phase needs is declared even where an arm does not yet answer it, so later
slices add arms against this shape rather than reshaping it.

### Key reducer rules

- **Lock allow-list.** A locked pair hears only `DEALT`, `CARDS_GONE`,
  `SEALED`, `SHOWDOWN_REVEAL`, `TURN_FINISHED` (`survivesLock`). `SHOWDOWN_REVEAL`
  surviving the lock is what turns a sealed all-in pair face-up at the Reveal. Enforced once at the top
  of `reduce`, so tap/gesture events added later are inert against a decided
  hand *by default* and cannot reach one by being forgotten. `RESET` is
  deliberately **not** on the list: backgrounding must not conceal a showdown
  reveal (public table truth), and a reload remounts straight to `Revealed` off
  the `locked` prop — honouring `RESET` here would make the two paths §9 names
  in one breath disagree.
- **Deal detection.** `DEALT` is unconditional from every presentation: it is
  what makes every hand start face-down, so no face-up frame of the previous
  hand survives into the next. It also ends a showdown lock.
- **First pointer wins (§4).** While a gesture is live, a second finger landing
  (`PRESSED`) is ignored until the first releases/cancels. Latest-pointer-wins
  would let a stray thumb silently retarget a fold drag.
- **Classification stickiness.** `CLASSIFIED` is accepted only from `Pressing`,
  so `classify` runs once and a second classification is a no-op; `Ignored`
  stays terminal until release.
- **Bend is atomic.** Classifying as `Bending` moves the recognizer *and* opens
  the peel (`Peeking`) in one reduce — no frame where the pair is bending but
  still face-down.
- **Reveal via bend has no separate flip.** `BEND_CROSSED` (peel past the
  reveal threshold) *is* the commit: the same sheet carries past the opposite
  corner and lands face-up (`Turning` → `Committed`). A keyboard reveal
  (`ACTIVATED` from `FaceDown`) starts at 0 and gets the identical `Turning`
  motion, which is what makes Enter and a bend produce the same object behaving.
- **Peeking is not self-stable.** A peek is held open by the finger; letting go
  for any reason closes it to `FaceDown` (`settled`). A glance costs nothing and
  leaves nothing exposed.
- **`RELEASED` is the one commitment.** Crossing the fold threshold only *arms*;
  the completing release commits (`Leaving`). So an accidental crossing during a
  scroll-like motion cannot fold, and putting the cards back down is always a
  way out (§10). The pair leaves with **whatever face it had** — presentation is
  not consulted, so a revealed pair flies away face-up rather than flipping over
  inside a 280ms departure (§7). Every non-committing release falls through to
  the same settle as `CANCELLED`; the only thing the two don't share is that
  cancellation is never a commitment, which is the sole reason `RELEASED` has
  its own arm.
- **`Turning`/`Leaving` are points of no return** for both lift and
  cancellation: the flip completes (mid-turn is not a *stable* presentation),
  and a committed Fold can only be answered by the server.
- **Conceal is instant, reveal is a flip.** `ACTIVATED`/`TAPPED` on `Revealed`
  go straight to `FaceDown`; a tap on an already-face-down pair does nothing —
  which is what makes the first tap of a double-tap Check free (§5). A revealing
  tap would put a face-up frame between the two taps and charge the commonest
  free Action a reveal.
- **`DOUBLE_TAPPED` changes no presentation.** The first tap already concealed;
  the second buys a Check, which is an *effect* the reducer cannot have. The
  hook sends it through `actions.check`, so gesture and button reach
  `intent.check` by the identical route and `canAct` stays the single legality
  gate (§2). Reducing it here anyway is what makes it inert against a decided
  hand for free via `survivesLock`.
- **Arm/disarm are the same shape.** `FOLD_ARMED`/`FOLD_DISARMED` just move the
  flag; the drag keeps tracking the finger either way, so the surface never
  freezes under the player's hand. A drag pulled back below threshold and one
  whose legality vanished mid-motion (#146) both disarm through here — the
  recognizer can't tell them apart and doesn't need to.
- **`PENDING_RESOLVED` is scoped to `Leaving`.** Every Action resolves through
  it but only a Fold left the pair waiting; Call/Raise/Check must leave the
  cards untouched (§9). Acknowledged → `Absent`; rejected → **`FaceDown`, never
  `Revealed`** (a rejection leaves the player holding a live hand, not one they
  have shown themselves).
- **`SHOWDOWN_REVEAL`** turns face-up and locks, using the *same* animated flip
  a bend commits to (story 47) — except when the player already turned the cards
  over, where re-flipping would be motion with nothing to say. Withheld by the
  adapter for a folded-out seat, but the reducer also guards `Absent`/`Leaving`
  so folding stays final (story 49) without resting on being called correctly.

`releaseCommitsFold(state)` is exported so the release rule is a tested function
rather than a buried condition; its counterpart is `endGesture`'s `commitsFold`
(below), and the two agree because both are driven by the same
`FOLD_ARMED`/`FOLD_DISARMED` events.

## The pointer recognizer (`gesture.ts`, `classify.ts`, `geometry.ts`)

A live gesture is a **value** (`GestureSession`) the hook holds in a ref, never
in React state. Discrete facts on it (`classification`, `crossed`) become
reducer events; continuous ones (peel, offset) become `MotionValue`s.

- `crossed` is **one-way**: the reveal commit happens on crossing, so dragging
  back cannot un-commit and must not re-announce it.
- `armed` is deliberately **not** one-way (unlike `crossed`): crossing the fold
  line only arms; the commitment is the release, so pulling the cards back down
  disarms and the player can always change their mind.

`classify` is the whole of the §4 table as a pure function (no "undecided"
member — classification happens once, past the slop):

- **Bend zone wins outright while face-down**, so a press on the corner locks
  into `Bending` and a later upward swipe keeps bending. Fold stays available
  from the whole rest of the pair. The alternative (a bend→fold promotion rule)
  would need a second, more decisive upward threshold, weakening the fold
  threshold everywhere else to recover one corner. On an already-revealed pair
  there is nothing to peel, so the corner is ordinary surface and a fold may
  start from it.
- **`Ignored` is terminal**: a drag that starts sideways/downward cannot become
  a fold by curving upward.
- **Fold legality is sampled once**, at classification. A drag that outlives the
  player's turn disarms (via `FOLD_DISARMED` from the prop change, applied to
  the session by `applyCardEvent`) rather than reclassifying. `applyCardEvent`
  touches the session on *only* that event — ending the session on any other
  would strand the release, so `finish` would bail on a pointer it has no
  session for and nothing would disown the synthetic click.

Geometry (§15, read from the spec rather than re-derived):

- **Peel progress** counts leftward and upward inward travel *equally*. So a
  pure leftward drag drives the peel at full rate (finger clear of the rank/suit
  being read), and because leftward alone suffices, the bend can't be stolen by
  the fold recognizer, which needs upward dominance.
- **Bend axis** ties read as `up` (finger over the face — the case the "drag
  left" prompt fixes).
- **Fold threshold** is a *distance* proportional to viewport height with a px
  floor, so the swipe is the same gesture on every phone and a short/split
  screen can't put the one irreversible, money-losing Action inside an ordinary
  thumb flick. Re-measured per move (a keyboard or rotation changes it under a
  running gesture).
- **Fold flight distance** carries the committed pair off-screen (at least a
  viewport, or twice the threshold), so the departure reads as *gone*.

A flick fast enough to classify and cross in one move emits both events, in
order, and the reducer applies them in order.

## Finishing a gesture (`finishPlan.ts`, `taps.ts`)

`planFinish` is the seam where a finger movement turns into a sent poker Action,
pushed out of the renderer so it's tested by construction rather than by a
simulated pointer (#156). It returns an ordered `effects` list; the hook owns
only the imperative replay (dispatch events, call the named Action functions,
seed the confirmation timer).

The order encodes the two sequences that cost money:

- **conceal before Check** — the `TAPPED`/`DOUBLE_TAPPED` dispatch precedes the
  `check` send, so the player sees the cards go down then the confirmation, with
  no timer between (story 31);
- **depart before Fold** — `leaving` is applied and `RELEASED` dispatched before
  the `fold` send, so the pair is already flying to the muck when the Action
  goes and the departure is the player's own answer, not the server's (§7).

Legality (`foldLegal`/`checkLegal`/`muckLegal`/`pending`) is for **arming and rendering
only**. `canAct` inside `intent.fold`/`intent.check` stays the single gate on
whether an Action is sent, so a stale flag can at worst arm a gesture `canAct`
then refuses — never send one. `planFinish` re-samples fold legality (and
`pending`, so a Fold can't stack on an in-flight Action) because a release can
beat the view that would have disarmed it; a drag that armed but outlived its
turn emits `FOLD_DISARMED` before `RELEASED`, with no rejection message because
the turn banner already explains it (§6).

Tap window (§5, story 27) — **no timer arbitration**. A tap is answered the
moment it lands: the Check goes on the second tap's *arrival*, not on a timer
deciding 280ms later that no second tap is coming. That makes the gesture a
reflex, and it's why the conceal from the first tap is visible before the Check
it may become. Accepted trade-off: a Check can't be sent while keeping the cards
face-up (the first tap already put them down); one tap gets them back. A
completed pair closes the window rather than carrying the second tap forward, so
three quick taps send **one** Check. `confirmsCheck` decides only whether to
*tell* the player it landed (rendering), never whether it's sent.

The clock is monotonic (`performance.now()`) throughout, so a wall clock
stepping backwards mid-hand can't pair two unrelated taps into a Check.

## View adapter (`viewEvents.ts`)

`eventsForPropChange` is the one place a server-shaped `PlayerView` becomes
lifecycle events (§8) — the reducer never sees a view and the hook decides
nothing, which makes "an incoming view is inert" a tested property. The
**default return is the empty array**: `hand-update` fires for every event in
the hand, and peeking at your cards is exactly what you do while others act, so
a new street, board card, another player's bet, or changed `toAct` must all
produce nothing.

- Cards arriving is the deal signal (there is no hand id on `PlayerView`), by
  card *identity* not reference, with a value comparison as a defensive second
  signal for a betting→betting swap without an intervening empty view.
- `SEALED` and `SHOWDOWN_REVEAL` are ordered *after* `DEALT`, so a seat whose
  cards only arrive at showdown is dealt in before it's revealed.
- Only the falling edge of `pending` produces `PENDING_RESOLVED` (the pair
  already moved itself to `Leaving` on release); acknowledged vs rejected is
  read off the cards, not off any rejection state.
- Fold legality disappearing under a live `FoldDragging` is the one §8
  disturbance that reaches an in-progress gesture; if the same view also removes
  the cards (clock expiry/eviction), `CARDS_GONE` ends the gesture and is the
  only event needed.

`eventsForVisibility` handles the one reset that isn't a prop change: the app
leaving the foreground (`visibilitychange`, a document event the hook
subscribes). Only the outbound (`hidden`) edge produces `RESET` — coming back is
not a second disturbance, and concealing cards the player has since turned over
would be. The other two §9 resets need no subscription: a new hand arrives as
`DEALT`, a reload remounts through `initialCardState`.

## React binding (`useHoleCards.ts`)

`useHoleCards` binds the pure lifecycle to React and holds no rules worth
testing through a renderer — every decision is delegated (`eventsForPropChange`,
`moveGesture`, `reduce`, `planFinish`). Notable choices:

- The prop-change adapter runs in a **layout** effect
  (`useIsomorphicLayoutEffect` — `useEffect` on the server to avoid the SSR
  warning), deliberately un-keyed: the adapter compares props itself and returns
  nothing for the vast majority of renders. A layout effect means a new hand's
  cards are never painted under the previous hand's presentation.
- `leavingFaceUp` and `departing` are React state (read during render) but
  written only in the same event as the commit, so they land in the same render
  as `Leaving` — no frame shows the wrong face or an empty seat.
- `departing` keeps the committed pair rendered for exactly one flight
  (`FOLD_FLIGHT_MS`) after the `cards` prop is taken away. The flight is
  fire-and-forget on its own ~280ms schedule and **not** gated on the round trip
  (§7): on a LAN the ack lands tens of ms in and would otherwise make the
  promised departure a blink (story 20).
- `inFlight` = `Leaving`, or (`departing` set and `Absent`) — the ack resolves
  the reducer to `Absent` within ms, and the flight isn't gated on it. The
  flight effect depends on nothing but `inFlight`, and **stopping the animation
  on cleanup is what makes a rejection interrupt the departure** rather than
  finish it: the flight is a prediction of server truth, and finishing it after
  a contradiction would lie to the player.
- `disownClicksUntil` is a *deadline*, not a flag: every completed gesture
  (including a tap) disowns the synthetic `click` the browser raises afterwards,
  which would otherwise re-answer the gesture (re-reveal a just-concealed pair,
  or reveal on the first tap of a Check). A flag would go stale because a click
  isn't guaranteed to arrive (touch drags usually produce none; cancelled
  pointers never do) and would swallow the next real activation, including the
  Enter/Space §12 guarantees.
- `finish` reads off the `session` ref (as current as the events the reducer has
  been given), because the rendered state can lag a threshold crossed one
  pointer event ago and a fast flick is the commonest way to fold.
- Contact tracking (`pointersDown`, `contact`) is separate from the
  gesture-owning pointer: a stray second thumb is ignored as a *gesture* but is
  still a finger on the cards, so a hint must not reappear under it. `quiet` is
  the ~2s of stillness the teaching hints wait for, keyed on the eligible
  gesture *and* contact so it's an interval, not a one-time delay.
- `coarsePointer` is **subscribed**, not read once, so a tablet gaining/losing a
  trackpad follows the pointer actually in use. `(pointer: coarse)` (primary),
  not `any-pointer: coarse` — the latter is true for any touchscreen laptop,
  exactly the case the touch gate excludes.
- The return spring for the pair coming to rest is a spring, not a duration:
  the cards were being *carried*, and letting go of something carried has weight
  and a little overshoot.

## Coaching hints (`coaching.ts`)

The four teachable gestures, **in teaching order**: `bend`, `conceal`, `check`,
`fold`. Bend is Peek *and* Reveal (one gesture at two depths), which is why
there are four and not five. The order *is* the list — the selector offers the
first gesture not yet found — so "at most one hint" and "Bend before Conceal
before Check before Fold" are the same fact, not two rules that could disagree.

`selectHint` returns the one hint to show, or none, with a strict precedence:

1. **Check confirmation** (`checkConfirmed`) outranks everything, including the
   pending gate it necessarily trips — it's the answer to a gesture just made
   (story 31), and without it the only sign a double-tap landed is the ActionBar
   the gesture exists to stop the player watching.
2. Nothing while `pending`, `locked`, or `Absent`.
3. **In-gesture prompts** (bend / fold feedback) — permanent for *every* player
   forever, **not** gated on the discovery set or the coarse-pointer gate. They
   say what releasing will do, and for the fold that text *is* the arming
   signal: there is no rendered fold-threshold marker and browser vibration is
   Blink-only, so on iPhone/Safari the fold line plus the card motion is the
   whole signal. Card motion and text must never disagree.
4. **Teaching hints** — instruction, gated on `coarsePointer` (don't tell a
   keyboard player to bend corners), an idle recognizer, the quiet interval, and
   a held presentation (`FaceDown`/`Revealed`).

`nextTeachable` is separate from `selectHint` because the quiet interval is
measured *from the moment eligibility becomes true*: the caller must know which
gesture is up before deciding whether it has waited long enough. Otherwise only
the first hint of a session would observe the interval and Fold would appear the
instant a turn made it legal.

`discoveredBy` decides which gesture a card event proves found — **on-pair,
never on a button**: every event it sees comes from the recognizer, and pressing
Fold/Check in the ActionBar reaches the module only as a prop change. That's the
point: the hint exists to move the player off the button, so the button must not
retire it. Discovery is on the *classification* (the motion made), and a tap
retires the conceal hint only where it actually hid something.

Copy and eligibility live together in `TEACHING` so each gesture is defined
once. Check sits above Fold in the overlap, which is quieter than it looks: a
legal Check means no bet to face, so teaching someone to fold for free is bad
advice; where a bet *is* faced, Check is illegal and Fold is the only eligible
hint — so the irreversible, money-losing Action is never pushed at a player two
hands into their first session. The bend's corner is derived from the rendered
affordance (`BEND_CORNER`), so if the layout ever mirrors, the words follow.

Only the Check confirmation is announced to a screen reader (`announce`);
teaching hints and in-gesture prompts describe what the player *could* do, and
announcing those over a live gesture would be noise.

Discovery persists (`hintStorage.ts`) per-device and permanently — a returning
player is not re-taught. Absent/malformed storage both read as "nothing
discovered" (an extra hint is the cheapest way to be wrong); an allow-list on
read/write keeps a name from a later version or a hand edit from reaching the
selector. Writes swallow their exception: Safari private browsing throws, and
the write shares a handler with a Fold/Check that must not be lost over a hint.

## Components (`HoleCardPair.tsx`, `BendableCard.tsx`, `CheckStamp.tsx`)

`HoleCardPair` is a real focusable `button`: Enter/Space toggle reveal/conceal,
so reading your own cards never depends on a gesture's timing (§12). It renders
off the **lifecycle's** `locked`, not the prop (the prop is the adapter's
input), so keyboard and gesture can't part company. A committed pair renders
from `departing` once the prop drops it; an `Absent` presentation during the
deal-observation gap renders as `FaceDown` (the honest entry state).

- The pair claims the whole card region (`flex: 1`, auto margins) so spare
  height on a tall phone is placed *inside* the column, collapsing to the tight
  stack on a short screen.
- `touchAction: none`, `userSelect/WebkitTouchCallout/WebkitUserSelect: none`,
  and `onContextMenu={preventDefault}` stop the OS callout/selection menu and
  the browser claiming the drag as a pan or the second tap as a zoom (§16). The
  app shell is fixed and non-scrolling, so taking the whole gesture loses
  nothing. `WebkitTapHighlightColor: transparent` kills the Android Chrome
  press wash that a long-press holds long enough to read as a highlight (#195).
- A locked pair is inert but keeps its accessible name and tab order (at
  showdown that name is where a screen-reader user reads their hand; `disabled`
  would remove it). The accessible name carries state, the activation outcome,
  and — once revealed — the card faces themselves.
- The deal-in `motion.span` is keyed on **card identity** so a new hand replays
  the face-down deal-in (§17), replacing `Hand`'s per-card face-up animation;
  the key is on the motion element so it restarts an animation without
  discarding lifecycle state. A nested `motion.span` carries the fold offset/fade
  from `MotionValue`s so they compose with the declarative deal-in instead of
  fighting over `y`/`opacity` on one element.
- `Announcer` is a `role="status"` live region mounted for the pair's lifetime
  and empty until there's news: a live region inserted *with* its text isn't
  reliably announced, so it must pre-exist. The visible hint copy is hidden from
  AT so news is read once.

`BendableCard` (§14) keeps bend/turn in the player client so `ui-shared` gains
no gesture concepts. The bend is a real corner curl via `react-peel`, not a
wipe: you read the card's own face on the *underside* of a lifted sheet, which
is what makes it feel like lifting a physical card. Because `react-peel` pins
the back layer's bottom-left corner for a bottom-right peel, the face's own
bottom-right index falls outside the visible curl (a bend used to show bare
white card) — `CurlIndex` is that index remapped to where the geometry puts it,
rotated 180° to read upright, and hidden from AT (the accessible reveal is
`Revealed`). The face's own corner indices are suppressed on the curl copy
(`app-shell.css`) because they land arbitrarily once the sheet rotates. Crossing
the threshold carries the same sheet past the opposite corner rather than
starting a different animation — which is why the peel is mounted for `Turning`
as well as `Peeking`. The face is in the document only while looked at
(`curling`), so a face-down pair carries no rank/suit at all.

`CheckStamp` is the sighted Check confirmation: non-interactive
(`pointerEvents: none`, so a tap on it is still a tap on the cards) and hidden
from AT (the live region already speaks it). Styled from theme tokens because
there's no CSS-variable bridge to them. Reduced motion gets the stamp already at
rest rather than the same movement hurried into an imperceptible duration.
