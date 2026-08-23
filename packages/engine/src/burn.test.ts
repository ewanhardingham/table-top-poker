import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { dealFromDeck } from "./table.js";
import { play, playAll } from "./test-utils.js";
import type { Card, Command, EngineState, HandEvent } from "./types.js";
import { must } from "./util.js";
import { view } from "./view.js";

const seats = [0, 1, 2];

function started(seed: string): EngineState {
  return playAll(createInitialState(seats), [
    { type: "startHand", seatId: 0, seed },
  ]);
}

function eventsOf(state: EngineState, command: Command): HandEvent[] {
  const outcome = play(state, command);
  if ("rejection" in outcome) {
    throw new Error(`unexpected rejection: ${outcome.rejection.reason}`);
  }
  return outcome.events;
}

function checkAround(state: EngineState, order: number[]): EngineState {
  return playAll(
    state,
    order.map((seatId) => ({ type: "check", seatId })),
  );
}

function key(card: Card): string {
  return `${card.rank}-${card.suit}`;
}

function tableView(state: EngineState) {
  const table = view(state, "table");
  if (!("burnedCount" in table)) throw new Error("expected a dealt hand");
  return table;
}

describe("burning a card before each street", () => {
  it("burns immediately before the flop is dealt", () => {
    const preflop = playAll(started("burn-flop"), [
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
    ]);

    const tail = eventsOf(preflop, { type: "check", seatId: 2 });
    const types = tail.map((event) => event.type);

    expect(types).toEqual([
      "ActionTaken",
      "StreetClosed",
      "CardBurned",
      "BoardDealt",
      "StreetStarted",
    ]);
    const burn = must(tail.find((event) => event.type === "CardBurned"));
    expect(burn).toMatchObject({ street: "flop" });
  });

  it("never burns before the preflop deal", () => {
    const opening = eventsOf(createInitialState(seats), {
      type: "startHand",
      seatId: 0,
      seed: "no-preflop-burn",
    });

    expect(opening.some((event) => event.type === "CardBurned")).toBe(false);
  });

  it("burns once per street the hand actually reaches", () => {
    let state = playAll(started("burn-count"), [
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 2 },
    ]);
    expect(tableView(state).burnedCount).toBe(1);

    state = checkAround(state, [1, 2, 0]);
    expect(tableView(state).burnedCount).toBe(2);

    state = checkAround(state, [1, 2, 0]);
    expect(tableView(state).burnedCount).toBe(3);
  });

  it("leaves a hand that folded out on the flop with one burn", () => {
    let state = playAll(started("fold-out-flop"), [
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 2 },
    ]);
    state = playAll(state, [
      { type: "fold", seatId: 1 },
      { type: "fold", seatId: 2 },
    ]);

    const table = tableView(state);
    expect(table.phase).toBe("folded-out");
    expect(table.burnedCount).toBe(1);
  });

  it("consumes a deck position, so the board is not what an unburnt deck would deal", () => {
    const seed = "deck-cursor";
    const unburnt = dealFromDeck(seed, seats.length * 2, 3);

    const state = playAll(started(seed), [
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 2 },
    ]);
    const table = tableView(state);
    if (!("board" in table)) throw new Error("expected a board");

    expect(table.board.map(key)).not.toEqual(unburnt.map(key));
    expect(table.board.map(key)).toEqual(
      dealFromDeck(seed, seats.length * 2 + 1, 3).map(key),
    );
  });

  it("keeps burnt cards off the board and out of every hand", () => {
    let state = started("no-double-deal");
    const holeCards = [...must(stateHand(state).players.values())].flatMap(
      (seat) => seat.holeCards ?? [],
    );

    state = playAll(state, [
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 2 },
    ]);
    state = checkAround(state, [1, 2, 0]);
    state = checkAround(state, [1, 2, 0]);

    const hand = stateHand(state);
    const dealt = new Set([...hand.board, ...holeCards].map(key));
    for (const burnt of hand.burned) expect(dealt.has(key(burnt))).toBe(false);
    expect(hand.burned).toHaveLength(3);
  });
});

function stateHand(state: EngineState) {
  if (state.hand?.status !== "betting") throw new Error("expected betting");
  return state.hand;
}

describe("the deck cursor", () => {
  it("throws rather than dealing a short hand off the end of the deck", () => {
    expect(() => dealFromDeck("short", 51, 3)).toThrow(/cannot deal/);
  });
});
