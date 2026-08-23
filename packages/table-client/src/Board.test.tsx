import type { Card, TableView } from "@table-top-poker/protocol";
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
      burnedCount: 0,
      street: "flop",
      board: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "2", suit: "clubs" },
      ],
      toAct: [1],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 1, folded: false, allIn: false },
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
      burnedCount: 0,
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
      turnEndsAt: null,
      queue: [],
      mucked: [],
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      contestants: [0, 1],
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
    expect(html).not.toContain('data-testid="hand-complete-banner"');
    expect(html).not.toContain("Pair of Aces");
    expect(html).toMatch(/data-testid="community-cards"/);
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(5);
  });

  it("piles one face-down card per burn, never revealing them", () => {
    const view: TableView = {
      phase: "betting",
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 2,
      street: "turn",
      board: [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "hearts" },
        { rank: "2", suit: "clubs" },
        { rank: "7", suit: "diamonds" },
      ],
      toAct: [1],
      seats: [{ seatId: 0, folded: false, allIn: false }],
    };
    const html = renderToStaticMarkup(<Board view={view} />);

    expect(html).toMatch(/data-testid="burn-pile"[^>]*data-burned="2"/);
    expect((html.match(/data-face-down="true"/g) ?? []).length).toBe(2);
  });

  it("keeps the pile beside the banner when the hand folds out", () => {
    const view: TableView = {
      phase: "folded-out",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 3,
      winner: 1,
    };
    const html = renderToStaticMarkup(<Board view={view} />);

    expect(html).toContain('data-testid="hand-complete-banner"');
    expect(html).toMatch(/data-testid="burn-pile"[^>]*data-burned="3"/);
    expect((html.match(/data-face-down="true"/g) ?? []).length).toBe(3);
  });

  it("shows an empty pile before the first burn", () => {
    const view: TableView = {
      phase: "betting",
      turnEndsAt: null,
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "preflop",
      board: [],
      toAct: [1],
      seats: [{ seatId: 0, folded: false, allIn: false }],
    };
    const html = renderToStaticMarkup(<Board view={view} />);

    expect(html).toMatch(/data-testid="burn-pile"[^>]*data-burned="0"/);
    expect(html).not.toContain('data-face-down="true"');
  });

  it("renders the same shape for betting and showdown on an unchanged board", () => {
    const board: readonly Card[] = [
      { rank: "A", suit: "spades" },
      { rank: "K", suit: "hearts" },
      { rank: "2", suit: "clubs" },
      { rank: "7", suit: "diamonds" },
      { rank: "9", suit: "clubs" },
    ];
    const betting: TableView = {
      phase: "betting",
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      street: "river",
      turnEndsAt: null,
      board,
      toAct: [1],
      seats: [
        { seatId: 0, folded: false, allIn: false },
        { seatId: 1, folded: false, allIn: false },
      ],
    };
    const showdown: TableView = {
      phase: "showdown",
      turnEndsAt: null,
      queue: [],
      mucked: [],
      button: 0,
      smallBlind: 1,
      bigBlind: 2,
      dealtSeatCount: 3,
      burnedCount: 0,
      board,
      contestants: [0, 1],
      winners: [0],
      results: [],
    };

    const stripPhase = (html: string) =>
      html
        .replace(/ data-phase="[^"]*"/, "")
        .replace(/ data-street="[^"]*"/, "");

    expect(stripPhase(renderToStaticMarkup(<Board view={showdown} />))).toBe(
      stripPhase(renderToStaticMarkup(<Board view={betting} />)),
    );
  });
});
