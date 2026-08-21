import type { Card, HandEvent, SeatView } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { captionFor } from "./caption.js";

const seats: readonly SeatView[] = [0, 1, 2].map((id) => ({
  id,
  claimed: true,
  sittingOut: false,
  sittingOutReason: null,
  disconnected: false,
}));

const named: readonly SeatView[] = seats.map((seat) =>
  seat.id === 1 ? { ...seat, displayName: "Ada" } : seat,
);

const card = (rank: Card["rank"]): Card => ({ rank, suit: "clubs" });

const winnersDeclared = (winners: number[]): HandEvent => ({
  type: "WinnersDeclared",
  winners,
});

const holeCardsShown = (seatId: number): HandEvent => ({
  type: "HoleCardsShown",
  result: {
    seatId,
    holeCards: [card("2"), card("3")],
    rank: 1,
    bestHand: [card("2"), card("3"), card("4"), card("5"), card("6")],
    description: "a straight",
  },
});

describe("captionFor", () => {
  it("says nothing at the position before the first event", () => {
    expect(captionFor(null, seats)).toBeNull();
  });

  it("names the seat and what it did", () => {
    expect(
      captionFor({ type: "ActionTaken", seatId: 2, action: "raise" }, seats),
    ).toBe("Seat 3 raised");
    expect(
      captionFor({ type: "ActionTaken", seatId: 0, action: "check" }, seats),
    ).toBe("Seat 1 checked");
  });

  it("prefers a seat's display name", () => {
    expect(
      captionFor({ type: "ActionTaken", seatId: 1, action: "call" }, named),
    ).toBe("Ada called");
  });

  it("names the board that just landed", () => {
    expect(
      captionFor(
        { type: "BoardDealt", street: "turn", cards: [card("9")] },
        seats,
      ),
    ).toBe("The turn");
  });

  it("names the street whose betting just opened", () => {
    expect(
      captionFor({ type: "StreetStarted", street: "flop", actor: 1 }, seats),
    ).toBe("Flop betting");
  });

  it("names the winner of a hand nobody contested", () => {
    expect(captionFor({ type: "HandFoldedOut", winner: 1 }, named)).toBe(
      "Ada wins, everyone else folded",
    );
  });

  it("names the seat turning its hand over and what it holds", () => {
    expect(captionFor(holeCardsShown(1), named)).toBe("Ada shows a straight");
  });

  it("names a showdown's winner", () => {
    expect(captionFor(winnersDeclared([1]), named)).toBe("Ada wins");
  });

  it("names both halves of a split pot", () => {
    expect(captionFor(winnersDeclared([0, 1]), named)).toBe(
      "Seat 1 and Ada split",
    );
  });

  it("has a caption for every beat the scrub can land on", () => {
    const everyEvent: readonly HandEvent[] = [
      { type: "HandStarted", seed: "s", button: 0 },
      { type: "HoleCardsDealt", deals: [] },
      { type: "StreetStarted", street: "preflop", actor: 1 },
      { type: "ActionTaken", seatId: 1, action: "fold" },
      { type: "StreetClosed", street: "preflop" },
      { type: "BoardDealt", street: "flop", cards: [card("2")] },
      { type: "HandFoldedOut", winner: 1 },
      { type: "ShowdownReached", contestants: [0, 1] },
      holeCardsShown(1),
      winnersDeclared([1]),
      { type: "HandComplete" },
    ];

    for (const event of everyEvent) {
      expect(captionFor(event, seats)).not.toBe("");
      expect(captionFor(event, seats)).not.toBeNull();
    }
  });

  it("never shows an Event ordinal", () => {
    const captions = [
      captionFor({ type: "HandStarted", seed: "s", button: 0 }, seats),
      captionFor({ type: "HandComplete" }, seats),
      captionFor({ type: "StreetClosed", street: "river" }, seats),
    ];

    for (const caption of captions) {
      expect(caption).not.toMatch(/\d+\s*\/\s*\d+/);
    }
  });
});
