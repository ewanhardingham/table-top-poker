import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { decide } from "./decide.js";
import { createInitialState } from "./room.js";
import { play, playAll } from "./test-utils.js";
import type { Command, EngineState, HandEvent, SeatId } from "./types.js";
import { must } from "./util.js";
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

const bothAllInPreflop: Command[] = [
  { type: "call", seatId: 0 },
  { type: "allInRaise", seatId: 1 },
  { type: "allInCall", seatId: 0 },
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

describe("the window opens at river close", () => {
  it("carries no hole cards, results or winners in any view", () => {
    const state = headsUpAt(checkedThroughToRiver);

    const table = view(state, "table");
    if (table.phase !== "showdown") throw new Error("expected showdown");
    expect(table.contestants).toEqual([1, 0]);
    expect(table.results).toEqual([]);
    expect(table.mucked).toEqual([]);
    expect(table.winners).toBeNull();
    expect(JSON.stringify(table)).not.toContain("holeCards");
  });

  it("queues the river's last aggressor first, then clockwise", () => {
    expect(showdownState(headsUpAt(raisedOnTheRiver)).queue).toEqual([0, 1]);
  });

  it("queues from the first live seat left of the button with no aggressor", () => {
    expect(showdownState(headsUpAt(checkedThroughToRiver)).queue).toEqual([
      1, 0,
    ]);
  });

  it("forgets an aggressor from an earlier street", () => {
    const state = headsUpAt([
      { type: "call", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 1 },
      { type: "raise", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 0 },
    ]);
    expect(showdownState(state).queue).toEqual([1, 0]);
  });

  it("tells a player it is their turn, and that they cannot yet muck", () => {
    const player = view(headsUpAt(raisedOnTheRiver), 0);
    if (player.phase !== "showdown") throw new Error("expected showdown");
    expect(player.yourResult?.holeCards).toHaveLength(2);
    expect(player.canShow).toBe(true);
    expect(player.canMuck).toBe(false);
  });

  it("leaves a contestant behind the head unable to act", () => {
    const player = view(headsUpAt(raisedOnTheRiver), 1);
    if (player.phase !== "showdown") throw new Error("expected showdown");
    expect(player.canShow).toBe(false);
    expect(player.canMuck).toBe(false);
  });
});

describe("all-in contestants are tabled as the window opens", () => {
  it("shows them without queueing them, and publishes winners at once", () => {
    const state = headsUpAt(bothAllInPreflop);
    const hand = showdownState(state);
    expect(hand.queue).toEqual([]);
    expect([...shownSeats(state)].sort()).toEqual([0, 1]);
    expect(hand.winners).not.toBeNull();
  });

  it("frees the rest to muck when the last aggressor was all-in", () => {
    const state = playAll(createInitialState([0, 1, 2]), [
      { type: "startHand", seatId: 0, seed: "seed-1" },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "check", seatId: 2 },
      { type: "check", seatId: 0 },
      { type: "check", seatId: 1 },
      { type: "allInRaise", seatId: 2 },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
    ]);
    const hand = showdownState(state);
    expect(shownSeats(state)).toEqual([2]);
    expect(hand.queue).not.toContain(2);
    const player = view(state, must(hand.queue[0]));
    if (player.phase !== "showdown") throw new Error("expected showdown");
    expect(player.canMuck).toBe(true);
  });
});

