import { describe, expect, it } from "vitest";
import { decide } from "./decide.js";
import { createInitialState } from "./room.js";
import { legalActions } from "./table.js";
import { play, playAll } from "./test-utils.js";
import type { BettingHandState, EngineState, HandEvent } from "./types.js";
import { must } from "./util.js";
import { view } from "./view.js";

function betting(state: EngineState): BettingHandState {
  if (state.hand?.status !== "betting") throw new Error("expected betting");
  return state.hand;
}

function showdown(state: EngineState) {
  if (state.hand?.status !== "complete" || state.hand.reason !== "showdown") {
    throw new Error("expected a showdown");
  }
  return state.hand;
}

function foldedOut(state: EngineState) {
  if (state.hand?.status !== "complete" || state.hand.reason !== "folded-out") {
    throw new Error("expected a fold-out");
  }
  return state.hand;
}

function events(state: EngineState, command: Parameters<typeof decide>[1]) {
  const result = decide(state, command);
  if (!Array.isArray(result)) {
    throw new Error(`unexpected rejection: ${result.reason}`);
  }
  return result;
}

function typesOf(list: readonly HandEvent[]): string[] {
  return list.map((event) => event.type);
}

function started(seats: number[], seed: string): EngineState {
  return playAll(createInitialState(seats), [
    { type: "startHand", seatId: must(seats[0]), seed },
  ]);
}

