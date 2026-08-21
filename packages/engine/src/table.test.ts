import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { legalActions } from "./table.js";
import { playAll } from "./test-utils.js";
import { must } from "./util.js";

describe("legalActions", () => {
  it("offers the facing-a-bet actions to a seat facing a bet preflop", () => {
    const state = createInitialState([0, 1, 2]);
    const started = playAll(state, [
      { type: "startHand", seatId: 0, seed: "s" },
    ]);
    if (started.hand?.status !== "betting") {
      throw new Error("expected betting");
    }
    expect(legalActions(started.hand, 1)).toEqual([
      "fold",
      "call",
      "raise",
      "allInCall",
      "allInRaise",
    ]);
  });

  it("offers the unopened actions to the big blind on an unraised preflop", () => {
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
    expect(legalActions(afterLap.hand, 2)).toEqual([
      "fold",
      "check",
      "raise",
      "allInRaise",
    ]);
  });

  it("withholds the all-in call where there is no bet to match", () => {
    const state = createInitialState([0, 1, 2]);
    const started = playAll(state, [
      { type: "startHand", seatId: 0, seed: "s" },
    ]);
    const afterLap = playAll(started, [
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
    ]);
    if (afterLap.hand?.status !== "betting") {
      throw new Error("expected betting");
    }
    expect(legalActions(afterLap.hand, 2)).not.toContain("allInCall");
  });

  it("withholds both raises once every other seat is all in", () => {
    const state = createInitialState([0, 1]);
    const started = playAll(state, [
      { type: "startHand", seatId: 0, seed: "s" },
    ]);
    if (started.hand?.status !== "betting") {
      throw new Error("expected betting");
    }
    const shover = must(started.hand.toAct[0]);
    const shoved = playAll(started, [{ type: "allInRaise", seatId: shover }]);
    if (shoved.hand?.status !== "betting") {
      throw new Error("expected betting");
    }
    const covering = must(shoved.hand.toAct[0]);

    expect(legalActions(shoved.hand, covering)).toEqual([
      "fold",
      "call",
      "allInCall",
    ]);
  });
});
