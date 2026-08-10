import type { HandEvent } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { type Beat, createBeatQueue, tableBeatDuration } from "./beatQueue.js";
import { CUE_DURATIONS_MS, cueSettleMs } from "./cues.js";

// Beats carry a view in production; the queue never inspects it, so the tests
// use the event alone as the payload.
type TestBeat = Beat<null>;

const beat = (event: HandEvent): TestBeat => ({ event, view: null });

const check = (seatId: number): HandEvent => ({
  type: "ActionTaken",
  seatId,
  action: "check",
});
const call = (seatId: number): HandEvent => ({
  type: "ActionTaken",
  seatId,
  action: "call",
});
const board = (): HandEvent => ({
  type: "BoardDealt",
  street: "flop",
  cards: [],
});
const streetStarted = (): HandEvent => ({
  type: "StreetStarted",
  street: "flop",
  actor: 0,
});

/**
 * A test rig with a hand-cranked clock and a timer list, so a test can advance
 * time deterministically and see exactly when each beat was applied.
 */
function rig() {
  let clock = 0;
  const timers: { fn: () => void; at: number }[] = [];
  const applied: { event: HandEvent; at: number }[] = [];
  const queue = createBeatQueue<null>({
    now: () => clock,
    schedule: (fn, delayMs) => {
      timers.push({ fn, at: clock + Math.max(0, delayMs) });
    },
    apply: (b) => applied.push({ event: b.event, at: clock }),
    duration: tableBeatDuration,
  });
  return {
    queue,
    applied,
    /** Advance to `t`, firing every timer due by then in chronological order. */
    advanceTo(t: number) {
      for (;;) {
        const due = timers
          .filter((x) => x.at <= t)
          .sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        clock = due.at;
        due.fn();
      }
      clock = t;
    },
  };
}

const KNOCK = cueSettleMs("check");

describe("beat queue", () => {
  it("applies an idle beat immediately", () => {
    const r = rig();
    r.queue.push(beat(streetStarted()));
    r.advanceTo(0);
    expect(r.applied.map((a) => a.at)).toEqual([0]);
  });

  it("holds the board beat until the check knock has finished", () => {
    const r = rig();
    r.queue.push(beat(check(1)));
    r.queue.push(beat(board()));
    r.advanceTo(5000);
    expect(r.applied.map((a) => [a.event.type, a.at])).toEqual([
      ["ActionTaken", 0],
      ["BoardDealt", KNOCK],
    ]);
  });

  it("keeps beats behind a held board in arrival order", () => {
    const r = rig();
    r.queue.push(beat(check(1)));
    r.queue.push(beat(board()));
    r.queue.push(beat(streetStarted()));
    r.advanceTo(10000);
    expect(r.applied.map((a) => [a.event.type, a.at])).toEqual([
      ["ActionTaken", 0],
      ["BoardDealt", KNOCK],
      ["StreetStarted", KNOCK + CUE_DURATIONS_MS.board],
    ]);
  });

  it("does not block on a call (no cue yet)", () => {
    const r = rig();
    r.queue.push(beat(call(1)));
    r.queue.push(beat(board()));
    r.advanceTo(5000);
    expect(r.applied.map((a) => a.at)).toEqual([0, 0]);
  });

  it("drops pending beats when cleared (a snapshot supersedes them)", () => {
    const r = rig();
    r.queue.push(beat(check(1)));
    r.queue.push(beat(board()));
    r.advanceTo(0); // check applied; board deferred behind the knock
    r.queue.clear();
    r.advanceTo(5000);
    expect(r.applied.map((a) => a.event.type)).toEqual(["ActionTaken"]);
  });

  it("resets the clock after a clear so the next beat is immediate", () => {
    const r = rig();
    r.queue.push(beat(check(1)));
    r.advanceTo(0);
    r.queue.clear();
    r.queue.push(beat(board()));
    r.advanceTo(0);
    expect(r.applied.map((a) => [a.event.type, a.at])).toEqual([
      ["ActionTaken", 0],
      ["BoardDealt", 0],
    ]);
  });
});
