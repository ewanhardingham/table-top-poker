import type {
  Card,
  HandEvent,
  PlayerView,
  SoundSettings,
  TableView,
} from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import type { CueName } from "./cues.js";
import { createSoundEngine, type SoundEngine, TIMINGS } from "./engine.js";

const ALL_ON: SoundSettings = {
  sounds: true,
  cards: true,
  notifications: true,
};

const CARD: Card = { rank: "A", suit: "spades" };
const pair = (): [Card, Card] => [CARD, CARD];

/**
 * A test rig over a sound engine with fully deterministic effects: a `play`
 * spy, a hand-cranked clock and a scheduler that records callbacks so a test
 * can inspect the fired delays and flush the timers when it chooses.
 */
function rig(settings: SoundSettings = ALL_ON): {
  engine: SoundEngine;
  played: CueName[];
  scheduled: { fn: () => void; delayMs: number }[];
  setNow: (t: number) => void;
  flush: () => void;
} {
  const played: CueName[] = [];
  const scheduled: { fn: () => void; delayMs: number }[] = [];
  let clock = 0;
  const engine = createSoundEngine(
    {
      play: (cue) => played.push(cue),
      now: () => clock,
      schedule: (fn, delayMs) => scheduled.push({ fn, delayMs }),
    },
    settings,
  );
  return {
    engine,
    played,
    scheduled,
    setNow: (t) => {
      clock = t;
    },
    flush: () => {
      // Run in scheduled order; drain so re-flush is a no-op.
      const pending = scheduled.splice(0);
      for (const { fn } of pending) fn();
    },
  };
}

const holeCardsDealt = (seatIds: number[]): HandEvent => ({
  type: "HoleCardsDealt",
  deals: seatIds.map((seatId) => ({ seatId, cards: pair() })),
});

const boardDealt = (
  street: "flop" | "turn" | "river",
  n: number,
): HandEvent => ({
  type: "BoardDealt",
  street,
  cards: Array.from({ length: n }, () => CARD),
});

const actionTaken = (
  seatId: number,
  action: "fold" | "check" | "call" | "raise",
): HandEvent => ({ type: "ActionTaken", seatId, action });

/** A player betting view whose turn state is `myTurn`. */
const bettingView = (myTurn: boolean): PlayerView => ({
  phase: "betting",
  street: "preflop",
  board: [],
  toAct: myTurn ? [0] : [1],
  seats: [{ seatId: 0, folded: false }],
  yourSeatId: 0,
  yourHoleCards: pair(),
  legalActions: myTurn ? ["fold", "check"] : [],
  button: 0,
  smallBlind: 0,
  bigBlind: 1,
  dealtSeatCount: 2,
});

const noHandView: TableView = { phase: "no-hand", button: 0 };

describe("event → cue mapping", () => {
  it("sweeps one deal cue per dealt card on the table, spaced by the deal gap", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "table",
      event: holeCardsDealt([0, 1, 2]),
      view: noHandView,
    });
    expect(r.scheduled.map((s) => s.delayMs)).toEqual([
      0,
      TIMINGS.dealStaggerMs,
      2 * TIMINGS.dealStaggerMs,
      3 * TIMINGS.dealStaggerMs,
      4 * TIMINGS.dealStaggerMs,
      5 * TIMINGS.dealStaggerMs,
    ]);
    r.flush();
    expect(r.played).toEqual(["deal", "deal", "deal", "deal", "deal", "deal"]);
  });

  it("plays only the phone's own two hole cards, not the whole table's", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 1,
      event: holeCardsDealt([0, 1, 2]),
      view: noHandView,
    });
    r.flush();
    expect(r.played).toEqual(["deal", "deal"]);
  });

  it("taps the board per card on the table, led in past the closing action", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "table",
      event: boardDealt("flop", 3),
      view: noHandView,
    });
    expect(r.scheduled.map((s) => s.delayMs)).toEqual([
      TIMINGS.boardLeadInMs,
      TIMINGS.boardLeadInMs + TIMINGS.boardStaggerMs,
      TIMINGS.boardLeadInMs + 2 * TIMINGS.boardStaggerMs,
    ]);
    r.flush();
    expect(r.played).toEqual(["board", "board", "board"]);
  });

  it("holds the board past a check knock that closed the street", () => {
    const r = rig();
    // The check that closes the street arrives just before the board deal.
    r.engine.onHandUpdate({
      surface: "table",
      event: actionTaken(1, "check"),
      view: noHandView,
    });
    r.engine.onHandUpdate({
      surface: "table",
      event: boardDealt("flop", 3),
      view: noHandView,
    });
    // The lead-in stretches to the knock's settle, not the plain 600ms.
    expect(r.scheduled.map((s) => s.delayMs)).toEqual([
      TIMINGS.checkKnockSettleMs,
      TIMINGS.checkKnockSettleMs + TIMINGS.boardStaggerMs,
      TIMINGS.checkKnockSettleMs + 2 * TIMINGS.boardStaggerMs,
    ]);
  });

  it("stays silent on the board on the player surface", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: boardDealt("turn", 1),
      view: noHandView,
    });
    r.flush();
    expect(r.played).toEqual([]);
  });

  it("voices fold and check only on the acting player's own phone", () => {
    const own = rig();
    own.engine.onHandUpdate({
      surface: "player",
      seatId: 1,
      event: actionTaken(1, "fold"),
      view: noHandView,
    });
    own.engine.onHandUpdate({
      surface: "player",
      seatId: 1,
      event: actionTaken(1, "check"),
      view: noHandView,
    });
    expect(own.played).toEqual(["fold", "check"]);
  });

  it("stays silent on another seat's action and on the table surface", () => {
    const other = rig();
    other.engine.onHandUpdate({
      surface: "player",
      seatId: 2,
      event: actionTaken(1, "fold"),
      view: noHandView,
    });
    const table = rig();
    table.engine.onHandUpdate({
      surface: "table",
      event: actionTaken(1, "fold"),
      view: noHandView,
    });
    expect(other.played).toEqual([]);
    expect(table.played).toEqual([]);
  });

  it("leaves call and raise unallocated", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 1,
      event: actionTaken(1, "call"),
      view: noHandView,
    });
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 1,
      event: actionTaken(1, "raise"),
      view: noHandView,
    });
    expect(r.played).toEqual([]);
  });
});

