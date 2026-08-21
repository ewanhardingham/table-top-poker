import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { decide } from "./decide.js";
import { createInitialState } from "./room.js";
import { play, playAll } from "./test-utils.js";
import type { Command, EngineState, HandEvent, SeatId } from "./types.js";
import { view } from "./view.js";

function playAndCollect(state: EngineState, commands: Command[]): HandEvent[] {
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

const checkedThroughToRiver: Command[] = [
  { type: "call", seatId: 0 },
  { type: "check", seatId: 1 },
  { type: "check", seatId: 1 },
  { type: "check", seatId: 0 },
  { type: "check", seatId: 1 },
  { type: "check", seatId: 0 },
  { type: "check", seatId: 1 },
  { type: "check", seatId: 0 },
];

const raisedOnTheRiver: Command[] = [
  ...checkedThroughToRiver.slice(0, -1),
  { type: "raise", seatId: 0 },
  { type: "call", seatId: 1 },
];

function headsUpAt(commands: Command[], seed = "s0"): EngineState {
  return playAll(createInitialState([0, 1]), [
    { type: "startHand", seatId: 0, seed },
    ...commands,
  ]);
}

function showdownState(state: EngineState) {
  const hand = state.hand;
  if (hand?.status !== "complete" || hand.reason !== "showdown") {
    throw new Error("expected a hand at showdown");
  }
  return hand;
}

function reveal(state: EngineState): EngineState {
  return playAll(state, [{ type: "reveal", seatId: 0 }]);
}

function shownSeats(state: EngineState): SeatId[] {
  return showdownState(state).results.map((result) => result.seatId);
}

describe("ShowdownReached", () => {
  it("names every seat that reached showdown and reveals nothing about them", () => {
    const events = playAndCollect(createInitialState([0, 1]), [
      { type: "startHand", seatId: 0, seed: "s0" },
      ...checkedThroughToRiver,
    ]);
    const showdown = events.find((event) => event.type === "ShowdownReached");
    if (showdown?.type !== "ShowdownReached") {
      throw new Error("expected a ShowdownReached event");
    }
    expect([...showdown.contestants].sort()).toEqual([0, 1]);
    expect(Object.keys(showdown)).toEqual(["type", "contestants"]);
  });

  it("omits a seat that folded, even though it was live earlier", () => {
    const events = playAndCollect(createInitialState([0, 1, 2]), [
      { type: "startHand", seatId: 0, seed: "seed-1" },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "raise", seatId: 2 },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "fold", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 2 },
      { type: "raise", seatId: 0 },
      { type: "call", seatId: 2 },
    ]);
    const showdown = events.find((event) => event.type === "ShowdownReached");
    if (showdown?.type !== "ShowdownReached") {
      throw new Error("expected a ShowdownReached event");
    }
    expect([...showdown.contestants].sort()).toEqual([0, 2]);
  });
});

describe("the hand rests before it resolves", () => {
  it("carries no hole cards, results or winners in any view", () => {
    const state = headsUpAt(checkedThroughToRiver);

    const table = view(state, "table");
    if (table.phase !== "showdown") throw new Error("expected showdown");
    expect(table.contestants).toEqual([1, 0]);
    expect(table.results).toEqual([]);
    expect(table.winners).toBeNull();
    expect(JSON.stringify(table)).not.toContain("holeCards");
  });

  it("still tells a player their own hand and that they may show", () => {
    const player = view(headsUpAt(checkedThroughToRiver), 0);
    if (player.phase !== "showdown") throw new Error("expected showdown");
    expect(player.yourResult?.holeCards).toHaveLength(2);
    expect(player.canShow).toBe(true);
  });
});

