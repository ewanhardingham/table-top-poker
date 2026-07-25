# Table-top Pocker

A Texas hold'em table played across one central device (the table) and each
player's phone. This context defines the vocabulary shared by the engine,
server, and clients — the nouns every hand is built from, and the lifecycle
a hand moves through.

## Language

**Room**:
The persistent host for a poker night. Created when the table device starts
it; holds the current seating and button position across hands; ends when
the table device closes it. A Room hosts exactly one Table and up to 8
seated Players.
_Avoid_: Game, Session — both mean Room.

**Table**:
The UI role of the central device that displays the shared board and hosts
the room. Not an engine-level state holder — the state it displays belongs
to Room. A room has exactly one table.
_Avoid_: Using "table" for anything other than the central device's role.

**Player**:
The identity of a person seated at the table. Persists for the life of the
Room — across hands, and across a Device disconnecting and reconnecting.

**Seat**:
A position at the table (tracked positionally for the Button and blinds),
occupied by a Player for as long as they remain seated. Persists across
hands within a Room; a Player keeps their Seat through a Device disconnect.
A Room has at most 8 Seats.

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

**Action**:
A completed decision by a Player — fold, check, call, or raise. Logged as
an Event. Distinct from *to act* / the *Actor* (see below), which is about
whose turn it is, not a decision that has happened.

**Actor**:
The Player whose turn it currently is. A derived property of Hand state,
not a persistent identity.

**Command**:
The input a Player sends proposing an Action, before it is validated and
turned into an Event. Matches the engine shape `decide(state, command) ->
Event[] | Rejection`.

**Button**:
The Seat marked as dealer for the current Hand — a positional marker that
rotates each hand, not a Player identity.
_Avoid_: Calling the button "the dealer" as if it were a role a Player
holds independent of their Seat.

**Small Blind / Big Blind**:
The Seats immediately clockwise of the Button (SB = Button+1, BB =
Button+2), fixing action order and the BB's option to check/raise if
everyone limps preflop. Purely positional in Phase 1 — no value is posted,
since chips aren't tracked.

**Heads-up**:
The two-live-player case. The Button acts as Small Blind, acting first
preflop but last on every subsequent street — the standard heads-up
reversal.

**Showdown**:
The state where all live hands (still in the Hand after River closes) are
ranked, the winner(s) declared, and ties reported as splits. Skipped
entirely when a Hand ends early by fold-out — no reveal in that case.

**Pot**:
The physical chips in the middle of the table — a spoken/table term only.
Phase 1 tracks no value, no state; the engine never references a Pot.
_Avoid_: Treating Pot, Stack, Chips, or Side pot as engine concepts —
they're Phase 4 scope, and conditional even then.

## Hand lifecycle

```
[Room: seated, awaiting hand]
        │ table device starts hand (seed provided)
        ▼
   DEALING_HOLE          — hole cards dealt to each seated Player
        │ deal complete
        ▼
   PREFLOP (a Street)    — button+1 first to act (heads-up: button acts
        │                  first); BB gets the option if everyone limps
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
   SHOWDOWN               — live hands ranked, winner(s) declared,
        │                   ties reported as splits
        ▼
   HAND_COMPLETE           — winning hand shown on the table; a
        │                    "Next hand" button appears
        ▼
[Room: seated, awaiting hand]  (button rotates)
```

**Early-out**: from any betting Street, if a fold drops live players to 1,
the Hand transitions directly to HAND_COMPLETE — Showdown is skipped, no
remaining board cards are dealt, no hands are revealed.

**Street closure**: a Street ends once every live Player has acted since
the most recent bet or raise and none still owes a response
(last-aggressor logic).

**Heads-up**: with exactly two live players, the Button is also the Small
Blind — it acts first preflop, then last on Flop, Turn, and River.