describe("show", () => {
  it("publishes the head's hand and passes the turn on", () => {
    const shown = playAll(headsUpAt(raisedOnTheRiver), [
      { type: "show", seatId: 0 },
    ]);
    expect(shownSeats(shown)).toEqual([0]);
    expect(showdownState(shown).queue).toEqual([1]);
    expect(showdownState(shown).winners).toBeNull();
  });

  it("declares winners once the last contestant resolves", () => {
    const shown = playAll(headsUpAt(raisedOnTheRiver), [
      { type: "show", seatId: 0 },
      { type: "show", seatId: 1 },
    ]);
    const hand = showdownState(shown);
    expect(shownSeats(shown)).toEqual([0, 1]);
    expect(hand.winners).not.toBeNull();
  });

  it("is rejected from a seat that is not the head of the queue", () => {
    const outcome = play(headsUpAt(raisedOnTheRiver), {
      type: "show",
      seatId: 1,
    });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-your-turn");
  });

  it("is rejected from a seat that folded", () => {
    const outcome = play(headsUpAt(raisedOnTheRiver), {
      type: "show",
      seatId: 2,
    });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-your-turn");
  });

  it("is rejected before the river closes", () => {
    const outcome = play(headsUpAt([{ type: "call", seatId: 0 }]), {
      type: "show",
      seatId: 0,
    });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-at-showdown");
  });

  it("is rejected once the window has closed", () => {
    const closed = playAll(headsUpAt(raisedOnTheRiver), [
      { type: "show", seatId: 0 },
      { type: "show", seatId: 1 },
    ]);
    const outcome = play(closed, { type: "show", seatId: 1 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-at-showdown");
  });
});

describe("muck", () => {
  it("is refused from the head while no hand is face-up", () => {
    const outcome = play(headsUpAt(raisedOnTheRiver), {
      type: "muck",
      seatId: 0,
    });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("action-not-legal");
  });

  it("is allowed once the first hand is face-up, and forfeits the pot", () => {
    const shown = playAll(headsUpAt(raisedOnTheRiver), [
      { type: "show", seatId: 0 },
    ]);
    const mucked = playAll(shown, [{ type: "muck", seatId: 1 }]);
    const hand = showdownState(mucked);
    expect(hand.mucked).toEqual([1]);
    expect(hand.queue).toEqual([]);
    expect(hand.winners).toEqual([0]);
  });

  it("is rejected from a seat that is not the head of the queue", () => {
    const shown = playAll(headsUpAt(checkedThroughToRiver), [
      { type: "show", seatId: 1 },
    ]);
    const outcome = play(shown, { type: "muck", seatId: 1 });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("not-your-turn");
  });

  it("takes a mucked hand out of the player's own view", () => {
    const mucked = playAll(headsUpAt(raisedOnTheRiver), [
      { type: "show", seatId: 0 },
      { type: "muck", seatId: 1 },
    ]);
    const player = view(mucked, 1);
    if (player.phase !== "showdown") throw new Error("expected showdown");
    expect(player.yourResult).toBeNull();
    expect(player.mucked).toEqual([1]);
  });
});

describe("winners are the best shown hand", () => {
  it("hands the pot to a losing hand that tabled when the best hand mucked", () => {
    const shown = playAll(headsUpAt(checkedThroughToRiver), [
      { type: "show", seatId: 1 },
    ]);
    const only = shownSeats(shown);
    const closed = playAll(shown, [{ type: "muck", seatId: 0 }]);
    expect(showdownState(closed).winners).toEqual(only);
  });
});

describe("the window holds the next hand", () => {
  it("rejects nextHand while the queue is unresolved", () => {
    const outcome = play(headsUpAt(raisedOnTheRiver), {
      type: "nextHand",
      seatId: 0,
      seed: "s1",
    });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("showdown-unresolved");
  });

  it("deals once every contestant has shown or mucked", () => {
    const closed = playAll(headsUpAt(raisedOnTheRiver), [
      { type: "show", seatId: 0 },
      { type: "muck", seatId: 1 },
      { type: "nextHand", seatId: 0, seed: "s1" },
    ]);
    expect(closed.hand?.status).toBe("betting");
  });
});

describe("an unshown seat leaks nothing derived from its cards", () => {
  it("appears in contestants and nowhere else, for the table or a rival", () => {
    const state = playAll(headsUpAt(raisedOnTheRiver), [
      { type: "show", seatId: 0 },
    ]);
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

describe("replay reproduces exactly who showed", () => {
  it("keeps a mucked hand mucked when the events are folded again", () => {
    const commands: Command[] = [
      { type: "startHand", seatId: 0, seed: "s0" },
      ...raisedOnTheRiver,
      { type: "show", seatId: 0 },
      { type: "muck", seatId: 1 },
    ];
    const events = playAndCollect(createInitialState([0, 1]), commands);

    let replayed = createInitialState([0, 1]);
    for (const event of events) replayed = apply(replayed, event);

    expect(shownSeats(replayed)).toEqual([0]);
    expect(showdownState(replayed).mucked).toEqual([1]);
    expect(showdownState(replayed).winners).toEqual(
      showdownState(playAll(createInitialState([0, 1]), commands)).winners,
    );
  });
});
