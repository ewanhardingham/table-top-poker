import type { PlayerView } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { legalActionsFromView } from "./legalActionsFromView.js";

describe("legalActionsFromView", () => {
  it("is empty before any hand has started", () => {
    const view: PlayerView = { phase: "no-hand", button: 0 };
    expect(legalActionsFromView(view)).toEqual([]);
  });

  it("is empty when there is no view yet", () => {
    expect(legalActionsFromView(null)).toEqual([]);
  });

  it("mirrors the view's legalActions during betting", () => {
    const view: PlayerView = {
      phase: "betting",
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "preflop",
      board: [],
      toAct: [0],
      seats: [{ seatId: 0, folded: false, allIn: false }],
      yourSeatId: 0,
      yourHoleCards: null,
      legalActions: ["fold", "check", "raise"],
    };
    expect(legalActionsFromView(view)).toEqual(["fold", "check", "raise"]);
  });
});
