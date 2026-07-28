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

  it("reveals own hole cards but never the shared board mid-hand", () => {
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
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(2);
    expect(html).not.toContain('data-testid="community-cards"');
    expect(html).not.toContain('data-rank="A"');
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

  it("shows the empty state, not the folded copy, when sitting out of the current hand", () => {
    const view: PlayerView = {
      phase: "betting",
      button: 0,
      street: "flop",
      board: [],
      toAct: [1],
      seats: [{ seatId: 1, folded: false }],
      yourSeatId: 0,
      yourHoleCards: null,
      legalActions: [],
    };
    const html = renderToStaticMarkup(<Hand view={view} />);

    expect(html).toMatch(/data-testid="no-hole-cards"/);
    expect(html).toContain("Waiting for the next deal.");
    expect(html).not.toContain("muck");
  });

  it("shows the turn banner announcing it's your turn when you have a legal action", () => {
    const view: PlayerView = {
      phase: "betting",
      button: 0,
      street: "turn",
      board: [],
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

    expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="turn"/);
    expect(html).toContain("Your turn");
  });

  it("shows a connection-aware banner instead of the turn state while reconnecting", () => {
    const view: PlayerView = {
      phase: "betting",
      button: 0,
      street: "turn",
      board: [],
      toAct: [0],
      seats: [{ seatId: 0, folded: false }],
      yourSeatId: 0,
      yourHoleCards: [
        { rank: "Q", suit: "diamonds" },
        { rank: "J", suit: "clubs" },
      ],
      legalActions: ["fold", "check", "raise"],
    };
    const html = renderToStaticMarkup(
      <Hand view={view} connectionStatus="connecting" />,
    );

    expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="offline"/);
    expect(html).toContain("Reconnecting");
    expect(html).not.toContain("Your turn");
  });

  it("shows the board and the winning hand(s) below it at showdown", () => {
    const view: PlayerView = {
      phase: "showdown",
      button: 0,
      board: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "2", suit: "clubs" },
        { rank: "9", suit: "diamonds" },
        { rank: "4", suit: "spades" },
      ],
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
      ],
      winners: [0],
    };
    const html = renderToStaticMarkup(<Hand view={view} />);

    expect(html).toMatch(/data-testid="hand"[^>]*data-phase="showdown"/);
    expect(html).toContain('data-testid="community-cards"');
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(7);

    expect(html).toContain('data-testid="winning-hand-0"');
    expect(html).not.toContain('data-testid="winning-hand-1"');
    expect(html).toContain("Pair of Aces");
    expect(html).not.toContain("Pair of Kings");
  });
});
