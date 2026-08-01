import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { decide } from "./decide.js";
import { createInitialState } from "./room.js";
import type { Command, EngineState, HandEvent } from "./types.js";

function playAndCollect(state: EngineState, commands: Command[]): HandEvent[] {
  const all: HandEvent[] = [];
  let current = state;
  for (const command of commands) {
    const result = decide(current, command);
    if (!Array.isArray(result)) {
      throw new Error(`unexpected rejection: ${result.reason}`);
    }
    all.push(...result);
    for (const event of result) {
      current = apply(current, event);
    }
  }
  return all;
}

// Both scenarios play a heads-up hand with no raises (call/check throughout)
// so the only thing that varies between seeds is the dealt cards.
const headsUpToRiver: Command[] = [
  { type: "call", seatId: 0 },
  { type: "check", seatId: 1 },
  { type: "check", seatId: 1 },
  { type: "check", seatId: 0 },
  { type: "check", seatId: 1 },
  { type: "check", seatId: 0 },
  { type: "check", seatId: 1 },
  { type: "check", seatId: 0 },
];

function showdownFor(
  seed: string,
): Extract<HandEvent, { type: "ShowdownReached" }> {
  const state = createInitialState([0, 1]);
  const events = playAndCollect(state, [
    { type: "startHand", seatId: 0, seed },
    ...headsUpToRiver,
  ]);
  const showdown = events.find((e) => e.type === "ShowdownReached");
  if (showdown?.type !== "ShowdownReached") {
    throw new Error("expected a ShowdownReached event");
  }
  return showdown;
}

describe("ShowdownReached, heads-up to river", () => {
  it("reports real ranks, best-five cards and descriptions for every live seat", () => {
    const showdown = showdownFor("s0");
    expect(showdown.results).toHaveLength(2);
    for (const result of showdown.results) {
      expect(result.bestHand).toHaveLength(5);
      expect(typeof result.rank).toBe("number");
      expect(result.description.length).toBeGreaterThan(0);
    }
  });

  it("reports exactly one winner for a constructed clear-winner scenario", () => {
    const showdown = showdownFor("s0");
    expect(showdown.winners).toHaveLength(1);
    const bestRank = Math.max(...showdown.results.map((r) => r.rank));
    const winner = showdown.results.find((r) => r.rank === bestRank);
    expect(showdown.winners).toEqual([winner?.seatId]);
  });

  it("reports both seats as winners for a constructed tie scenario", () => {
    const showdown = showdownFor("s36");
    expect(showdown.winners.sort()).toEqual([0, 1]);
    expect(showdown.results[0]?.rank).toBe(showdown.results[1]?.rank);
  });
});

describe("ShowdownReached omits folded seats", () => {
  it("never reveals a seat that folded, even though it was live earlier", () => {
    const state = createInitialState([0, 1, 2]);
    const events = playAndCollect(state, [
      { type: "startHand", seatId: 0, seed: "seed-1" },
      { type: "call", seatId: 1 },
      { type: "raise", seatId: 2 },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "fold", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 2 },
      { type: "raise", seatId: 0 },
      { type: "call", seatId: 2 },
    ]);
    const showdown = events.find((e) => e.type === "ShowdownReached");
    if (showdown?.type !== "ShowdownReached") {
      throw new Error("expected a ShowdownReached event");
    }
    expect(showdown.results.map((r) => r.seatId).sort()).toEqual([0, 2]);
    expect(showdown.results.some((r) => r.seatId === 1)).toBe(false);
  });
});
