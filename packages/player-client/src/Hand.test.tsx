import type { PlayerView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hand } from "./Hand.js";

describe("Hand", () => {
  it("shows a waiting state before any hand has started", () => {
    const view: PlayerView = { phase: "no-hand", button: 0 };
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);
    expect(html).toMatch(/data-testid="hand"[^>]*data-phase="no-hand"/);
  });

  it("uses the named seat in waiting copy", () => {
    const view: PlayerView = {
      phase: "betting",
      button: 0,
      street: "flop",
      board: [],
      toAct: [1],
      seats: [{ seatId: 0, folded: false }],
      yourSeatId: 0,
      yourHoleCards: [
        { rank: "Q", suit: "diamonds" },
        { rank: "J", suit: "clubs" },
      ],
      legalActions: [],
    };
    const html = renderToStaticMarkup(
      <Hand
        view={view}
        seatId={0}
        seats={[
          {
            id: 0,
            claimed: true,
            displayName: "Blair",
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

    expect(html).toContain("Waiting on Avery");
  });

  it("deals own hole cards in face-down, and never shows the shared board mid-hand", () => {
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
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

    // Cards arrive face-down and stay that way until the player asks for
    // them (Phase 3 spec #138): nothing is exposed on deal, so the hand isn't
    // in the document at all — not merely hidden by a style.
    expect(html).toMatch(/data-testid="hole-cards"/);
    expect(html).toContain('data-presentation="FaceDown"');
    expect((html.match(/data-face-down="true"/g) ?? []).length).toBe(2);
    expect(html).not.toContain("data-rank");
    expect(html).not.toContain('data-testid="community-cards"');
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
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

    expect(html).toMatch(/data-testid="no-hole-cards"/);
    expect(html).not.toMatch(/data-testid="hole-cards"/);
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
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

    expect(html).toMatch(/data-testid="no-hole-cards"/);
    expect(html).not.toMatch(/data-testid="hole-cards"/);
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
    const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

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
      <Hand view={view} seatId={0} connectionStatus="connecting" />,
    );

    expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="offline"/);
    expect(html).toContain("Reconnecting");
    expect(html).not.toContain("Your turn");
  });

  describe("showdown", () => {
    const showdownView: PlayerView = {
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

    it("shows the winner's own hole cards and a win banner, never an opponent's cards", () => {
      const html = renderToStaticMarkup(
        <Hand view={showdownView} seatId={0} />,
      );

      expect(html).toMatch(/data-testid="hand"[^>]*data-phase="showdown"/);
      expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="win"/);
      expect(html).toContain("You win with Pair of Aces");
      expect(html).toMatch(/data-testid="hole-cards"/);
      expect(html).toContain('data-rank="A"');
      expect(html).not.toContain('data-rank="K"');
      expect(html).not.toContain("Pair of Kings");
    });

    it("hands the pair to showdown locked, so it renders revealed and inert", () => {
      // `HoleCardPair.test.tsx` owns what locked *looks* like; the fact worth
      // asserting here is that showdown is where the lock comes from.
      const html = renderToStaticMarkup(
        <Hand view={showdownView} seatId={0} />,
      );

      expect(html).toContain('data-presentation="Revealed"');
      expect(html).toContain('aria-disabled="true"');
    });

    it("shows the loser's own hole cards and a loss banner naming the winner", () => {
      const html = renderToStaticMarkup(
        <Hand view={showdownView} seatId={1} />,
      );

      expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="loss"/);
      expect(html).toContain(
        "Seat 1 wins with Pair of Aces — you had Pair of Kings",
      );
      expect(html).toContain('data-rank="K"');
      expect(html).not.toContain('data-rank="A"');
    });

    it("reads a fold message and shows no hole cards for a seat that folded before showdown", () => {
      const html = renderToStaticMarkup(
        <Hand view={showdownView} seatId={2} />,
      );

      expect(html).toMatch(/data-testid="no-hole-cards"/);
      expect(html).not.toMatch(/data-testid="hole-cards"/);
      expect(html).toContain("you folded earlier");
      expect(html).toContain("You folded — cards are in the muck.");
    });
  });

  describe("folded-out", () => {
    it("shows a win banner and no hole cards when everyone else folded", () => {
      const view: PlayerView = { phase: "folded-out", button: 0, winner: 0 };
      const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

      expect(html).toMatch(/data-testid="hand"[^>]*data-phase="folded-out"/);
      expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="win"/);
      expect(html).toContain("You win — everyone folded");
      expect(html).toMatch(/data-testid="no-hole-cards"/);
      expect(html).not.toMatch(/data-testid="hole-cards"/);
    });

    it("shows a loss banner naming the winner when this seat folded", () => {
      const view: PlayerView = { phase: "folded-out", button: 0, winner: 1 };
      const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

      expect(html).toMatch(/data-testid="turn-banner"[^>]*data-tone="loss"/);
      expect(html).toContain("Seat 2 wins — everyone folded");
      expect(html).toContain("You folded — cards are in the muck.");
    });

    it("never reveals a pair for a seat that folded out — folding is final", () => {
      const view: PlayerView = { phase: "folded-out", button: 0, winner: 1 };
      const html = renderToStaticMarkup(<Hand view={view} seatId={0} />);

      expect(html).not.toMatch(/data-testid="hole-cards"/);
      expect(html).not.toContain("data-rank");
      expect(html).not.toContain("data-presentation");
    });
  });
});
