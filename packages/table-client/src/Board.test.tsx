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
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
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
    const view: TableView = {
      phase: "folded-out",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      winner: 1,
    };
    const html = renderToStaticMarkup(
      <Board
        view={view}
        seats={[
          {
            id: 0,
            claimed: false,
            sittingOut: false,
            sittingOutReason: null,
            disconnected: false,
          },
          {
            id: 1,
            claimed: true,
            displayName: "Avery",
            sittingOut: false,
            sittingOutReason: null,
            disconnected: false,
          },
        ]}
      />,
    );

    expect(html).toMatch(/data-testid="board"[^>]*data-phase="folded-out"/);
    expect(html).toContain('data-testid="hand-complete-banner"');
    expect(html).toContain("Avery wins — everyone folded");
    expect(html).not.toContain('data-testid="community-cards"');
  });

  it("shows only the community cards at showdown, suppressing the banner the overlay now owns", () => {
    const view: TableView = {
      phase: "showdown",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
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
    // The overlay owns the result now, so the felt drops the banner entirely.
    expect(html).not.toContain('data-testid="hand-complete-banner"');
    expect(html).not.toContain("Pair of Aces");
    expect(html).toMatch(/data-testid="community-cards"/);
    // Only the 5 board cards — no seat's hole cards duplicated in the board.
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(5);
  });
});
