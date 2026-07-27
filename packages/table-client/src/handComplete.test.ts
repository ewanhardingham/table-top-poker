import type { TableView } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { isHandComplete } from "./handComplete.js";

describe("isHandComplete", () => {
  it("is false before any hand has started", () => {
    const view: TableView = { phase: "no-hand", button: 0 };
    expect(isHandComplete(view)).toBe(false);
  });

  it("is false while a hand is being played", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      street: "preflop",
      board: [],
      toAct: [0],
      seats: [],
    };
    expect(isHandComplete(view)).toBe(false);
  });

  it("is false when no hand view exists yet", () => {
    expect(isHandComplete(null)).toBe(false);
  });

  it("is true on a fold-out completion", () => {
    const view: TableView = { phase: "folded-out", button: 0, winner: 1 };
    expect(isHandComplete(view)).toBe(true);
  });

  it("is true on a showdown completion", () => {
    const view: TableView = {
      phase: "showdown",
      button: 0,
      board: [],
      winners: [0],
      results: [],
    };
    expect(isHandComplete(view)).toBe(true);
  });
});
