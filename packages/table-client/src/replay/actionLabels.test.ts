import type {
  Card,
  HandEvent,
  TableReplayPosition,
} from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { actionLabelsAt } from "./actionLabels.js";

const noHand = { phase: "no-hand", button: 0 } as const;

function positionsFor(
  events: readonly HandEvent[],
): readonly TableReplayPosition[] {
  return [
    { event: null, view: noHand },
    ...events.map((event) => ({ event, view: noHand })),
  ];
}

const card = (rank: Card["rank"]): Card => ({ rank, suit: "clubs" });

/** The engine's own cascade order: close, deal, start. */
function streetCascade(street: "flop" | "turn" | "river"): HandEvent[] {
  const previous = { flop: "preflop", turn: "flop", river: "turn" } as const;
  return [
    { type: "StreetClosed", street: previous[street] },
    { type: "BoardDealt", street, cards: [card("2")] },
    { type: "StreetStarted", street, actor: 1 },
  ];
}

const preflop: readonly HandEvent[] = [
  { type: "HandStarted", seed: "s", button: 0 },
  { type: "HoleCardsDealt", deals: [] },
  { type: "StreetStarted", street: "preflop", actor: 1 },
  { type: "ActionTaken", seatId: 1, action: "call" },
  { type: "ActionTaken", seatId: 2, action: "raise" },
  { type: "ActionTaken", seatId: 0, action: "fold" },
];

const intoTheFlop: readonly HandEvent[] = [
  ...preflop,
  ...streetCascade("flop"),
  { type: "ActionTaken", seatId: 1, action: "check" },
];

describe("actionLabelsAt", () => {
  it("has nothing to say before the first event", () => {
    expect(actionLabelsAt(positionsFor(preflop), 0).size).toBe(0);
  });

  it("labels every seat that has acted this street", () => {
    const labels = actionLabelsAt(positionsFor(preflop), preflop.length);

    expect(labels.get(1)).toBe("call");
    expect(labels.get(2)).toBe("raise");
    expect(labels.get(0)).toBe("fold");
  });

  it("labels only the seats that have acted by this position", () => {
    const labels = actionLabelsAt(positionsFor(preflop), 4);

    expect(labels.get(1)).toBe("call");
    expect(labels.has(2)).toBe(false);
  });

  it("carries a seat's latest action, not its first", () => {
    const reraised = positionsFor([
      ...preflop,
      { type: "ActionTaken", seatId: 1, action: "raise" },
    ]);

    expect(actionLabelsAt(reraised, preflop.length + 1).get(1)).toBe("raise");
  });

  it("clears every label once the next street's cards are out", () => {
    const positions = positionsFor(intoTheFlop);
    const boardDealt = preflop.length + 2;

    expect(actionLabelsAt(positions, boardDealt).size).toBe(0);
  });

  it("starts the new street's labels from the seats acting on it", () => {
    const labels = actionLabelsAt(
      positionsFor(intoTheFlop),
      intoTheFlop.length,
    );

    expect([...labels.entries()]).toEqual([[1, "check"]]);
  });

  it("clears every label once the hand reaches showdown", () => {
    const positions = positionsFor([
      ...preflop,
      { type: "ShowdownReached", contestants: [1, 2] },
    ]);

    expect(actionLabelsAt(positions, preflop.length + 1).size).toBe(0);
  });

  it("clears every label once the hand is folded out", () => {
    const positions = positionsFor([
      ...preflop,
      { type: "HandFoldedOut", winner: 2 },
    ]);

    expect(actionLabelsAt(positions, preflop.length + 1).size).toBe(0);
  });

  it("survives a position past the end of the hand", () => {
    const labels = actionLabelsAt(positionsFor(preflop), 99);

    expect(labels.get(1)).toBe("call");
  });
});
