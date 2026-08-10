// The production tactile-sound layer (#186), ported from the tuned logic in
// `proto/sound-181`'s throwaway prototype — minus its A/B tuning store and
// on-screen panel. Turns the live `HandEvent` stream into heard, tactile card
// cues, gated by the room settings (#184) and playing the canonical AAC assets
// (#185).
//
// Design decisions baked in here (per the map, #177, and its decisions):
//  - Cue ownership (#180): the TABLE is the dealer/center voice (the whole
//    hole-card deal sweep, the board); each PHONE is its own player (its own
//    two hole cards, own fold, own check knock, own reveal/conceal flip, own
//    your-turn prompt).
//  - Multi-card deals sound per card: the flop is three distinct board taps
//    (board gap), a phone's hole cards are two distinct slides (the wider hole
//    gap) — one scheduled play per card. The your-turn prompt is held a beat
//    past the last hole card so cards land first, then the prompt.
//  - Sounds fire ONLY from `hand-update` (which carries the raw event), never
//    from `view-snapshot` — so a reconnect/refresh mid-hand can't replay a
//    burst of cues (the map's rejoin worry, #175). That gate lives in the WS
//    hooks that call `onHandUpdate`; this module never sees a snapshot.
//
// The engine is a pure state machine over injected effects (`play`, `now`,
// `schedule`) so the event→cue mapping, the settings gate and the your-turn
// cancellation are all unit-testable without Web Audio. The production wiring
// (AudioContext, buffers, unlock) lives in `webAudio.ts`.
import {
  DEFAULT_SOUND_SETTINGS,
  type HandEvent,
  type PlayerView,
  type SoundSettings,
  type TableView,
} from "@table-top-poker/protocol";
import { type CueName, cueAllowed } from "./cues.js";

export type Surface = "table" | "player";

/** The single `hand-update` payload the WS hooks hand to the engine. */
export interface HandUpdateArgs {
  readonly surface: Surface;
  readonly event: HandEvent;
  readonly view: PlayerView | TableView;
  /** The phone's own seat; omitted on the table surface. */
  readonly seatId?: number;
}

/**
 * The side effects the engine drives, injected so the mapping is testable.
 * `play` is the raw sink — the engine only ever calls it for a cue that has
 * already passed the room-settings gate.
 */
export interface SoundEffects {
  /** Emit a single already-gated cue now. */
  readonly play: (cue: CueName) => void;
  /** Current epoch ms. */
  readonly now: () => number;
  /** Run `fn` after `delayMs`; fire-and-forget (cancellation is via token). */
  readonly schedule: (fn: () => void, delayMs: number) => void;
}

export interface SoundEngine {
  /** Called on every `hand-update` (never `view-snapshot`). */
  readonly onHandUpdate: (args: HandUpdateArgs) => void;
  /** Mirror the room-view sound settings (#182) — the WS hooks call this. */
  readonly applyRoomSoundSettings: (settings: SoundSettings) => void;
  /**
   * The reveal/conceal flip cue — a client-side presentation change on the
   * player surface, not a wire event, so the hole-card hook calls it directly.
   */
  readonly playRevealFlip: () => void;
}

/** The tuned timings the prototype settled on, in ms. */
export const TIMINGS = {
  /**
   * Gap between hole cards in the dealer's sweep — wider than the board gap so
   * each dealt card is obvious as the deal reaches around the table.
   */
  dealStaggerMs: 600,
  /** Gap between board cards (the flop's three taps). */
  boardStaggerMs: 250,
  /** The deliberate beat between the last hole card and the your-turn prompt. */
  turnAfterDealMs: 700,
  /**
   * A board deal always follows the action that closed the street (a check or
   * call), so its sound would otherwise land right on top of that closing
   * action's — the check knock especially. Hold the board cue this long so the
   * closing sound clears first and the two never overlap.
   */
  boardLeadInMs: 600,
} as const;

/**
 * Create a sound engine over the given effects. One instance is a stateful
 * singleton shared across a surface's WS hook and hole-card hook; the
 * production instance lives in `webAudio.ts`, tests construct their own with
 * spy effects.
 */
