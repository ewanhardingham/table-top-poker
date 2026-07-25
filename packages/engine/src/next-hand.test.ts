import { describe, expect, it } from "vitest";
import { createInitialState } from "./room.js";
import { play, playAll } from "./test-utils.js";

describe("nextHand", () => {
  it("rotates the button and starts a fresh hand with the new seed once complete", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [
      { type: "startHand", playerId: 0, seed: "hand-1" },
    ]);
    expect(state.button).toBe(0);

    // Fold everyone but seat 0 out to reach HAND_COMPLETE quickly.
    state = playAll(state, [
      { type: "fold", playerId: 1 },
      { type: "fold", playerId: 2 },
    ]);
    expect(state.hand?.status).toBe("complete");
    expect(state.button).toBe(1);

    const outcome = play(state, {
      type: "nextHand",
      playerId: 1,
      seed: "hand-2",
    });
    if (!("events" in outcome)) throw new Error("expected events");
    const started = outcome.events.find((e) => e.type === "HandStarted");
    expect(started).toBeDefined();
    if (started?.type === "HandStarted") {
      expect(started.button).toBe(1);
      expect(started.seed).toBe("hand-2");
    }
    expect(outcome.state.button).toBe(1);
    expect(outcome.state.hand?.status).toBe("betting");
  });

  it("rejects nextHand while a hand is still in progress (stale-next-hand)", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [{ type: "startHand", playerId: 0, seed: "s" }]);

    const outcome = play(state, { type: "nextHand", playerId: 0, seed: "s2" });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("stale-next-hand");
  });

  it("rejects nextHand before any hand has ever been played", () => {
    const state = createInitialState([0, 1, 2]);
    const outcome = play(state, { type: "nextHand", playerId: 0, seed: "s" });
    if (!("rejection" in outcome)) throw new Error("expected a rejection");
    expect(outcome.rejection.reason).toBe("stale-next-hand");
  });
});
