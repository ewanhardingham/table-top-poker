import type { PlayerView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hand } from "./Hand.js";

describe("Hand", () => {
  it("shows a waiting state before any hand has started", () => {
    const view: PlayerView = { phase: "no-hand", button: 0 };
    const html = renderToStaticMarkup(<Hand view={view} />);
    expect(html).toMatch(/data-testid="hand"[^>]*data-phase="no-hand"/);
  });

  it("reveals own hole cards and mirrors the shared board", () => {
    const view: PlayerView = {
      phase: "betting",
      button: 0,
      street: "flop",
      board: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "2", suit: "clubs" },
      ],
      toAct: [0],
      seats: [{ seatId: 0, folded: false }],
      yourSeatId: 0,
      yourHoleCards: [
        { rank: "Q", suit: "diamonds" },
        { rank: "J", suit: "clubs" },
      ],
      legalActions: ["fold", "check", "raise"],
    };
    const html = renderToStaticMarkup(<Hand view={view} />);

    expect(html).toMatch(/data-testid="hole-cards"/);
    expect(html).toContain('data-rank="Q"');
    expect(html).toContain('data-rank="J"');
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(5);
  });

  it("hides hole cards once folded, without a placeholder leak", () => {
    const view: PlayerView = {
      phase: "betting",
      button: 0,
      street: "flop",
      board: [],
      toAct: [1],
      seats: [
        { seatId: 0, folded: true },
        { seatId: 1, folded: false },
      ],
      yourSeatId: 0,
      yourHoleCards: null,
      legalActions: [],
    };
    const html = renderToStaticMarkup(<Hand view={view} />);

    expect(html).toMatch(/data-testid="no-hole-cards"/);
    expect(html).not.toContain("data-rank");
  });
});
