import { describe, expect, it } from "vitest";
import {
  initialCardState,
  reduce,
  type CardState,
  type Presentation,
} from "./cardState.js";

function state(presentation: Presentation): CardState {
  return { presentation, recognizer: "Idle" };
}

describe("initialCardState", () => {
  it("starts Absent when the seat holds no cards", () => {
    expect(initialCardState({ hasCards: false, locked: false })).toEqual(
      state("Absent"),
    );
  });

  it("starts FaceDown when cards are already in hand on mount", () => {
    expect(initialCardState({ hasCards: true, locked: false })).toEqual(
      state("FaceDown"),
    );
  });

  it("starts Revealed when mounting into a locked (showdown) pair", () => {
    expect(initialCardState({ hasCards: true, locked: true })).toEqual(
      state("Revealed"),
    );
  });

  it("stays Absent when locked with no cards", () => {
    expect(initialCardState({ hasCards: false, locked: true })).toEqual(
      state("Absent"),
    );
  });
});

describe("reduce", () => {
  describe("DEALT", () => {
    it("deals in face-down from Absent", () => {
      expect(reduce(state("Absent"), { type: "DEALT" })).toEqual(
        state("FaceDown"),
      );
    });

    it("returns every other presentation to face-down, so a new hand never inherits a face-up frame", () => {
      for (const presentation of [
        "FaceDown",
        "Peeking",
        "Turning",
        "Revealed",
        "Leaving",
      ] as const) {
        expect(reduce(state(presentation), { type: "DEALT" })).toEqual(
          state("FaceDown"),
        );
      }
    });
  });

  describe("CARDS_GONE", () => {
    it("empties the pair from any presentation", () => {
      for (const presentation of [
        "FaceDown",
        "Revealed",
        "Turning",
        "Leaving",
      ] as const) {
        expect(reduce(state(presentation), { type: "CARDS_GONE" })).toEqual(
          state("Absent"),
        );
      }
    });
  });

  describe("ACTIVATED", () => {
    it("starts the flip to face-up from FaceDown", () => {
      expect(reduce(state("FaceDown"), { type: "ACTIVATED" })).toEqual(
        state("Turning"),
      );
    });

    it("conceals instantly from Revealed — there is no concealing flip", () => {
      expect(reduce(state("Revealed"), { type: "ACTIVATED" })).toEqual(
        state("FaceDown"),
      );
    });

    it("toggles reveal and conceal across repeated activations", () => {
      const revealing = reduce(state("FaceDown"), { type: "ACTIVATED" });
      const revealed = reduce(revealing, { type: "TURN_FINISHED" });
      expect(revealed.presentation).toBe("Revealed");
      expect(reduce(revealed, { type: "ACTIVATED" }).presentation).toBe(
        "FaceDown",
      );
    });

    it("is a no-op mid-turn, so a second activation cannot stall the flip", () => {
      expect(reduce(state("Turning"), { type: "ACTIVATED" })).toEqual(
        state("Turning"),
      );
    });

    it("is a no-op with no cards in hand", () => {
      expect(reduce(state("Absent"), { type: "ACTIVATED" })).toEqual(
        state("Absent"),
      );
    });

    it("is a no-op while the pair is leaving for the muck", () => {
      expect(reduce(state("Leaving"), { type: "ACTIVATED" })).toEqual(
        state("Leaving"),
      );
    });
  });

  describe("TURN_FINISHED", () => {
    it("lands the committed flip on Revealed", () => {
      expect(reduce(state("Turning"), { type: "TURN_FINISHED" })).toEqual(
        state("Revealed"),
      );
    });

    it("is a no-op from any other presentation", () => {
      for (const presentation of [
        "Absent",
        "FaceDown",
        "Revealed",
        "Leaving",
      ] as const) {
        expect(reduce(state(presentation), { type: "TURN_FINISHED" })).toEqual(
          state(presentation),
        );
      }
    });
  });
});
