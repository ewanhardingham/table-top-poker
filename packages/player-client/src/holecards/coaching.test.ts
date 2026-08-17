import { describe, expect, it } from "vitest";
import type {
  CardEvent,
  CardState,
  Presentation,
  Recognizer,
} from "./cardState.js";
import {
  discoveredBy,
  nextTeachable,
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
  armed = false,
): CardState & { readonly bendAxis: BendAxis } {
  return {
    presentation,
    recognizer,
    armed,
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
    coarsePointer: true,
    quiet: true,
    checkConfirmed: false,
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
        announce: false,
      });
    });

    it("swaps the second line for the upward bend, where the finger covers the face", () => {
      expect(selectHint(bending("up"), nothingDiscovered, ctx())).toEqual({
        id: "bending-up",
        line1: "Release to peek",
        line2: "drag left to keep your finger clear",
        announce: false,
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
      expect(
        selectHint(bending("up"), everythingDiscovered, ctx()),
      ).not.toBeNull();
    });

    it("returns the prompt without waiting for the quiet interval", () => {
      expect(
        selectHint(bending("left"), nothingDiscovered, ctx({ quiet: false })),
      ).not.toBeNull();
    });
  });

  describe("in-gesture fold prompts", () => {
    function foldDragging(armed: boolean) {
      return idle("FaceDown", "FoldDragging", armed);
    }

    it("says to keep going while the swipe is short of the threshold", () => {
      expect(selectHint(foldDragging(false), nothingDiscovered, ctx())).toEqual(
        {
          id: "folding",
          line1: "Keep dragging up",
          line2: null,
          announce: false,
        },
      );
    });

    it("says releasing folds once the swipe is armed", () => {
      expect(selectHint(foldDragging(true), nothingDiscovered, ctx())).toEqual({
        id: "folding-armed",
        line1: "Release to Fold",
        line2: null,
        announce: false,
      });
    });

    it("returns both prompts regardless of the discovery set", () => {
      for (const armed of [false, true]) {
        expect(
          selectHint(foldDragging(armed), everythingDiscovered, ctx()),
        ).toEqual(selectHint(foldDragging(armed), nothingDiscovered, ctx()));
      }
    });

    it("returns the prompt from a revealed pair, which folds face-up", () => {
      expect(
        selectHint(
          idle("Revealed", "FoldDragging", true),
          nothingDiscovered,
          ctx(),
        )?.id,
      ).toBe("folding-armed");
    });

    it("shows nothing once the pair is on its way to the muck", () => {
      expect(selectHint(idle("Leaving"), nothingDiscovered, ctx())).toBeNull();
    });
  });

  describe("the Check confirmation", () => {
    it("says the Action landed, and says it to a screen reader too", () => {
      expect(
        selectHint(
          idle("FaceDown"),
          nothingDiscovered,
          ctx({
            checkConfirmed: true,
          }),
        ),
      ).toEqual({
        id: "checked",
        line1: "Checked",
        line2: "your turn passed on",
        announce: true,
      });
    });

    it("survives the pending Action it is confirming", () => {
      expect(
        selectHint(
          idle("FaceDown"),
          everythingDiscovered,
          ctx({ checkConfirmed: true, pending: true }),
        )?.id,
      ).toBe("checked");
    });

    it("outranks an in-gesture prompt, and never retires", () => {
      expect(
        selectHint(
          bending("left"),
          everythingDiscovered,
          ctx({ checkConfirmed: true }),
        )?.id,
      ).toBe("checked");
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

  it("shows nothing when no gesture is running and there is nothing left to teach", () => {
    for (const presentation of ["FaceDown", "Revealed", "Turning"] as const) {
      expect(
        selectHint(idle(presentation), everythingDiscovered, ctx()),
      ).toBeNull();
    }
  });

  it("shows nothing for a drag that is not a bend", () => {
    expect(
      selectHint(idle("FaceDown", "Ignored"), nothingDiscovered, ctx()),
    ).toBeNull();
  });
});

describe("selectHint, teaching hints", () => {
  const discovered = (...gestures: TeachableGesture[]) =>
    new Set<TeachableGesture>(gestures);

  it("teaches the bend first, both outcomes on one line", () => {
    expect(selectHint(idle("FaceDown"), nothingDiscovered, ctx())).toEqual({
      id: "teach-bend",
      line1: "Bend the bottom-right corner",
      line2: "release to peek · keep bending to reveal",
      announce: false,
    });
  });

  it("teaches the conceal tap next, and only while the pair is face-up", () => {
    expect(selectHint(idle("Revealed"), discovered("bend"), ctx())).toEqual({
      id: "teach-conceal",
      line1: "Tap to hide your cards",
      line2: "one tap is enough",
      announce: false,
    });
    expect(selectHint(idle("FaceDown"), discovered("bend"), ctx())?.id).toBe(
      "teach-check",
    );
  });

  it("teaches the double-tap Check next", () => {
    expect(
      selectHint(idle("FaceDown"), discovered("bend", "conceal"), ctx()),
    ).toEqual({
      id: "teach-check",
      line1: "Double-tap to Check",
      line2: "passes your turn to the next player",
      announce: false,
    });
  });

  it("teaches the fold swipe last", () => {
    expect(
      selectHint(
        idle("FaceDown"),
        discovered("bend", "conceal", "check"),
        ctx(),
      ),
    ).toEqual({
      id: "teach-fold",
      line1: "Swipe your cards up to Fold",
      line2: "release once they lift away",
      announce: false,
    });
  });

  it("puts the bend above the conceal where both are eligible", () => {
    expect(selectHint(idle("Revealed"), nothingDiscovered, ctx())?.id).toBe(
      "teach-bend",
    );
  });

  it("puts Check above Fold in the overlap", () => {
    expect(
      selectHint(idle("FaceDown"), discovered("bend", "conceal"), ctx())?.id,
    ).toBe("teach-check");
  });

  it("offers Check and Fold only where the Action is legal", () => {
    const known = discovered("bend", "conceal");
    expect(
      selectHint(idle("FaceDown"), known, ctx({ checkLegal: false }))?.id,
    ).toBe("teach-fold");
    expect(
      selectHint(
        idle("FaceDown"),
        known,
        ctx({ checkLegal: false, foldLegal: false }),
      ),
    ).toBeNull();
  });

  it("offers the bend and the conceal off-turn, where neither Action is legal", () => {
    const offTurn = ctx({ checkLegal: false, foldLegal: false });
    expect(selectHint(idle("FaceDown"), nothingDiscovered, offTurn)?.id).toBe(
      "teach-bend",
    );
    expect(selectHint(idle("Revealed"), discovered("bend"), offTurn)?.id).toBe(
      "teach-conceal",
    );
  });

  it("never re-offers a gesture the player has already found", () => {
    for (const presentation of ["FaceDown", "Revealed"] as const) {
      expect(
        selectHint(idle(presentation), everythingDiscovered, ctx()),
      ).toBeNull();
    }
  });

  it("shows nothing at all where the primary pointer is not coarse", () => {
    expect(
      selectHint(
        idle("FaceDown"),
        nothingDiscovered,
        ctx({ coarsePointer: false }),
      ),
    ).toBeNull();
  });

  it("shows nothing before the quiet interval", () => {
    expect(
      selectHint(idle("FaceDown"), nothingDiscovered, ctx({ quiet: false })),
    ).toBeNull();
  });

  it("shows nothing while an Action is pending, at showdown, or with no cards", () => {
    expect(
      selectHint(idle("FaceDown"), nothingDiscovered, ctx({ pending: true })),
    ).toBeNull();
    expect(
      selectHint(idle("FaceDown"), nothingDiscovered, ctx({ locked: true })),
    ).toBeNull();
    expect(selectHint(idle("Absent"), nothingDiscovered, ctx())).toBeNull();
  });

  it("yields to a gesture already underway, and to the pair leaving", () => {
    expect(selectHint(bending("left"), nothingDiscovered, ctx())?.id).toBe(
      "bending-left",
    );
    expect(
      selectHint(idle("FaceDown", "Pressing"), nothingDiscovered, ctx()),
    ).toBeNull();
    expect(selectHint(idle("Leaving"), nothingDiscovered, ctx())).toBeNull();
    expect(selectHint(idle("Turning"), nothingDiscovered, ctx())).toBeNull();
  });
});

describe("nextTeachable", () => {
  it("names the gesture whose eligibility the quiet interval is measured from", () => {
    const legal = { checkLegal: true, foldLegal: true };
    expect(nextTeachable(idle("FaceDown"), nothingDiscovered, legal)).toBe(
      "bend",
    );
    expect(
      nextTeachable(
        idle("Revealed"),
        new Set<TeachableGesture>(["bend"]),
        legal,
      ),
    ).toBe("conceal");
    expect(
      nextTeachable(idle("FaceDown"), everythingDiscovered, legal),
    ).toBeNull();
  });

  it("skips the Actions that are not legal right now", () => {
    const known = new Set<TeachableGesture>(["bend", "conceal"]);
    expect(
      nextTeachable(idle("FaceDown"), known, {
        checkLegal: false,
        foldLegal: true,
      }),
    ).toBe("fold");
    expect(
      nextTeachable(idle("FaceDown"), known, {
        checkLegal: false,
        foldLegal: false,
      }),
    ).toBeNull();
  });
});

describe("discoveredBy", () => {
  const faceDown = idle("FaceDown");

  it("counts a bend, a fold swipe, a conceal tap and a double-tap Check", () => {
    expect(discoveredBy({ type: "CLASSIFIED", as: "Bending" }, faceDown)).toBe(
      "bend",
    );
    expect(
      discoveredBy({ type: "CLASSIFIED", as: "FoldDragging" }, faceDown),
    ).toBe("fold");
    expect(discoveredBy({ type: "TAPPED" }, idle("Revealed"))).toBe("conceal");
    expect(discoveredBy({ type: "DOUBLE_TAPPED" }, faceDown)).toBe("check");
  });

  it("counts a tap only where it actually hides the cards", () => {
    expect(discoveredBy({ type: "TAPPED" }, faceDown)).toBeNull();
  });

  it("does not count a drag the recognizer ignored", () => {
    expect(
      discoveredBy({ type: "CLASSIFIED", as: "Ignored" }, faceDown),
    ).toBeNull();
  });

  it("does not count an Action taken from a button", () => {
    const fromButtons: readonly CardEvent[] = [
      { type: "PENDING_RESOLVED", hasCards: false },
      { type: "PENDING_RESOLVED", hasCards: true },
      { type: "CARDS_GONE" },
      { type: "DEALT" },
      { type: "SHOWDOWN_REVEAL" },
      { type: "ACTIVATED" },
    ];
    for (const event of fromButtons) {
      expect(discoveredBy(event, idle("Revealed"))).toBeNull();
    }
  });
});
