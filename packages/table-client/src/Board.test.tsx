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

  it("names the winner in a hand-complete banner after everyone else folds", () => {
    const view: TableView = { phase: "folded-out", button: 0, winner: 1 };
    const html = renderToStaticMarkup(<Board view={view} />);

    expect(html).toMatch(/data-testid="board"[^>]*data-phase="folded-out"/);
    expect(html).toContain('data-testid="hand-complete-banner"');
    expect(html).toContain("Seat 2 wins — everyone folded");
    expect(html).not.toContain('data-testid="community-cards"');
  });

  it("names the winner and their hand in a hand-complete banner at showdown, without duplicating any seat's hole cards", () => {
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
      winners: [0],
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
          rank: 2,
          description: "Ace high",
          holeCards: [
            { rank: "Q", suit: "diamonds" },
            { rank: "4", suit: "hearts" },
          ],
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "K", suit: "hearts" },
            { rank: "Q", suit: "diamonds" },
            { rank: "9", suit: "clubs" },
            { rank: "7", suit: "diamonds" },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(<Board view={view} />);

    expect(html).toMatch(/data-testid="board"[^>]*data-phase="showdown"/);
    expect(html).toContain('data-testid="hand-complete-banner"');
    expect(html).toContain("Seat 1 wins — Pair of Aces");
    expect(html).toMatch(/data-testid="community-cards"/);
    // Only the 5 board cards — no seat's hole cards duplicated in the board.
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(5);
  });

  it("names every winner on a split pot", () => {
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

    expect(html).toContain("Seat 1 &amp; Seat 2 split — Pair of Aces");
  });
});
