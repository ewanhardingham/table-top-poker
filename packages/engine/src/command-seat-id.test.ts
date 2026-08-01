import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { createInitialState } from "./room.js";
import { decide } from "./decide.js";

describe("Command seat identity", () => {
  it("uses seatId for starting a hand and ordinary actions", () => {
    const initial = createInitialState([0, 1, 2]);
    const started = decide(initial, {
      type: "startHand",
      seatId: 0,
      seed: "seat-id-seed",
    });

    expect(Array.isArray(started)).toBe(true);
    if (!Array.isArray(started)) throw new Error("expected hand-start events");

    let state = initial;
    for (const event of started) state = apply(state, event);

    const action = decide(state, { type: "fold", seatId: 1 });
    expect(action).toEqual([
      { type: "ActionTaken", seatId: 1, action: "fold" },
    ]);
  });
});
