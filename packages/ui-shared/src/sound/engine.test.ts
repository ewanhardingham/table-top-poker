import type {
  Card,
  HandEvent,
  PlayerView,
  SoundSettings,
  TableView,
} from "@table-top-poker/protocol";
import { describe, expect, it, vi } from "vitest";
import type { CueName } from "./cues.js";
import {
  createSoundEngine,
  type PlaybackHandle,
  type SoundEngine,
  TIMINGS,
} from "./engine.js";

const ALL_ON: SoundSettings = {
  sounds: true,
  cards: true,
  actions: true,
  notifications: true,
};

const CARD: Card = { rank: "A", suit: "spades" };
const pair = (): [Card, Card] => [CARD, CARD];

function rig(settings: SoundSettings = ALL_ON): {
  engine: SoundEngine;
  played: CueName[];
  playbacks: PlaybackHandle[];
  scheduled: { fn: () => void; delayMs: number }[];
  setNow: (t: number) => void;
  flush: () => void;
} {
  const played: CueName[] = [];
  const playbacks: PlaybackHandle[] = [];
  const scheduled: { fn: () => void; delayMs: number }[] = [];
  let clock = 0;
  const engine = createSoundEngine(
    {
      play: (cue) => {
        if (typeof cue !== "string") throw new Error("unexpected buffer");
        played.push(cue);
        const playback = { stop: vi.fn() };
        playbacks.push(playback);
        return playback;
      },
      now: () => clock,
      schedule: (fn, delayMs) => scheduled.push({ fn, delayMs }),
    },
    settings,
  );
  return {
    engine,
    played,
    playbacks,
    scheduled,
    setNow: (t) => {
      clock = t;
    },
    flush: () => {
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

const cardBurned = (street: "flop" | "turn" | "river"): HandEvent => ({
  type: "CardBurned",
  street,
  card: null,
});

const actionTaken = (
  seatId: number,
  action: "fold" | "check" | "call" | "raise",
): HandEvent => ({ type: "ActionTaken", seatId, action });

const bettingView = (myTurn: boolean): PlayerView => ({
  phase: "betting",
  tabled: [],
  turnEndsAt: null,
  street: "preflop",
  board: [],
  toAct: myTurn ? [0] : [1],
  seats: [{ seatId: 0, folded: false, allIn: false }],
  yourSeatId: 0,
  yourHoleCards: pair(),
  legalActions: myTurn ? ["fold", "check"] : [],
  button: 0,
  smallBlind: 0,
  bigBlind: 1,
  dealtSeatCount: 2,
  burnedCount: 0,
});

const tableHoleCardsDealt = (): HandEvent => ({
  type: "HoleCardsDealt",
  deals: [],
});

const tableBettingView = (dealtSeatCount: number): TableView => ({
  phase: "betting",
  tabled: [],
  turnEndsAt: null,
  street: "preflop",
  board: [],
  toAct: [0],
  seats: Array.from({ length: dealtSeatCount }, (_, seatId) => ({
    seatId,
    folded: false,
    allIn: false,
  })),
  button: 0,
  smallBlind: 0,
  bigBlind: 1,
  dealtSeatCount,
  burnedCount: 0,
});

const noHandView: TableView = { phase: "no-hand", button: 0 };

describe("event → cue mapping", () => {
  it("stays silent on the table through the hole-card deal (revised #180)", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "table",
      event: tableHoleCardsDealt(),
      view: tableBettingView(3),
    });
    expect(r.scheduled).toEqual([]);
    r.flush();
    expect(r.played).toEqual([]);
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

  it("taps the board per card on the table, offset to the card-drop animation", () => {
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

  it("keeps the board lead-in synced to the card animation, not the check knock", () => {
    const r = rig();
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
    expect(r.scheduled.map((s) => s.delayMs)).toEqual([
      TIMINGS.boardLeadInMs,
      TIMINGS.boardLeadInMs + TIMINGS.boardStaggerMs,
      TIMINGS.boardLeadInMs + 2 * TIMINGS.boardStaggerMs,
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

  it("whooshes the burn on the table, ahead of the street's cards", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "table",
      event: cardBurned("flop"),
      view: noHandView,
    });
    expect(r.scheduled.map((s) => s.delayMs)).toEqual([0]);
    r.flush();
    expect(r.played).toEqual(["burn"]);
  });

  it("spaces the burns of an all-in run-out, which arrive in one batch", () => {
    const r = rig();
    for (const street of ["flop", "turn", "river"] as const) {
      r.engine.onHandUpdate({
        surface: "table",
        event: cardBurned(street),
        view: noHandView,
      });
    }
    expect(r.scheduled.map((s) => s.delayMs)).toEqual([
      0,
      TIMINGS.burnLengthMs,
      2 * TIMINGS.burnLengthMs,
    ]);
  });

  it("does not hold a fresh hand's burn behind the last hand's run-out", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "table",
      event: cardBurned("river"),
      view: noHandView,
    });
    r.engine.onHandUpdate({
      surface: "table",
      event: { type: "HandStarted", seed: "s", button: 0 },
      view: noHandView,
    });
    r.engine.onHandUpdate({
      surface: "table",
      event: cardBurned("flop"),
      view: noHandView,
    });
    expect(r.scheduled.map((s) => s.delayMs)).toEqual([0, 0]);
  });

  it("stays silent on the burn on the player surface, which has no board", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: cardBurned("turn"),
      view: noHandView,
    });
    r.flush();
    expect(r.played).toEqual([]);
  });

  it("mutes the burn with the rest of the card audio", () => {
    const r = rig({ ...ALL_ON, cards: false });
    r.engine.onHandUpdate({
      surface: "table",
      event: cardBurned("river"),
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
    const r = rig({
      sounds: false,
      cards: true,
      actions: true,
      notifications: true,
    });
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
    const r = rig({
      sounds: true,
      cards: false,
      actions: true,
      notifications: true,
    });
    r.engine.playRevealFlip();
    r.flush();
    expect(r.played).toEqual([]);

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

  it("silences action cues but not card cues when actions is off", () => {
    const r = rig({
      sounds: true,
      cards: true,
      actions: false,
      notifications: true,
    });
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 1,
      event: actionTaken(1, "fold"),
      view: noHandView,
    });
    r.flush();
    expect(r.played).toEqual([]);

    r.engine.playRevealFlip();
    r.flush();
    expect(r.played).toEqual(["flip"]);
  });

  it("silences the your-turn prompt when notifications is off", () => {
    const r = rig({
      sounds: true,
      cards: true,
      actions: true,
      notifications: false,
    });
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
      actions: true,
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

  it("returns the playback handle from the effect sink", () => {
    const r = rig();
    const playback = r.engine.playRevealFlip();

    expect(playback).toBe(r.playbacks[0]);
    playback.stop();
    expect(r.playbacks[0]?.stop).toHaveBeenCalledOnce();
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

  it("does not hold the prompt behind a check knock from the player who passed the turn", () => {
    const r = rig();
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: { type: "HandStarted", seed: "s", button: 0 },
      view: noHandView,
    });
    r.setNow(TIMINGS.turnAfterDealMs);
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: actionTaken(1, "check"),
      view: bettingView(true),
    });
    const turnPrompt = r.scheduled.at(-1);
    expect(turnPrompt?.delayMs).toBe(0);
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
    r.engine.onHandUpdate({
      surface: "player",
      seatId: 0,
      event: { type: "StreetStarted", street: "preflop", actor: 0 },
      view: bettingView(true),
    });
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

describe("muck", () => {
  it("reuses the fold cue, on the mucking player's own phone only", () => {
    const own = rig();
    own.engine.onHandUpdate({
      surface: "player",
      seatId: 1,
      event: { type: "HoleCardsMucked", seatId: 1 },
      view: noHandView,
    });
    expect(own.played).toEqual(["fold"]);

    const other = rig();
    other.engine.onHandUpdate({
      surface: "player",
      seatId: 2,
      event: { type: "HoleCardsMucked", seatId: 1 },
      view: noHandView,
    });
    expect(other.played).toEqual([]);
  });
});
