# Table-top Poker

A Texas hold'em table played across one central device (the table) and each
player's phone. This context defines the vocabulary shared by the engine,
server, and clients — the nouns every hand is built from, and the lifecycle
a hand moves through.

## Language

**Room**:
The persistent host for a poker night. Created when the table device starts
it; holds the current seating and button position across hands; ends when
the table device closes it. A Room hosts exactly one Table and as many
seated Players as it has Seats. The table device may change the Seat count
between 2 and 8 while the Room exists; a shrink during a live hand waits for
the next deal-in, while an idle Room repacks claimed positions immediately
without evicting anyone (ADR-0004).
_Avoid_: Game, Session — both mean Room.

**Table**:
The UI role of the central device that displays the shared board and hosts
the room. Not an engine-level state holder — the state it displays belongs
to Room. A room has exactly one table.
_Avoid_: Using "table" for anything other than the central device's role.

**House rules**:
Settings chosen by the table device for the current Room. The first setting
is the Room's Seat count; the settings sheet may grow to hold more rules
without changing the meaning of Room, Table, Player, or Seat.

**Player**:
The identity of a person seated at the table. Persists for the life of the
Room — across hands, and across a Device disconnecting and reconnecting.
If the table shrinks, the Player keeps their claim token while their
positional Seat id may change (ADR-0004).

**Seat**:
A position at the table (tracked positionally for the Button and blinds),
occupied by a Player for as long as they remain seated. Persists across
hands within a Room; a Player keeps their claim through a Device disconnect.
The table device chooses the Room's initial Seat count from 2 (heads-up) to 8
and may change it later. A shrink repacks claimed Players into the surviving
positions, so a Seat id is mutable position rather than permanent identity;
the claim token and seat state move with the Player. The count can never fall
below the number of claimed Seats; a shrink during a live hand applies at the
next deal-in, while a shrink between hands applies immediately (see ADR-0002,
ADR-0003, ADR-0004); a displayed completed hand follows the same positional
mapping. A Seat is always in one of four states: Active, Sitting-out,
Disconnected, or Evicted.

**Sitting-out**:
A Seat state the Player toggles themselves — not dealt in. Distinct from
Disconnected, which is involuntary.
_Avoid_: Conflating with Disconnected — sitting-out is a choice, not a
connection failure.

**Evicted**:
The table device manually freeing a claimed Seat — its token is
invalidated and it returns to the join picker. Not automatic and not tied
to any counter; the table decides when (see ADR-0003).

**Device**:
A Player's current live connection (their phone's socket). Ephemeral — can
drop and re-establish without affecting the Player or their Seat. Chain:
Device authenticates as → Player → occupies → Seat.

**Hand**:
A single deal-to-completion cycle: a seed plus an ordered command list.
Born and ends inside a Room's lifetime; the Room persists, the Hand does
not.

**Street**:
One betting round within a Hand: Preflop, Flop, Turn, or River. Preflop
counts as a street despite dealing no board cards — it has the same
last-aggressor closure logic as the others.

**Board**:
The community cards, dealt progressively across Flop (3), Turn (1), and
River (1).

**Hole cards**:
A Player's private two cards, dealt once at the start of a Hand and pushed
to their Device at deal time (not fetched later at reveal).