describe("room-settings gate", () => {
  it("silences everything when the master switch is off", () => {
    const r = rig({ sounds: false, cards: true, notifications: true });
    r.engine.onHandUpdate({
      surface: "table",
      event: holeCardsDealt([0]),
      view: noHandView,
    });
    r.engine.playRevealFlip();
    r.flush();
    expect(r.played).toEqual([]);
  });

  it("silences card cues but not notifications when cards is off", () => {
    const r = rig({ sounds: true, cards: false, notifications: true });
    r.engine.playRevealFlip();
    r.flush();
    expect(r.played).toEqual([]);

    // A your-turn prompt (notifications) still passes.
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: { type: "HandStarted", seed: "s", button: 0 },
      view: noHandView,
    });
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: boardDealt("flop", 3),
      view: bettingView(true),
    });
    r.flush();
    expect(r.played).toEqual(["yourTurn"]);
  });

  it("silences the your-turn prompt when notifications is off", () => {
    const r = rig({ sounds: true, cards: true, notifications: false });
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: boardDealt("flop", 3),
      view: bettingView(true),
    });
    r.flush();
    expect(r.played).toEqual([]);
  });

  it("applies a live room-settings change to the gate", () => {
    const r = rig(ALL_ON);
    r.engine.applyRoomSoundSettings({
      sounds: true,
      cards: false,
      notifications: true,
    });
    r.engine.playRevealFlip();
    r.flush();
    expect(r.played).toEqual([]);
  });
});

describe("reveal/conceal flip", () => {
  it("plays the flip cue when cards are allowed", () => {
    const r = rig();
    r.engine.playRevealFlip();
    r.flush();
    expect(r.played).toEqual(["flip"]);
  });
});

describe("your-turn prompt", () => {
  it("defers the prompt a beat past the last hole card, then fires it", () => {
    const r = rig();
    r.setNow(0);
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: holeCardsDealt([0, 1]),
      view: noHandView,
    });
    // Two hole cards → last lands at (2-1)*dealStagger.
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: { type: "StreetStarted", street: "preflop", actor: 0 },
      view: bettingView(true),
    });
    const turnPrompt = r.scheduled.at(-1);
    expect(turnPrompt?.delayMs).toBe(
      TIMINGS.dealStaggerMs + TIMINGS.turnAfterDealMs,
    );
    r.flush();
    expect(r.played).toContain("yourTurn");
  });

  it("holds the prompt past a check knock from the player who passed the turn", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: { type: "HandStarted", seed: "s", button: 0 },
      view: noHandView,
    });
    // Seat 1 checks mid-hand and the turn passes to me in the same update.
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: actionTaken(1, "check"),
      view: bettingView(true),
    });
    const turnPrompt = r.scheduled.at(-1);
    expect(turnPrompt?.delayMs).toBe(TIMINGS.checkKnockSettleMs);
    r.flush();
    expect(r.played).toContain("yourTurn");
  });

  it("cancels the deferred prompt if the turn passes before it fires", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: { type: "HandStarted", seed: "s", button: 0 },
      view: noHandView,
    });
    // Turn arrives — the prompt is scheduled.
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: { type: "StreetStarted", street: "preflop", actor: 0 },
      view: bettingView(true),
    });
    // Turn passes (I acted) before the deferral elapses — bumps the token.
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: actionTaken(0, "check"),
      view: bettingView(false),
    });
    r.flush();
    expect(r.played).not.toContain("yourTurn");
  });

  it("fires the prompt once per arrival, not on every view", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: { type: "HandStarted", seed: "s", button: 0 },
      view: noHandView,
    });
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: { type: "StreetStarted", street: "preflop", actor: 0 },
      view: bettingView(true),
    });
    // A second identical betting view (e.g. an opponent reconnecting) must not
    // re-arm the prompt.
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: { type: "ActionTaken", seatId: 1, action: "call" },
      view: bettingView(true),
    });
    r.flush();
    expect(r.played.filter((c) => c === "yourTurn")).toEqual(["yourTurn"]);
  });
});
