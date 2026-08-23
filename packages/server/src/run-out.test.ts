import type { Card, HandEvent } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import type { DispatchStep } from "./rooms.js";
import { runOutBeats } from "./run-out.js";

const card: Card = { rank: "A", suit: "spades" };

function steps(...events: readonly HandEvent[]): readonly DispatchStep[] {
  return events.map((event) => ({
    event,
    state: {} as DispatchStep["state"],
  }));
}

function beatEvents(
  given: readonly DispatchStep[],
): readonly (readonly HandEvent["type"][])[] {
  return runOutBeats(given).map((beat) => beat.map((step) => step.event.type));
}

describe("runOutBeats", () => {
  it("keeps an ordinary street advance in one beat", () => {
    expect(
      beatEvents(
        steps(
          { type: "ActionTaken", seatId: 0, action: "call" },
          { type: "StreetClosed", street: "preflop" },
          { type: "CardBurned", street: "flop", card },
          { type: "BoardDealt", street: "flop", cards: [card] },
          { type: "StreetStarted", street: "flop", actor: 1 },
        ),
      ),
    ).toEqual([
      [
        "ActionTaken",
        "StreetClosed",
        "CardBurned",
        "BoardDealt",
        "StreetStarted",
      ],
    ]);
  });

  it("keeps a showdown that deals no board in one beat", () => {
    expect(
      beatEvents(
        steps(
          { type: "ActionTaken", seatId: 0, action: "check" },
          { type: "StreetClosed", street: "river" },
          { type: "ShowdownReached", contestants: [] },
          { type: "HandComplete" },
        ),
      ),
    ).toEqual([
      ["ActionTaken", "StreetClosed", "ShowdownReached", "HandComplete"],
    ]);
  });

  it("gives each run-out street and the showdown its own beat", () => {
    expect(
      beatEvents(
        steps(
          { type: "ActionTaken", seatId: 0, action: "allInCall" },
          { type: "StreetClosed", street: "preflop" },
          { type: "CardBurned", street: "flop", card },
          { type: "BoardDealt", street: "flop", cards: [card] },
          { type: "CardBurned", street: "turn", card },
          { type: "BoardDealt", street: "turn", cards: [card] },
          { type: "CardBurned", street: "river", card },
          { type: "BoardDealt", street: "river", cards: [card] },
          { type: "ShowdownReached", contestants: [] },
          { type: "HandComplete" },
        ),
      ),
    ).toEqual([
      ["ActionTaken", "StreetClosed"],
      ["CardBurned", "BoardDealt"],
      ["CardBurned", "BoardDealt"],
      ["CardBurned", "BoardDealt"],
      ["ShowdownReached", "HandComplete"],
    ]);
  });
});
