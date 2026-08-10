// A serial presentation queue for the table surface (#186). The table shows
// the deal as a run of "beats" — a player action, a board deal — each with its
// own animation, its own sound, and an execution time that blocks the next
// beat. Without this, the board deal that a closing check triggers reveals its
// cards (and plays its taps) on top of the ~1.3s check knock still sounding on
// the acting player's phone. Holding the whole board reveal — animation and
// sound together — until the action beat finishes keeps the two in step and
// spaces them by a sensible beat.
//
// Beats are applied strictly in arrival order. Each is applied at
// `max(now, busyUntil)`, then `busyUntil` advances by the beat's execution
// time, so everything queued behind a sounded action waits it out. A
// view-snapshot is not a beat (a reconnect must not replay a delayed burst):
// it flushes the queue and is applied immediately by the caller.
//
// Pure over injected effects (`now`, `schedule`, `apply`, `duration`) so the
// ordering and the gaps are unit-testable without timers or a DOM.
import type { HandEvent } from "@table-top-poker/protocol";
import { CUE_DURATIONS_MS, cueSettleMs } from "./cues.js";

/**
 * The table's execution time for each event — how long it blocks the next
 * beat. Only the sounded moments hold: a check knock and a fold muck (heard on
 * a player's phone, but the table must wait them out before dealing), and a
 * board deal (so a multi-card run-out spaces itself). View-only events
 * (street/showdown transitions) don't block — they ride out immediately behind
 * whatever beat precedes them.
 */
export function tableBeatDuration(event: HandEvent): number {
  switch (event.type) {
    case "ActionTaken":
      if (event.action === "check") return cueSettleMs("check");
      if (event.action === "fold") return cueSettleMs("fold");
      // A call closes a street too, but has no chip cue yet (#186 leaves
      // call/raise unallocated), so there is no sound for the board to wait
      // out — it blocks for nothing. Wired here so it isn't forgotten: when a
      // chip asset lands, give `call` a duration and return its `cueSettleMs`.
      if (event.action === "call") return 0;
      return 0;
    case "BoardDealt":
      return CUE_DURATIONS_MS.board;
    default:
      return 0;
  }
}

/** One queued update: the raw event plus the per-recipient view it produced. */
export interface Beat<View> {
  readonly event: HandEvent;
  readonly view: View;
}

export interface BeatEffects<View> {
  /** Current epoch ms. */
  readonly now: () => number;
  /** Run `fn` after `delayMs`; fire-and-forget. */
  readonly schedule: (fn: () => void, delayMs: number) => void;
  /** Reveal a beat: apply its view (animation) and fire its sound. */
  readonly apply: (beat: Beat<View>) => void;
  /** A beat's execution time in ms — how long it blocks the next beat. */
  readonly duration: (event: HandEvent) => number;
}

export interface BeatQueue<View> {
  /** Enqueue a `hand-update` beat; it plays when the queue reaches it. */
  readonly push: (beat: Beat<View>) => void;
  /** Drop every pending beat and reset the clock (a snapshot supersedes them). */
  readonly clear: () => void;
}

/**
 * A backlog can never grow beyond this far ahead: a burst of sounded actions
 * (e.g. a rapid fold-out) collapses toward real time here rather than stacking
 * an ever-longer delay. Comfortably past the longest single beat.
 */
const MAX_LOOKAHEAD_MS = 2500;

export function createBeatQueue<View>(
  effects: BeatEffects<View>,
): BeatQueue<View> {
  const pending: Beat<View>[] = [];
  /** When the current beat finishes and the next may start (ms epoch). */
  let busyUntil = 0;
  /** A drain is already scheduled; don't stack a second timer. */
  let draining = false;

  function scheduleDrain(): void {
    draining = true;
    effects.schedule(
      () => {
        draining = false;
        drain();
      },
      Math.max(0, busyUntil - effects.now()),
    );
  }

  function drain(): void {
    while (pending.length > 0) {
      const now = effects.now();
      const start = Math.min(Math.max(now, busyUntil), now + MAX_LOOKAHEAD_MS);
      if (start > now) {
        scheduleDrain();
        return;
      }
      const beat = pending.shift();
      if (!beat) return;
      effects.apply(beat);
      busyUntil = start + effects.duration(beat.event);
    }
  }

  return {
    push(beat) {
      pending.push(beat);
      if (!draining) scheduleDrain();
    },
    clear() {
      pending.length = 0;
      busyUntil = 0;
    },
  };
}