**Hole-card reveal**:
Turning a Player's own Hole cards persistently face-up on their own Device.
Local presentation for the whole Hand: it does not change poker visibility or
server state. The one exception is the Showdown showing window, where the same
gesture *is* the *Showdown show* and publishes the Hand to the room (#253).
Every contestant's pair opens the window face-down for exactly this reason, so
the reveal that publishes is always a deliberate one.

**Hole-card peek**:
Temporarily lifting a corner of a Player's own Hole cards to read them, closing
again on release or cancellation. Like reveal, purely local presentation. Peek
and reveal are one gesture at two depths, not two gestures.

**Hole-card conceal**:
Returning revealed Hole cards to face-down. Player-facing copy says "hide";
*conceal* is the domain term.

**Muck**:
Where a folded Hand goes. Not a place the engine models and not a pile
anything is added to: folding simply stops the Seat's Hole cards being
projected to anyone, including its own Player, and Replay re-projects the
same way so a muck stays mucked. The word survives because it names the
*direction of travel* the player client acts out — the muck flight, the
committed pair departing on the swipe that folds it — which is local
presentation, on its own schedule, and never a state cards can be recovered
from.
_Avoid_: Treating the Muck as storage, or as somewhere a Hand can be read
back from — a fold is final, and nothing is kept.

**Action**:
A completed poker decision for a Seat — fold, check, call, raise, all-in call
or all-in raise — whether chosen by its Player or synthesized by the server
when the Seat cannot act. Logged as an Event. Distinct from *to act* / the
*Actor* (see below), which is about whose turn it is, not a decision that has
happened.

**All in**:
A Seat that has put its last chips in and can take no further Action this
Hand. Declared by the Player, who is the only party that knows their own
stack, as one of two Actions: an *all-in call*, which does not reopen the
betting, or an *all-in raise*, which requeues every other live Seat exactly
as a raise does (ADR-0007). Both retire the Seat from the betting for the
rest of the Hand; neither carries a chip amount. A Player who covers a shove
and wants to keep acting simply calls. `legalActions` offers each arm only
where it means something: an *all-in call* needs a bet to match, and either
raise needs a Seat left able to answer it — against a table already all in
there is nothing to raise into, so only the call stands. The Player Device
offers one wide "All in" while no Seat has shoved and splits it into
"All-in call" and "All-in raise" once another Seat is all in, showing whichever
arms are legal. Both take a confirm press, and once the Seat is all in its
Action bar goes away and its Hole cards are *sealed* — held, inert, and still
face-down until the showing window opens, which tables them at once.
_Avoid_: Treating all-in as a folded Seat — an all-in Seat is live, keeps its
claim on the pot, and is revealed at Showdown. Side pots stay a
physical-chips problem the humans settle at the table.

**Actor**:
The Player whose turn it currently is. A derived property of Hand state,
not a persistent identity.

**Command**:
An input proposing or directing a Hand transition, before it is validated and
turned into Events. It may come from a Player or be synthesized by the server
for a trusted Table action or action-clock decision.

**Button**:
The Seat marked as dealer for the current Hand — a positional marker that
rotates each hand, not a Player identity.
_Avoid_: Calling the button "the dealer" as if it were a role a Player
holds independent of their Seat.

**Small Blind / Big Blind**:
The Seats immediately clockwise of the Button (SB = Button+1, BB =
Button+2), fixing action order and the BB's option to check/raise if
everyone limps preflop. Preflop opens on the first Seat left of the blinds
(Button+3) and runs to the BB, so the BB's "option" is simply their turn,
which is the last one — not a second visit. No chip *amount* is tracked or
stored by the engine
— players post real physical blinds at the table, outside the program — but
preflop *legality* still mirrors that post: every Seat except the BB faces
a bet (must call/fold/raise, may not check) until someone raises or the BB
gets its option, exactly as if the BB's post were a bet already on the
table, because physically it is (see ADR-0001).

**Heads-up**:
The two-live-player case. The Button acts as Small Blind, acting first
preflop but last on every subsequent street — the standard heads-up
reversal.

**Showdown**:
The state where the Hands still live after River closes are ranked, the
winner(s) declared, and ties reported as splits. Skipped entirely when a Hand
ends early by fold-out. River close opens the showing window by itself; the
Hand rests until every contestant has shown or mucked (ADR-0009).

**Contestant**:
A Seat that reached Showdown, shown or not. Every view names the contestants;
only a Seat that has shown appears in `results`, so holding a `RevealedResult`
is proof the cards are public.

**Showdown show**:
Publishing a contestant's Hole cards to the whole room, irreversibly, with the
`show` Command. A Player sends it by revealing their Hole cards with the
ordinary reveal gesture on their own Device — there is no separate control —
and only on their turn at the head of the *Showing order*. Every all-in
contestant is shown by the engine as the window opens: their Hands were decided
streets ago and they have no decision to make. A Seat's verdict is withheld
from the table until that Seat's cards are public, so `wins` never sits over
two face-down cards.
_Avoid_: Confusing a show with *Hole-card reveal*, which stays local to one
Device and can be undone.

**Muck**:
Declining to show at Showdown, with the `muck` Command — the same upward
fold-drag that folds during betting. Mucking forfeits: winners are computed
over shown Hands only, so a mucked winning Hand takes nothing. Barred while no
Hand is yet face-up, since a Pot must never be settled with nothing tabled; the
first Hand face-up discharges that compulsion for everyone left, including a
Seat holding the best Hand. A mucked Seat is carried separately from an unshown
one: *declined* and *not shown yet* are different states and the table tells
them apart.
_Avoid_: Reading a Muck as a fold — a mucked contestant reached Showdown, and
its Seat is still in `contestants`.

**Showing order**:
The queue of contestants owing a show or a muck, head first. Set as the window
opens: the River's last aggressor first, or the first live Seat left of the
Button when the River checked through, then clockwise. All-in contestants never
queue. Only the head may show or muck; anyone else is rejected. The window
closes when the queue empties, which is when the winners are published and when
`nextHand` and `startHand` stop being rejected.

**Showdown clock**:
The per-Room House rule bounding each turn in the *Showing order*, in seconds
and defaulting to 30. Unlike the *Shot clock* it cannot be turned off: with
showing ordered, one locked phone blocks every Player behind it. It reuses the
Shot clock's scheduler and `turnEndsAt`. Expiry mucks the head — or shows them
where they are compelled, which is the one place cards are turned over on a
Player's behalf. The engine holds no clock: an expiry is an ordinary Command the
server issues, so it lands in the recording and replays as an ordinary act.

**Pot**:
The physical chips in the middle of the table — a spoken/table term only.
Phase 1 tracks no value, no state; the engine never references a Pot.
_Avoid_: Treating Pot, Stack, Chips, or Side pot as engine concepts —
they're Phase 4 scope, and conditional even then.

**Rejection**:
The typed value the engine returns when a Command is not valid —
`{ type: 'Rejection', reason, command }`. Never thrown, never itself an
Event, never processed by `apply`. Delivered only to the Device that sent
the Command, and kept in the Hand recording for audit; it is absent from
every player-facing shape, including the table-facing Replay position type.
A Replay of a Hand still carries its Rejections, as the validated developer
transcript they are.
_Avoid_: Calling a Rejection an error or an event.

**Room ID**:
The opaque UUID a Room is given at creation, naming its Room recording
directory on disk. Distinct from the four-character join code, which is a
live, human-typed handle with no durable meaning.
_Avoid_: Using the join code as a durable identifier.

**Room recording**:
The durable, unredacted, local record of a Room — an immutable `room.json`
manifest plus one Hand recording per Hand, under the Room ID's directory.
Written by the server for every Room, from creation until the Room ends. It
cannot be disabled by configuration and never stops silently; it stops only
where the table is told a write failed and deliberately chooses to carry on
without it. Owned by the `recording` package; the engine holds no I/O.
_Avoid_: Log — a Room recording is the whole directory, not one file.

**Hand context**:
The immutable document a Hand recording opens with: the participating
Seats, the starting Button, the Hand ordinal, and `startedAt`. Contains no
cards and no state snapshot — it is the bootstrap Replay needs, not a
saved position.

**Hand recording**:
One Hand's independently replayable triplet within a Room recording — its
Hand context, its exact ordered Commands, and the resulting Events and
Rejections. Replaying it never requires any other Hand.

**Replay**:
Rebuilding a Hand from its Hand recording by re-running its Commands
through the engine and validating the generated Events against the
persisted ones. A pure engine capability, taking no audience, redaction or
`revealEverything` option: it returns complete `EngineState` per position,
and the visibility split is made by surface. The table surface obeys live
visibility exactly by re-projecting `view(state, 'table')`, so a muck stays
mucked and a folded Seat's cards are shown to no one; the local dev stepper
renders the complete state directly.
_Avoid_: Treating Replay as a stored playback or a recording of views.

**Replay position**:
A point within a replayed Hand, addressed as an Event ordinal — position
*n* is the state after applying *n* Events, and carries that *n*th Event
alongside it. Position 0 is the starting state with no Event. A Rejection
occurs *at* a position without advancing it.

**Incomplete replay**:
A Replay that stops early with everything it did read agreeing — the
recoverable prefix of a damaged Hand, never a corrupt one. Two causes: a
single clearly *torn record*, the final JSONL line a `SIGKILL` cut mid-write,
which the reading adapter discards; and an *orphaned Command*, where the
Command log runs past the persisted Events because the outcome was never
recorded. The table hand picker must not offer an incomplete Hand; the dev
stepper shows the prefix with a warning.
_Avoid_: Calling either corruption — a disagreement between complete records
is the corrupt case, and it is a hard failure.

**Hand review**:
The table device's two surfaces for a finished Hand: a picker that chooses
one from the session, and a Scrub that plays it back on the felt. Reachable
only between Hands, and force-dismissed the moment a Hand starts — a review
left open can never swallow the Board.

**Scrub**:
The table's replay transport: a timeline the width of the felt, ticked once
per Replay position and chaptered by Segment, draggable to any position.
Autoplay is a secondary toggle, not the primary mode.
_Avoid_: Calling it playback — getting to a moment is the point, not
watching the Hand through.

**Segment**:
The stretch of a Hand a replay position belongs to: one of the four Streets,
or Showdown. Showdown is not a Street — no betting round opens there — but it
is a place a viewer wants to jump to, so the Scrub treats it as one more
Segment after the River.

**Chapter**:
A Segment's landmark on the Scrub, seeking to the position that Segment opens
on. For every Street after preflop that is its `BoardDealt`, not its
`StreetStarted`: the engine's cascade emits `StreetClosed → BoardDealt →
StreetStarted`, so anchoring on the Street start lands after the cards
appeared and the viewer never sees them arrive. Showdown anchors on
`ShowdownReached`, where the contestants are named. A folded-out Hand reaches
no Showdown and so offers no such Chapter. Chapters are the navigation
contract; the per-position ticks beside them are a visual affordance that
may collapse on an unusually long Hand.

**Action label**:
What a Seat has done on the Street now on the felt, carried in the same slot
the live "To act" pill uses. Folded back out of the Event stream: the table
view's Seats carry only `folded`, so the view at a position cannot supply
them. Cleared at each new Street, on the same boundary a Chapter anchors to —
once the Turn is out, "Seat 4 called" is about a Street nobody is looking at.
Cleared again when the betting ends, at Showdown or a fold-out: the reveals
and the verdict are what the felt is saying then.
Raise is orange rather than accent red, which belongs to the clock, and Call
is the one cool fill on an otherwise warm felt.
_Avoid_: Showing one beside a "To act" pill. They share a slot, and the
clock wins it: a Seat facing a re-raise is on the clock, which is the more
urgent of the two things to say about it.

**Caption**:
The beat the Scrub has landed on, named in a band of its own below the felt
so it can never sit on a Seat pod. A bottom-row pod grows below its anchor
and, on a felt short enough, reaches into that band anyway — the Caption is
drawn under the felt, so what gives is the Caption and never the table. The
Caption says what happened and the
Scrub's track shows progress; between them no Event ordinal is ever on
screen. Position-as-ordinal stays the addressing scheme, but `11 / 33` means
nothing to someone at a poker table. Which Hand is under review belongs in
the status bar instead, not to a second title floating over the felt.

**Hand summary**:
What one completed Hand looks like in a list of them — its ordinal and
start time, the Button, the Seats dealt in and the Survivors, the public
Board, the Street reached, the Betting shape and the outcome. Derived once,
by a pure function over the Hand's Events, so the server and anything
replaying from disk cannot disagree about it.
_Avoid_: Calling it a Hand context — that is the document a Hand recording
opens with, not this projection of a finished Hand.

**Betting shape**:
How the betting went, as one of five structured descriptors — a walk, a
preflop raise, checked down, one raise, or a raise war with its raise
count. It is what makes otherwise identical fold-outs distinguishable in a
list. Structured, never prose: the wording belongs to whichever client
renders it.

Two boundary calls fix the partition. Two or more raises read as a raise war
wherever they happened, so a preflop 3-bet that ends preflop is a raise war,
not a preflop raise — the count is the more informative fact, and a preflop
raise is *one* raise winning uncontested. Checked down is the residual, so it
also covers an unraised Hand that saw a flop and then folded out; a walk is
reserved for the Hand that died preflop, which is the distinction the picker
needs. A client's copy for checked down must therefore not promise a Showdown.

**Survivor**:
A Seat that was dealt into a Hand and never folded. One Survivor means the
Hand folded out; two or more mean it reached Showdown. Distinct from the
Seats dealt in, which folding never reduces.

## Hand lifecycle

```
[Room: seated, awaiting hand]
        │ table device starts hand (seed provided)
        ▼
   DEALING_HOLE          — hole cards dealt to each seated Player
        │ deal complete
        ▼
   PREFLOP (a Street)    — button+3 first to act, running round to the BB
        │                  last (heads-up: button acts first); the BB's
        │                  option is that last turn
        ▼
   FLOP (a Street)       — 3 board cards dealt, betting round
        │
        ▼
   TURN (a Street)       — 1 board card dealt, betting round
        │
        ▼
   RIVER (a Street)      — 1 board card dealt, betting round
        │ street closes (last-aggressor logic)
        ▼
   SHOWDOWN               — contestants named, all-in Hands tabled,
        │                   the rest queued to show or muck in turn
        ▼
   HAND_COMPLETE           — the showing window runs on a clock; winners
        │                    are published once the queue empties, and
        │                    only then does "Next hand" appear
        ▼
[Room: seated, awaiting hand]  (button rotates)
```

**Early-out**: from any betting Street, if a fold drops live players to 1,
the Hand transitions directly to HAND_COMPLETE — Showdown is skipped, no
remaining board cards are dealt, no hands are shown. All-in Seats count as
live here, so a Seat that has shoved cannot be folded out of a pot it has
already bought a claim to (ADR-0007).

**Run-out**: once fewer than two Seats can still act, the remaining Streets
deal without opening — board cards arrive, no betting round starts — through
the River and on to Showdown. A Street already open ends as soon as nobody
left to act faces a bet, for the same reason: there is no turn to take with
nothing to bet against. A Seat facing a shove still gets its fold-or-call.

**Street closure**: a Street ends once every live Player has acted since
the most recent bet or raise and none still owes a response
(last-aggressor logic).

**Heads-up**: with exactly two live players, the Button is also the Small
Blind — it acts first preflop, then last on Flop, Turn, and River.
