import type { Card } from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { boardKeys, cardKey, dealBoard } from "./boardDeal.js";

const flop: readonly Card[] = [
  { rank: "A", suit: "spades" },
  { rank: "K", suit: "hearts" },
  { rank: "2", suit: "clubs" },
];
const turn: Card = { rank: "7", suit: "diamonds" };
const river: Card = { rank: "9", suit: "clubs" };

const animates = (dealt: readonly { readonly initial: unknown }[]) =>
  dealt.map((card) => card.initial !== false);

describe("cardKey", () => {
  it("identifies a card by its rank and suit, not its board position", () => {
    expect(cardKey({ rank: "A", suit: "spades" })).toBe("Aspades");
    expect(cardKey({ rank: "A", suit: "spades" })).not.toBe(
      cardKey({ rank: "A", suit: "hearts" }),
    );
  });
});

describe("dealBoard", () => {
  it("deals in every card of an opening flop, staggered", () => {
    const dealt = dealBoard(flop, new Set());
    expect(animates(dealt)).toEqual([true, true, true]);
    expect(dealt.map((card) => card.delay)).toEqual([0, 0.08, 0.16]);
    expect(dealt[0]?.duration).toBe(0.4);
  });

  it("leaves cards already on the felt alone", () => {
    const dealt = dealBoard(flop, boardKeys(flop));
    expect(animates(dealt)).toEqual([false, false, false]);
    expect(dealt.map((card) => card.duration)).toEqual([0, 0, 0]);
  });

  it("lands a lone turn card immediately rather than behind the flop's stagger", () => {
    const dealt = dealBoard([...flop, turn], boardKeys(flop));
    expect(animates(dealt)).toEqual([false, false, false, true]);
    expect(dealt[3]?.delay).toBe(0);
  });

  it("deals in a new hand's flop even though more cards were on the felt before", () => {
    const nextFlop: readonly Card[] = [
      { rank: "3", suit: "hearts" },
      { rank: "4", suit: "hearts" },
      { rank: "5", suit: "hearts" },
    ];
    const dealt = dealBoard(nextFlop, boardKeys([...flop, turn, river]));
    expect(animates(dealt)).toEqual([true, true, true]);
    expect(dealt.map((card) => card.delay)).toEqual([0, 0.08, 0.16]);
  });

  it("keys each card by rank and suit so its position on the board is irrelevant", () => {
    const dealt = dealBoard(flop, new Set());
    expect(dealt.map((card) => card.key)).toEqual([
      "Aspades",
      "Khearts",
      "2clubs",
    ]);
  });
});