describe("all-in legality", () => {
  it("offers both all-ins wherever raise is legal, facing a bet or not", () => {
    const state = started([0, 1, 2], "legality");
    const hand = betting(state);

    expect(legalActions(hand, 0)).toEqual([
      "fold",
      "call",
      "raise",
      "allInCall",
      "allInRaise",
    ]);
    expect(legalActions(hand, 2)).toEqual([
      "fold",
      "check",
      "raise",
      "allInCall",
      "allInRaise",
    ]);
  });

  it("reports both all-ins through the acting seat's view", () => {
    const state = started([0, 1, 2], "legality-view");

    expect(view(state, 0)).toMatchObject({
      legalActions: ["fold", "call", "raise", "allInCall", "allInRaise"],
    });
    expect(view(state, 1)).toMatchObject({ legalActions: [] });
  });

  it("rejects an all-in from a seat that is not to act", () => {
    const state = started([0, 1, 2], "out-of-turn");

    const outcome = play(state, { type: "allInRaise", seatId: 1 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-your-turn");
  });

  it("rejects an all-in when no hand is in progress", () => {
    const state = createInitialState([0, 1, 2]);

    const outcome = play(state, { type: "allInCall", seatId: 0 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("hand-not-in-progress");
  });

  it("never offers an action to a seat that is already all-in", () => {
    let state = started([0, 1, 2, 3], "no-second-turn");
    state = playAll(state, [{ type: "allInCall", seatId: 3 }]);

    expect(betting(state).toAct).not.toContain(3);

    const outcome = play(state, { type: "check", seatId: 3 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-your-turn");
  });
});

describe("all-in and the betting queue", () => {
  it("requeues the other live seats for an allInRaise", () => {
    let state = started([0, 1, 2], "requeue");
    state = playAll(state, [{ type: "call", seatId: 0 }]);
    expect(betting(state).toAct).toEqual([1, 2]);

    state = playAll(state, [{ type: "allInRaise", seatId: 1 }]);
    expect(betting(state).toAct).toEqual([2, 0]);
  });

  it("leaves the queue alone for an allInCall", () => {
    let state = started([0, 1, 2], "no-requeue");
    state = playAll(state, [{ type: "call", seatId: 0 }]);

    state = playAll(state, [{ type: "allInCall", seatId: 1 }]);
    expect(betting(state).toAct).toEqual([2]);
  });

  it("makes an allInRaise face the seats behind it with a bet", () => {
    let state = started([0, 1, 2, 3], "reopens");
    state = playAll(state, [
      { type: "call", seatId: 3 },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "allInRaise", seatId: 1 },
    ]);

    expect(legalActions(betting(state), 2)).toContain("call");
    expect(legalActions(betting(state), 2)).not.toContain("check");
  });

  it("keeps a seat that called a shove acting on later streets", () => {
    let state = started([0, 1, 2, 3], "caller-keeps-acting");
    state = playAll(state, [
      { type: "allInRaise", seatId: 3 },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "call", seatId: 2 },
    ]);

    const hand = betting(state);
    expect(hand.street).toBe("flop");
    expect(hand.toAct).toEqual([1, 2, 0]);
  });
});

describe("all-in and the automatic run-out", () => {
  it("still asks a lone deep seat to answer a shove", () => {
    const state = started([0, 1], "lone-seat-answers");

    const tail = events(state, { type: "allInRaise", seatId: 0 });

    expect(typesOf(tail)).toEqual(["ActionTaken"]);
    expect(
      betting(playAll(state, [{ type: "allInRaise", seatId: 0 }])).toAct,
    ).toEqual([1]);
  });

  it("deals every remaining street without opening it when only one seat can act", () => {
    let state = started([0, 1, 2], "run-out");
    state = playAll(state, [
      { type: "allInRaise", seatId: 0 },
      { type: "allInCall", seatId: 1 },
    ]);

    const tail = events(state, { type: "call", seatId: 2 });

    expect(typesOf(tail)).toEqual([
      "ActionTaken",
      "StreetClosed",
      "BoardDealt",
      "BoardDealt",
      "BoardDealt",
      "ShowdownReached",
      "HandComplete",
    ]);
  });

  it("runs out to showdown when every remaining seat is all-in", () => {
    let state = started([0, 1], "heads-up-shove");
    state = playAll(state, [{ type: "allInRaise", seatId: 0 }]);

    const tail = events(state, { type: "allInCall", seatId: 1 });

    expect(tail.some((event) => event.type === "StreetStarted")).toBe(false);
    expect(typesOf(tail).filter((type) => type === "BoardDealt")).toHaveLength(
      3,
    );

    const final = showdown(playAll(state, [{ type: "allInCall", seatId: 1 }]));
    expect(final.board).toHaveLength(5);
    expect(final.contestants.map((contestant) => contestant.seatId)).toEqual([
      1, 0,
    ]);
  });

  it("still opens the flop normally when two seats can act", () => {
    let state = started([0, 1, 2, 3], "no-run-out");
    state = playAll(state, [
      { type: "allInRaise", seatId: 3 },
      { type: "call", seatId: 0 },
      { type: "fold", seatId: 1 },
      { type: "call", seatId: 2 },
    ]);

    expect(betting(state).street).toBe("flop");
    expect(betting(state).board).toHaveLength(3);
  });
});

describe("all-in and fold-out", () => {
  it("counts an all-in seat as unfolded, so a lone caller still reaches showdown", () => {
    let state = started([0, 1, 2, 3], "shove-plus-caller");
    state = playAll(state, [
      { type: "allInRaise", seatId: 3 },
      { type: "call", seatId: 0 },
      { type: "fold", seatId: 1 },
    ]);

    const tail = events(state, { type: "fold", seatId: 2 });

    expect(tail.some((event) => event.type === "HandFoldedOut")).toBe(false);
    expect(tail.some((event) => event.type === "ShowdownReached")).toBe(true);
  });

  it("closes the turn without a lone check when the last opponent folds", () => {
    let state = started([0, 1, 2, 3], "turn-fold");
    state = playAll(state, [
      { type: "allInRaise", seatId: 3 },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "call", seatId: 2 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
    ]);
    expect(betting(state).street).toBe("turn");

    state = playAll(state, [{ type: "fold", seatId: 1 }]);
    expect(betting(state).toAct).toEqual([2, 0]);

    expect(typesOf(events(state, { type: "fold", seatId: 2 }))).toEqual([
      "ActionTaken",
      "StreetClosed",
      "BoardDealt",
      "ShowdownReached",
      "HandComplete",
    ]);

    const final = showdown(playAll(state, [{ type: "fold", seatId: 2 }]));
    expect(
      final.contestants.map((contestant) => contestant.seatId).sort(),
    ).toEqual([0, 3]);
  });

  it("still folds out a hand where only one seat is left unfolded", () => {
    let state = started([0, 1, 2], "genuine-fold-out");
    state = playAll(state, [{ type: "allInRaise", seatId: 0 }]);

    const tail = events(state, { type: "fold", seatId: 1 });
    expect(tail.some((event) => event.type === "HandFoldedOut")).toBe(false);

    const final = foldedOut(
      playAll(state, [
        { type: "fold", seatId: 1 },
        { type: "fold", seatId: 2 },
      ]),
    );
    expect(final.winner).toBe(0);
  });
});

describe("all-in and eviction", () => {
  it("refuses to fold an all-in seat out of a pot it has already bought into", () => {
    let state = started([0, 1, 2], "evict-all-in");
    state = playAll(state, [{ type: "allInCall", seatId: 0 }]);

    const outcome = play(state, { type: "evict", seatId: 0 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("action-not-legal");
  });
});
