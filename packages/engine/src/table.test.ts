import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { legalActions } from "./table.js";
import { playAll } from "./test-utils.js";

describe("legalActions", () => {
  it("offers fold/call/raise to a seat facing a bet preflop", () => {
    const state = createInitialState([0, 1, 2]);
    const started = playAll(state, [
      { type: "startHand", seatId: 0, seed: "s" },
    ]);
    if (started.hand?.status !== "betting") {
      throw new Error("expected betting");
    }
    expect(legalActions(started.hand, 1)).toEqual(["fold", "call", "raise"]);
  });

  it("offers fold/check/raise to the big blind on an unraised preflop", () => {
    const state = createInitialState([0, 1, 2]);
    const started = playAll(state, [
      { type: "startHand", seatId: 0, seed: "s" },
    ]);
    if (started.hand?.status !== "betting") {
      throw new Error("expected betting");
    }
    const afterLap = playAll(started, [
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
    ]);
    if (afterLap.hand?.status !== "betting") {
      throw new Error("expected betting");
    }
    expect(legalActions(afterLap.hand, 2)).toEqual(["fold", "check", "raise"]);
  });
});
