import type { Card, HandEvent } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { redactEventFor } from "./redact-event.js";

const card = (rank: Card["rank"]): Card => ({ rank, suit: "spades" });

const burned: HandEvent = {
  type: "CardBurned",
  street: "flop",
  card: card("A"),
};

const dealt: HandEvent = {
  type: "HoleCardsDealt",
  deals: [
    { seatId: 0, cards: [card("2"), card("3")] },
    { seatId: 1, cards: [card("4"), card("5")] },
  ],
};

describe("redactEventFor", () => {
  it("strips a burnt card's identity for the table", () => {
    expect(redactEventFor(burned, "table")).toEqual({
      type: "CardBurned",
      street: "flop",
      card: null,
    });
  });

  it("strips it for a seated player too — nobody may read the deck", () => {
    expect(redactEventFor(burned, 0)).toMatchObject({ card: null });
  });

  it("still hands each seat only its own hole cards", () => {
    expect(redactEventFor(dealt, 1)).toMatchObject({ deals: [{ seatId: 1 }] });
    expect(redactEventFor(dealt, "table")).toMatchObject({ deals: [] });
  });
});
