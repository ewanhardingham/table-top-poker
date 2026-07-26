import type { SeatView, TableView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Board } from "./Board.js";

const seats: SeatView[] = [
  { id: 0, claimed: true, sittingOut: false },
  { id: 1, claimed: true, sittingOut: false },
  { id: 2, claimed: true, sittingOut: true },
  { id: 3, claimed: false, sittingOut: false },
];

describe("Board", () => {
  it("renders a waiting state before any hand has started", () => {
    const view: TableView = { phase: "no-hand", button: 0 };
    const html = renderToStaticMarkup(<Board view={view} seats={seats} />);
    expect(html).toMatch(/data-testid="board"[^>]*data-phase="no-hand"/);
  });

  it("renders community cards, seat status, button and current actor", () => {
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
    const html = renderToStaticMarkup(<Board view={view} seats={seats} />);

    expect(html).toMatch(/data-testid="community-cards"/);
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(3);
    expect(html).toMatch(
      /data-testid="board-seat-0"[^>]*data-status="in-hand"[^>]*data-button="true"/,
    );
    expect(html).toMatch(
      /data-testid="board-seat-1"[^>]*data-status="in-hand"[^>]*data-turn="true"/,
    );
    expect(html).toMatch(
      /data-testid="board-seat-2"[^>]*data-status="sitting-out"/,
    );
    expect(html).toMatch(/data-testid="board-seat-3"[^>]*data-status="open"/);
    expect(html).not.toContain("yourHoleCards");
  });

  it("marks a folded seat", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      street: "preflop",
      board: [],
      toAct: [0],
      seats: [
        { seatId: 0, folded: false },
        { seatId: 1, folded: true },
      ],
    };
    const html = renderToStaticMarkup(
      <Board view={view} seats={seats.slice(0, 2)} />,
    );
    expect(html).toMatch(/data-testid="board-seat-1"[^>]*data-status="folded"/);
  });

  it("renders a fold-out completion with no reveal", () => {
    const view: TableView = { phase: "folded-out", button: 0, winner: 1 };
    const html = renderToStaticMarkup(<Board view={view} seats={seats} />);
    expect(html).toMatch(/data-testid="board"[^>]*data-phase="folded-out"/);
    expect(html).not.toContain('data-testid="showdown-results"');
  });
});