export function createSoundEngine(
  effects: SoundEffects,
  initialSettings: SoundSettings = DEFAULT_SOUND_SETTINGS,
): SoundEngine {
  let settings = initialSettings;

  /** Edge-detect "it just became my turn" so the prompt fires once, not per view. */
  let lastMyTurn = false;
  /**
   * Bumped every time the turn state changes. A deferred your-turn prompt
   * captures the token when scheduled and only plays if it still matches when
   * the timer fires — so acting (or the hand ending) before the deferral
   * elapses cancels the stale prompt instead of firing it after the fact.
   */
  let turnToken = 0;
  /**
   * When the current hand's last hole card lands (ms epoch). The your-turn
   * prompt is deferred to this plus `turnAfterDealMs`, so a player hears their
   * cards settle and a clear beat before the prompt. Later streets leave this
   * well in the past, so a mid-hand turn prompts without the pause.
   */
  let lastHoleCardAt = 0;

  function playCue(cue: CueName): void {
    if (cueAllowed(settings, cue)) effects.play(cue);
  }

  /** Fire a cue once per card, staggered so multi-card deals read as distinct. */
  function staggeredCue(
    cue: CueName,
    count: number,
    gapMs: number,
    startDelayMs = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      effects.schedule(
        () => {
          playCue(cue);
        },
        startDelayMs + i * gapMs,
      );
    }
  }

  function onHandUpdate(args: HandUpdateArgs): void {
    const { surface, event, seatId } = args;

    switch (event.type) {
      case "HandStarted":
        lastMyTurn = false;
        lastHoleCardAt = 0;
        break;

      case "HoleCardsDealt": {
        // A dealer's sweep, one distinct slide per card, spaced by the wider
        // hole-deal gap so each dealt card is obvious. The table hears the
        // whole table dealt; each phone hears only its own two cards (#180).
        // The your-turn cue below is held until this sweep ends.
        const count =
          surface === "table"
            ? event.deals.reduce((n, d) => n + d.cards.length, 0)
            : (event.deals.find((d) => d.seatId === seatId)?.cards.length ?? 0);
        lastHoleCardAt =
          effects.now() + Math.max(0, count - 1) * TIMINGS.dealStaggerMs;
        staggeredCue("deal", count, TIMINGS.dealStaggerMs);
        break;
      }

      case "BoardDealt":
        // One tap per board card, staggered — three distinct taps on the flop,
        // one each on the turn and river. Table only (the center voice, #180).
        // Led in so it doesn't collide with the check/call that closed the street.
        if (surface === "table") {
          staggeredCue(
            "board",
            event.cards.length,
            TIMINGS.boardStaggerMs,
            TIMINGS.boardLeadInMs,
          );
        }
        break;

      case "ActionTaken":
        // Only the acting player's own phone voices its fold muck / check
        // knock; the table stays silent (#180). call/raise are unallocated
        // (no chip asset yet).
        if (surface === "player" && event.seatId === seatId) {
          if (event.action === "fold") playCue("fold");
          else if (event.action === "check") playCue("check");
        }
        break;

      case "StreetStarted":
      case "StreetClosed":
      case "ShowdownReached":
      case "HandFoldedOut":
      case "HandComplete":
        // No dedicated cue (your-turn is derived from the view below).
        break;
    }

    // "Action on you": derived from the phone's view, edge-detected so it fires
    // once when the turn arrives, and held until the deal sweep has finished so
    // the player hears their cards land first, then the prompt.
    if (surface === "player") {
      const { view } = args;
      const myTurn =
        view.phase === "betting" &&
        "legalActions" in view &&
        view.legalActions.length > 0;
      if (myTurn !== lastMyTurn) turnToken++;
      if (myTurn && !lastMyTurn) {
        const token = turnToken;
        const wait = Math.max(
          0,
          lastHoleCardAt + TIMINGS.turnAfterDealMs - effects.now(),
        );
        effects.schedule(() => {
          // Still this same turn when the deferral elapses? A newer turn-state
          // change (I acted, or the hand ended) bumps the token and cancels it.
          if (token === turnToken) playCue("yourTurn");
        }, wait);
      }
      lastMyTurn = myTurn;
    }
  }

  return {
    onHandUpdate,
    applyRoomSoundSettings(next: SoundSettings): void {
      settings = next;
    },
    playRevealFlip(): void {
      playCue("flip");
    },
  };
}
