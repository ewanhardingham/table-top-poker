import type { SeatView, TableView } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Seats } from "./Seats.js";

const seats: SeatView[] = [
  { id: 0, claimed: true, sittingOut: false, disconnected: false },
  { id: 1, claimed: true, sittingOut: false, disconnected: false },
  { id: 2, claimed: true, sittingOut: true, disconnected: false },
  { id: 3, claimed: false, sittingOut: false, disconnected: false },
];

describe("Seats", () => {
  it("shows every seat as open or sitting-out before any hand exists", () => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={null} />);
    expect(html).toMatch(/data-testid="seat-pod-0"[^>]*data-status="in-hand"/);
    expect(html).toMatch(
      /data-testid="seat-pod-2"[^>]*data-status="sitting-out"/,
    );
    expect(html).toMatch(/data-testid="seat-pod-3"[^>]*data-status="open"/);
  });

  it("gives a sitting-out seat a quiet local treatment and neutral copy", () => {
    const html = renderToStaticMarkup(<Seats seats={seats} view={null} />);

    expect(html).toMatch(
      /data-testid="seat-pod-2-sitting-out"[^>]*>[\s\S]*Sitting out[\s\S]*Not in hand[\s\S]*<\/div>/,
    );
    expect(html).toContain('data-testid="seat-pod-2-sitting-out-marker"');
    expect(html).toMatch(
      /data-testid="seat-pod-2-avatar"[^>]*style="[^"]*border:1px dashed/,
    );
    expect(html).not.toContain('data-testid="seat-pod-0-sitting-out"');
  });

  it("shows a claimed seat absent from a live hand as sitting out", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      street: "flop",
      board: [],
      toAct: [0],
      seats: [
        { seatId: 0, folded: false },
        { seatId: 1, folded: false },
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(html).toMatch(
      /data-testid="seat-pod-2"[^>]*data-status="sitting-out"/,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-2-sitting-out"[^>]*>[\s\S]*Sitting out[\s\S]*Not in hand[\s\S]*<\/div>/,
    );
    expect(html).toContain('data-testid="seat-pod-2-sitting-out-marker"');
    expect(html).not.toContain('data-testid="seat-pod-0-sitting-out"');
  });

  it("marks the button seat once a hand exists, even with no active betting", () => {
    const view: TableView = { phase: "no-hand", button: 1 };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-button="true"/);
    expect(html).toMatch(/data-testid="seat-pod-0"[^>]*data-button="false"/);
  });

  it("marks status, button and the current actor during betting", () => {
    const view: TableView = {
      phase: "betting",
      button: 0,
      street: "flop",
      board: [],
      toAct: [1],
      seats: [
        { seatId: 0, folded: false },
        { seatId: 1, folded: false },
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(html).toMatch(
      /data-testid="seat-pod-0"[^>]*data-status="in-hand"[^>]*data-button="true"/,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-1"[^>]*data-status="in-hand"[^>]*data-turn="true"/,
    );
    expect(html).toContain('data-testid="seat-pod-1-to-act"');
    expect(html).not.toContain('data-testid="seat-pod-0-to-act"');
    expect(html).toMatch(
      /data-testid="seat-pod-2"[^>]*data-status="sitting-out"/,
    );
    expect(html).toMatch(/data-testid="seat-pod-3"[^>]*data-status="open"/);
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
      <Seats seats={seats.slice(0, 2)} view={view} />,
    );
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-status="folded"/);
  });

  it("shows a disconnected badge for a presence-dropped seat", () => {
    const disconnectedSeats: SeatView[] = [
      { id: 0, claimed: true, sittingOut: false, disconnected: false },
      { id: 1, claimed: true, sittingOut: false, disconnected: true },
    ];
    const html = renderToStaticMarkup(
      <Seats seats={disconnectedSeats} view={null} />,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-1"[^>]*data-disconnected="true"/,
    );
    expect(html).toContain('data-testid="seat-pod-1-disconnected"');
    expect(html).not.toContain('data-testid="seat-pod-0-disconnected"');
  });

  it("marks the winning seat at showdown and reveals its hole cards", () => {
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
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);
    expect(html).toMatch(/data-testid="seat-pod-0"[^>]*data-winner="true"/);
    expect(html).toContain('data-testid="seat-pod-0-hole-cards"');
    expect(html).not.toContain('data-testid="seat-pod-1-hole-cards"');
    // The hand description shows plainly — no "Winner —" prefix, since the
    // pod's own winner styling and the board's banner already say so.
    expect(html).toMatch(/data-testid="seat-pod-0-hand"[^>]*>Pair of Aces</);
    expect(html).not.toContain("Winner");
  });

  it("keeps a revealed player in-hand when they sit out for the next hand", () => {
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
      winners: [2],
      results: [
        {
          seatId: 2,
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
      ],
    };
    const html = renderToStaticMarkup(<Seats seats={seats} view={view} />);

    expect(html).toMatch(
      /data-testid="seat-pod-2"[^>]*data-status="in-hand"[^>]*data-winner="true"/,
    );
    expect(html).toContain('data-testid="seat-pod-2-hole-cards"');
    expect(html).not.toContain('data-testid="seat-pod-2-sitting-out"');
    expect(html).not.toContain('data-testid="seat-pod-2-sitting-out-marker"');
    expect(html).not.toMatch(
      /data-testid="seat-pod-2-avatar"[^>]*style="[^"]*border:1px dashed/,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-2-surface"[^>]*style="[^"]*opacity:1/,
    );
  });

  it("marks the sole winner at a fold-out completion, with no reveal", () => {
    const view: TableView = { phase: "folded-out", button: 0, winner: 1 };
    const sittingOutWinnerSeats = seats.map((seat) =>
      seat.id === 1 ? { ...seat, sittingOut: true } : seat,
    );
    const html = renderToStaticMarkup(
      <Seats seats={sittingOutWinnerSeats} view={view} />,
    );
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-winner="true"/);
    expect(html).toMatch(/data-testid="seat-pod-1"[^>]*data-status="in-hand"/);
    expect(html).toMatch(/data-testid="seat-pod-0"[^>]*data-winner="false"/);
    expect(html).not.toContain('data-testid="seat-pod-1-sitting-out"');
    expect(html).not.toContain('data-testid="seat-pod-1-sitting-out-marker"');
    expect(html).not.toContain("hole-cards");
  });

  it("marks only claimed seats as clickable when onSeatClick is provided (ADR-0003)", () => {
    const html = renderToStaticMarkup(
      <Seats seats={seats} view={null} onSeatClick={() => undefined} />,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-0"[^>]*style="[^"]*cursor:pointer/,
    );
    expect(html).toMatch(
      /data-testid="seat-pod-3"[^>]*style="(?:(?!cursor).)*"/,
    );
  });
});
