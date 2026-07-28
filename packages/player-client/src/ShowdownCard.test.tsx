import type { PlayerView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShowdownCard } from "./ShowdownCard.js";

type ShowdownOrFoldedOutView = Extract<
  PlayerView,
  { phase: "showdown" | "folded-out" }
>;

describe("ShowdownCard", () => {
  it("frames a showdown win for the viewing player", () => {
    const view: ShowdownOrFoldedOutView = {
      phase: "showdown",
      button: 0,
      board: [],
      winners: [0],
      results: [
        {
          seatId: 0,
          rank: 1,
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "A", suit: "diamonds" },
            { rank: "K", suit: "hearts" },
            { rank: "9", suit: "diamonds" },
            { rank: "4", suit: "spades" },
          ],
          description: "Pair of Aces",
          holeCards: [
            { rank: "A", suit: "diamonds" },
            { rank: "7", suit: "clubs" },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(<ShowdownCard seatId={0} view={view} />);

    expect(html).toContain('data-testid="showdown-card"');
    expect(html).toContain("You — Pair of Aces");
    expect(html).toContain("You had Pair of Aces");
  });

  it("frames a showdown loss for the viewing player", () => {
    const view: ShowdownOrFoldedOutView = {
      phase: "showdown",
      button: 0,
      board: [],
      winners: [1],
      results: [
        {
          seatId: 0,
          rank: 2,
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "K", suit: "hearts" },
            { rank: "K", suit: "clubs" },
            { rank: "9", suit: "diamonds" },
            { rank: "4", suit: "spades" },
          ],
          description: "Pair of Kings",
          holeCards: [
            { rank: "K", suit: "clubs" },
            { rank: "3", suit: "hearts" },
          ],
        },
        {
          seatId: 1,
          rank: 1,
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "A", suit: "diamonds" },
            { rank: "K", suit: "hearts" },
            { rank: "9", suit: "diamonds" },
            { rank: "4", suit: "spades" },
          ],
          description: "Pair of Aces",
          holeCards: [
            { rank: "A", suit: "diamonds" },
            { rank: "7", suit: "clubs" },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(<ShowdownCard seatId={0} view={view} />);

    expect(html).toContain("Seat 2 — Pair of Aces");
    expect(html).toContain("You had Pair of Kings");
  });

  it("joins a split pot's winners and reads a fold message for a seat that didn't reach showdown", () => {
    const view: ShowdownOrFoldedOutView = {
      phase: "showdown",
      button: 0,
      board: [],
      winners: [0, 1],
      results: [
        {
          seatId: 0,
          rank: 1,
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "A", suit: "diamonds" },
            { rank: "K", suit: "hearts" },
            { rank: "9", suit: "diamonds" },
            { rank: "4", suit: "spades" },
          ],
          description: "Pair of Aces",
          holeCards: [
            { rank: "A", suit: "diamonds" },
            { rank: "7", suit: "clubs" },
          ],
        },
        {
          seatId: 1,
          rank: 1,
          bestHand: [
            { rank: "A", suit: "spades" },
            { rank: "A", suit: "hearts" },
            { rank: "K", suit: "hearts" },
            { rank: "9", suit: "diamonds" },
            { rank: "4", suit: "spades" },
          ],
          description: "Pair of Aces",
          holeCards: [
            { rank: "A", suit: "hearts" },
            { rank: "6", suit: "clubs" },
          ],
        },
      ],
    };
    const html = renderToStaticMarkup(<ShowdownCard seatId={2} view={view} />);

    expect(html).toContain("Seat 1 &amp; Seat 2 — Pair of Aces");
    expect(html).toContain("You folded earlier in the hand.");
  });

  it("frames a folded-out win for the viewing player", () => {
    const view: ShowdownOrFoldedOutView = {
      phase: "folded-out",
      button: 0,
      winner: 0,
    };
    const html = renderToStaticMarkup(<ShowdownCard seatId={0} view={view} />);

    expect(html).toContain("You win — everyone else folded");
    expect(html).toContain("Everyone else folded.");
  });

  it("frames a folded-out loss for the viewing player", () => {
    const view: ShowdownOrFoldedOutView = {
      phase: "folded-out",
      button: 0,
      winner: 1,
    };
    const html = renderToStaticMarkup(<ShowdownCard seatId={0} view={view} />);

    expect(html).toContain("Seat 2 wins — everyone folded");
    expect(html).toContain("You folded earlier in the hand.");
  });
});
