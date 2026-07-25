import { describe, expect, it } from "vitest";
import { apply } from "./apply.js";
import { decide } from "./decide.js";
import { createInitialState } from "./room.js";
import { playAll } from "./test-utils.js";

describe("fold-out early exit", () => {
  it("jumps straight to HAND_COMPLETE mid-street when only one live player remains", () => {
    let state = createInitialState([0, 1, 2]);
    state = playAll(state, [
      { type: "startHand", playerId: 0, seed: "foldout" },
    ]);

    // Preflop: 1 folds, 2 (BB) folds — only seat 0 remains live, mid-street.
    state = playAll(state, [{ type: "fold", playerId: 1 }]);
    expect(state.hand?.status).toBe("betting");

    const result = decide(state, { type: "fold", playerId: 2 });
    if (!Array.isArray(result)) throw new Error("expected events");

    expect(result.some((e) => e.type === "StreetClosed")).toBe(false);
    expect(result.some((e) => e.type === "ShowdownReached")).toBe(false);
    const foldedOut = result.find((e) => e.type === "HandFoldedOut");
    expect(foldedOut).toBeDefined();
    if (foldedOut?.type === "HandFoldedOut") {
      expect(foldedOut.winner).toBe(0);
    }
    expect(result.at(-1)?.type).toBe("HandComplete");

    let next = state;
    for (const event of result) {
      next = apply(next, event);
    }
    expect(next.hand?.status).toBe("complete");
    // Button rotates on HAND_COMPLETE.
    expect(next.button).toBe(1);
  });
});
