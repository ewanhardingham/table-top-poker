import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { decide } from "./decide.js";
import { createInitialState } from "./room.js";
import { play, playAll } from "./test-utils.js";
import type { EngineState, HandEvent } from "./types.js";

describe("a full hand, 3 seats, start to showdown", () => {
  it("plays fold/check/call/raise across every street to HandComplete via ShowdownReached", () => {
    let state = createInitialState([0, 1, 2]);
    expect(state.button).toBe(0);

    // ring (button 0) = [1, 2, 0]; preflop order = [1, 2, 0], BB = seat 2.
    state = playAll(state, [{ type: "startHand", seatId: 0, seed: "seed-1" }]);
    expect(state.hand?.status).toBe("betting");

    // Preflop: 1 calls the BB (not free to check — only the BB itself is),
    // 2 (BB) raises, 0 calls, 1 calls (closes back to raiser).
    state = playAll(state, [
      { type: "call", seatId: 1 },
      { type: "raise", seatId: 2 },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
    ]);
    expect(state.hand?.status).toBe("betting");
    expect(
      state.hand && "street" in state.hand ? state.hand.street : null,
    ).toBe("flop");

    // Flop: everyone checks around (order = [1, 2, 0], no BB special-case).
    state = playAll(state, [
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
    ]);
    expect(
      state.hand && "street" in state.hand ? state.hand.street : null,
    ).toBe("turn");

    // Turn: 1 folds, 2 and 0 remain live, betting continues.
    state = playAll(state, [
      { type: "fold", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
    ]);
    expect(
      state.hand && "street" in state.hand ? state.hand.street : null,
    ).toBe("river");

    // River: 2 checks, 0 raises, 2 calls -> showdown.
    const beforeRiver = state;
    const riverEvents = playAndCollect(beforeRiver, [
      { type: "check", seatId: 2 },
      { type: "raise", seatId: 0 },
      { type: "call", seatId: 2 },
    ]);

    expect(riverEvents.filter((e) => e.type === "StreetClosed")).toHaveLength(
      1,
    );
    const showdown = riverEvents.find((e) => e.type === "ShowdownReached");
    expect(showdown).toBeDefined();
    if (showdown?.type === "ShowdownReached") {
      // Seat 1 folded on the turn — never revealed, even though it was live earlier.
      expect(showdown.results.map((r) => r.seatId).sort()).toEqual([0, 2]);
      // Deterministic for seed "seed-1": seat 2 holds the clear best hand.
      expect(showdown.winners).toEqual([2]);
    }
    expect(riverEvents.at(-1)?.type).toBe("HandComplete");
  });
});

function playAndCollect(
  state: EngineState,
  commands: { type: "fold" | "check" | "call" | "raise"; seatId: number }[],
): HandEvent[] {
  const all: HandEvent[] = [];
  let current = state;
  for (const command of commands) {
    const result = decide(current, command);
    if (!Array.isArray(result)) {
      throw new Error(`unexpected rejection: ${result.reason}`);
    }
    all.push(...result);
    for (const event of result) {
      current = apply(current, event);
    }
  }
  return all;
}

describe("HoleCardsDealt", () => {
  it("deals exactly two cards to every seated player", () => {
    const state = createInitialState([0, 1, 2, 3]);
    const outcome = play(state, {
      type: "startHand",
      seatId: 0,
      seed: "abc",
    });
    if (!("events" in outcome)) throw new Error("expected events");
    const dealt = outcome.events.find((e) => e.type === "HoleCardsDealt");
    if (dealt?.type !== "HoleCardsDealt") throw new Error("expected deal");
    expect(dealt.deals.map((d) => d.seatId).sort()).toEqual([0, 1, 2, 3]);
    for (const deal of dealt.deals) {
      expect(deal.cards).toHaveLength(2);
    }
    const allCards = dealt.deals.flatMap((d) => d.cards);
    const unique = new Set(allCards.map((c) => `${c.rank}${c.suit}`));
    expect(unique.size).toBe(allCards.length);
  });
});
