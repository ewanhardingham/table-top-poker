import { describe, expect, it } from "vitest";
import type { CardState, Presentation, Recognizer } from "./cardState.js";
import {
  selectHint,
  type HintContext,
  type TeachableGesture,
} from "./coaching.js";
import type { BendAxis } from "./geometry.js";

function bending(
  bendAxis: BendAxis,
  overrides: Partial<CardState> = {},
): CardState & { readonly bendAxis: BendAxis } {
  return {
    presentation: "Peeking",
    recognizer: "Bending",
    armed: false,
    locked: false,
    bendAxis,
    ...overrides,
  };
}

function idle(
  presentation: Presentation,
  recognizer: Recognizer = "Idle",
): CardState & { readonly bendAxis: BendAxis } {
  return {
    presentation,
    recognizer,
    armed: false,
    locked: false,
    bendAxis: "left",
  };
}

function ctx(overrides: Partial<HintContext> = {}): HintContext {
  return {
    checkLegal: true,
    foldLegal: true,
    pending: false,
    locked: false,
    quiet: true,
    ...overrides,
  };
}

const nothingDiscovered: ReadonlySet<TeachableGesture> = new Set();
const everythingDiscovered: ReadonlySet<TeachableGesture> = new Set([
  "bend",
  "conceal",
  "check",
  "fold",
]);

describe("selectHint", () => {
  describe("in-gesture bend prompts", () => {
    it("says what releasing does while the bend runs leftward", () => {
      expect(selectHint(bending("left"), nothingDiscovered, ctx())).toEqual({
        id: "bending-left",
        line1: "Release to peek",
        line2: "keep bending to reveal both",
      });
    });

    it("swaps the second line for the upward bend, where the finger covers the face", () => {
      expect(selectHint(bending("up"), nothingDiscovered, ctx())).toEqual({
        id: "bending-up",
        line1: "Release to peek",
        line2: "drag left to keep your finger clear",
      });
    });

    it("returns the prompt regardless of the discovery set — in-gesture hints never retire", () => {
      expect(
        selectHint(bending("left"), everythingDiscovered, ctx()),
      ).not.toBeNull();
      expect(selectHint(bending("up"), everythingDiscovered, ctx())).toEqual(
        selectHint(bending("up"), nothingDiscovered, ctx()),
      );
    });

    it("returns the prompt to a desktop player dragging with a mouse", () => {
      // The `(pointer: coarse)` gate belongs to the teaching hints (#147): it
      // exists so a keyboard player is not told to bend corners. Feedback on a
      // motion already underway belongs to whoever is making it.
      expect(
        selectHint(bending("up"), everythingDiscovered, ctx()),
      ).not.toBeNull();
    });

    it("returns the prompt without waiting for the quiet interval", () => {
      // It is feedback on a motion happening right now, not instruction that
      // should hold off and let the player find the gesture themselves.
      expect(
        selectHint(bending("left"), nothingDiscovered, ctx({ quiet: false })),
      ).not.toBeNull();
    });
  });

  describe("gates", () => {
    it("shows nothing while an Action is pending or at showdown", () => {
      expect(
        selectHint(bending("left"), nothingDiscovered, ctx({ pending: true })),
      ).toBeNull();
      expect(
        selectHint(bending("left"), nothingDiscovered, ctx({ locked: true })),
      ).toBeNull();
    });

    it("shows nothing when the player is holding no cards", () => {
      expect(selectHint(idle("Absent"), nothingDiscovered, ctx())).toBeNull();
    });
  });

  it("shows nothing when no gesture is running", () => {
    for (const presentation of ["FaceDown", "Revealed", "Turning"] as const) {
      expect(
        selectHint(idle(presentation), nothingDiscovered, ctx()),
      ).toBeNull();
    }
  });

  it("shows nothing for a drag that is not a bend", () => {
    expect(
      selectHint(idle("FaceDown", "Ignored"), nothingDiscovered, ctx()),
    ).toBeNull();
  });
});