describe("reveal turns over exactly the compulsory set", () => {
  it("compels the river's last aggressor", () => {
    const state = reveal(headsUpAt(raisedOnTheRiver));
    expect(shownSeats(state)).toEqual([0]);
    expect(showdownState(state).winners).not.toBeNull();
  });

  it("forgets an aggressor from an earlier street", () => {
    const state = reveal(
      headsUpAt([
        { type: "call", seatId: 0 },
        { type: "check", seatId: 1 },
        { type: "check", seatId: 1 },
        { type: "raise", seatId: 0 },
        { type: "call", seatId: 1 },
        { type: "check", seatId: 1 },
        { type: "check", seatId: 0 },
        { type: "check", seatId: 1 },
        { type: "check", seatId: 0 },
      ]),
    );
    expect(shownSeats(state)).toEqual(showdownState(state).winners);
  });

  it("compels the winning seat when the river was checked through", () => {
    const state = reveal(headsUpAt(checkedThroughToRiver));
    const hand = showdownState(state);
    expect(hand.winners).not.toBeNull();
    expect(shownSeats(state)).toEqual(hand.winners);
  });

  it("compels every all-in seat", () => {
    const state = reveal(
      headsUpAt([
        { type: "call", seatId: 0 },
        { type: "allInRaise", seatId: 1 },
        { type: "call", seatId: 0 },
      ]),
    );
    expect(shownSeats(state)).toContain(1);
  });

  it("publishes winners over every contestant, shown or not", () => {
    const state = reveal(headsUpAt(raisedOnTheRiver));
    const hand = showdownState(state);
    const ranked = [...hand.contestants].map((contestant) => contestant.seatId);
    expect(hand.winners?.every((seat) => ranked.includes(seat))).toBe(true);
  });

  it("is an idempotent no-op when pressed again", () => {
    const revealed = reveal(headsUpAt(raisedOnTheRiver));
    const outcome = play(revealed, { type: "reveal", seatId: 0 });
    if ("rejection" in outcome) throw new Error("expected a no-op");
    expect(outcome.events).toEqual([]);
  });

  it("is rejected before the river closes", () => {
    const state = headsUpAt([{ type: "call", seatId: 0 }]);
    const outcome = play(state, { type: "reveal", seatId: 0 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-at-showdown");
  });
});

describe("show", () => {
  it("lets any other contestant turn over, in any order", () => {
    const revealed = reveal(headsUpAt(raisedOnTheRiver));
    expect(shownSeats(revealed)).toEqual([0]);
    const shown = playAll(revealed, [{ type: "show", seatId: 1 }]);
    expect(shownSeats(shown)).toEqual([0, 1]);
  });

  it("cannot conceal a hand once shown", () => {
    const shown = playAll(reveal(headsUpAt(raisedOnTheRiver)), [
      { type: "show", seatId: 1 },
    ]);
    const outcome = play(shown, { type: "show", seatId: 1 });
    if ("rejection" in outcome) throw new Error("expected a no-op");
    expect(outcome.events).toEqual([]);
    expect(shownSeats(shown)).toEqual([0, 1]);
  });

  it("is rejected from a seat that folded", () => {
    const state = playAll(createInitialState([0, 1, 2]), [
      { type: "startHand", seatId: 0, seed: "seed-1" },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "raise", seatId: 2 },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "fold", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 2 },
      { type: "raise", seatId: 0 },
      { type: "call", seatId: 2 },
    ]);
    const outcome = play(state, { type: "show", seatId: 1 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-at-showdown");
  });

  it("is rejected before the table has revealed — the hand rests first", () => {
    const resting = headsUpAt(raisedOnTheRiver);
    const outcome = play(resting, { type: "show", seatId: 1 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-at-showdown");
    expect(shownSeats(resting)).toEqual([]);
  });

  it("is rejected once the hand has closed", () => {
    const next = playAll(reveal(headsUpAt(raisedOnTheRiver)), [
      { type: "nextHand", seatId: 0, seed: "s1" },
    ]);
    const outcome = play(next, { type: "show", seatId: 1 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-at-showdown");
  });
});

describe("an unshown seat leaks nothing derived from its cards", () => {
  it("appears in contestants and nowhere else, for the table or a rival", () => {
    const state = reveal(headsUpAt(raisedOnTheRiver));
    const concealed = showdownState(state).contestants.find(
      (contestant) => !shownSeats(state).includes(contestant.seatId),
    );
    if (concealed === undefined) throw new Error("expected a concealed seat");

    for (const projected of [view(state, "table"), view(state, 0)]) {
      if (projected.phase !== "showdown") throw new Error("expected showdown");
      expect(projected.contestants).toContain(concealed.seatId);
      expect(
        projected.results.some((result) => result.seatId === concealed.seatId),
      ).toBe(false);
      expect(JSON.stringify(projected)).not.toContain(
        JSON.stringify(concealed.holeCards[0]),
      );
    }
  });
});

describe("the next hand closes the window", () => {
  it("mucks whatever was not shown", () => {
    const next = playAll(reveal(headsUpAt(raisedOnTheRiver)), [
      { type: "nextHand", seatId: 0, seed: "s1" },
    ]);
    expect(next.hand?.status).toBe("betting");
    const table = view(next, "table");
    expect(table.phase).toBe("betting");
  });
});

describe("replay reproduces exactly who showed", () => {
  it("keeps a concealed hand concealed when the events are folded again", () => {
    const commands: Command[] = [
      { type: "startHand", seatId: 0, seed: "s0" },
      ...raisedOnTheRiver,
      { type: "reveal", seatId: 0 },
    ];
    const events = playAndCollect(createInitialState([0, 1]), commands);

    let replayed = createInitialState([0, 1]);
    for (const event of events) replayed = apply(replayed, event);

    expect(shownSeats(replayed)).toEqual([0]);
    expect(showdownState(replayed).winners).toEqual(
      showdownState(playAll(createInitialState([0, 1]), commands)).winners,
    );
  });
});
