import type { TableView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Board } from "./Board.js";

describe("Board", () => {
  it("renders a waiting state before any hand has started", () => {
    const view: TableView = { phase: "no-hand", button: 0 };
    const html = renderToStaticMarkup(<Board view={view} />);
    expect(html).toMatch(/data-testid="board"[^>]*data-phase="no-hand"/);
  });

  it("renders the community cards for a live betting street", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      street: "flop",
      board: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "2", suit: "clubs" },
      ],
      toAct: [1],
      seats: [
        { seatId: 0, folded: false },
        { seatId: 1, folded: false },
      ],
    };
    const html = renderToStaticMarkup(<Board view={view} />);

    expect(html).toMatch(/data-testid="board"[^>]*data-phase="betting"/);
    expect(html).toMatch(/data-testid="community-cards"/);
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(3);
  });

  it("renders a fold-out completion with no reveal", () => {
    const view: TableView = { phase: "folded-out", button: 0, winner: 1 };
    const html = renderToStaticMarkup(<Board view={view} />);
    expect(html).toMatch(/data-testid="board"[^>]*data-phase="folded-out"/);
    expect(html).not.toContain('data-testid="showdown-results"');
  });

  it("renders every live seat's rank and best five cards at showdown, split-aware", () => {
    const view: TableView = {
      phase: "showdown",
      button: 0,
      board: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "2", suit: "clubs" },
        { rank: "7", suit: "diamonds" },
        { rank: "9", suit: "clubs" },
      ],
      winners: [0, 1],
      results: [
        {
          seatId: 0,
          rank: 1,
          description: "Pair of Aces",
          holeCards: [
            { rank: "A", suit: "clubs" },
            { rank: "3", suit: "hearts" },
          ],
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "A", suit: "clubs" },
            { rank: "K", suit: "hearts" },
            { rank: "9", suit: "clubs" },
            { rank: "7", suit: "diamonds" },
          ],
        },
        {
          seatId: 1,
          rank: 1,
          description: "Pair of Aces",
          holeCards: [
            { rank: "A", suit: "diamonds" },
            { rank: "4", suit: "hearts" },
          ],
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "A", suit: "diamonds" },
            { rank: "K", suit: "hearts" },
            { rank: "9", suit: "clubs" },
            { rank: "7", suit: "diamonds" },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(<Board view={view} />);

    expect(html).toMatch(/data-testid="board"[^>]*data-phase="showdown"/);
    expect(html).toContain('data-testid="winners"');
    expect(html).toContain("Winners: seats 1, 2");
    expect(html).toMatch(/data-testid="result-0"[^>]*>Seat 1: Pair of Aces/);
    expect(html).toMatch(/data-testid="result-1"[^>]*>Seat 2: Pair of Aces/);
    expect((html.match(/data-testid="best-hand-0"/g) ?? []).length).toBe(1);
    expect((html.match(/data-testid="best-hand-1"/g) ?? []).length).toBe(1);
    // Each best-hand block shows the full five-card hand, not just the two hole cards.
    const result0 =
      /data-testid="result-0"[\s\S]*?<\/li>/.exec(html)?.[0] ?? "";
    expect((result0.match(/data-face-down="false"/g) ?? []).length).toBe(5);
  });
});
