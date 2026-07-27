import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { legalActions } from "./table.js";
import { playAll } from "./test-utils.js";

describe("legalActions", () => {
  it("offers fold/call/raise to a seat facing a bet preflop", () => {
    const state = createInitialState([0, 1, 2]);
    const started = playAll(state, [
      { type: "startHand", playerId: 0, seed: "s" },
    ]);
    if (started.hand?.status !== "betting") {
      throw new Error("expected betting");
    }
    // ring (button 0) = [1, 2, 0]; seat 1 (SB) faces the BB's post.
    expect(legalActions(started.hand, 1)).toEqual(["fold", "call", "raise"]);
  });

  it("offers fold/check/raise to the big blind on an unraised preflop", () => {
    const state = createInitialState([0, 1, 2]);
    const started = playAll(state, [
      { type: "startHand", playerId: 0, seed: "s" },
    ]);
    if (started.hand?.status !== "betting") {
      throw new Error("expected betting");
    }
    // BB is seat 2 here — its own post already matches, so it may check.
    const afterLap = playAll(started, [
      { type: "call", playerId: 1 },
      { type: "check", playerId: 2 },
      { type: "call", playerId: 0 },
    ]);
    if (afterLap.hand?.status !== "betting") {
      throw new Error("expected betting");
    }
    expect(legalActions(afterLap.hand, 2)).toEqual(["fold", "check", "raise"]);
  });
});
