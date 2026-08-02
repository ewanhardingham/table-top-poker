import { describe, expect, it } from "vitest";
import {
  initialCardState,
  reduce,
  type CardEvent,
  type CardState,
  type Presentation,
  type Recognizer,
} from "./cardState.js";

function state(
  presentation: Presentation,
  recognizer: Recognizer = "Idle",
  armed = false,
): CardState {
  return { presentation, recognizer, armed, locked: false };
}

const reset: CardEvent = { type: "RESET" };

/** A showdown-locked pair: face-up and inert. */
function lockedState(presentation: Presentation): CardState {
  return { ...state(presentation), locked: true };
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

  it("starts Revealed and inert when mounting into a locked (showdown) pair", () => {
    expect(initialCardState({ hasCards: true, locked: true })).toEqual(
      lockedState("Revealed"),
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

  describe("BEND_CROSSED", () => {
    it("commits the bend into the turn, so the peel lands face-up", () => {
      expect(
        reduce(state("Peeking", "Bending"), { type: "BEND_CROSSED" }),
      ).toEqual(state("Turning", "Committed"));
    });

    it("is a no-op for a drag that is not a live bend", () => {
      for (const recognizer of [
        "Idle",
        "Pressing",
        "FoldDragging",
        "Ignored",
        "Committed",
      ] as const) {
        const before = state("Peeking", recognizer);
        expect(reduce(before, { type: "BEND_CROSSED" })).toEqual(before);
      }
    });

    it("survives the release that follows it — the commit is on crossing", () => {
      // Lifting a finger after the threshold must not put the cards back down:
      // `Turning` is a point of no return, so release only clears the
      // recognizer and the flip finishes on its own.
      const committed = reduce(state("Peeking", "Bending"), {
        type: "BEND_CROSSED",
      });
      const released = reduce(committed, { type: "RELEASED" });

      expect(released.presentation).toBe("Turning");
      expect(released.recognizer).toBe("Idle");
      expect(reduce(released, { type: "TURN_FINISHED" }).presentation).toBe(
        "Revealed",
      );
    });
  });

  describe("SHOWDOWN_REVEAL", () => {
    it("turns a live seat's cards face-up through the same flip the bend produces", () => {
      for (const presentation of ["FaceDown", "Peeking"] as const) {
        expect(
          reduce(state(presentation), { type: "SHOWDOWN_REVEAL" }),
        ).toEqual(lockedState("Turning"));
      }
    });

    it("lets a flip already in flight finish rather than restarting it", () => {
      expect(reduce(state("Turning"), { type: "SHOWDOWN_REVEAL" })).toEqual(
        lockedState("Turning"),
      );
    });

    it("locks an already-revealed pair without replaying the flip", () => {
      expect(reduce(state("Revealed"), { type: "SHOWDOWN_REVEAL" })).toEqual(
        lockedState("Revealed"),
      );
    });

    it("never reveals a seat holding no cards — folding is final", () => {
      expect(reduce(state("Absent"), { type: "SHOWDOWN_REVEAL" })).toEqual(
        state("Absent"),
      );
    });

    it("never reveals a pair still flying to the muck", () => {
      expect(reduce(state("Leaving"), { type: "SHOWDOWN_REVEAL" })).toEqual(
        state("Leaving"),
      );
    });

    it("clears any gesture the player still had a finger on", () => {
      const bending = state("Peeking", "Bending");
      expect(reduce(bending, { type: "SHOWDOWN_REVEAL" })).toEqual(
        lockedState("Turning"),
      );
    });
  });

  describe("a locked pair", () => {
    it("is inert to activation — the hand is already decided", () => {
      for (const presentation of ["Revealed", "Turning"] as const) {
        expect(
          reduce(lockedState(presentation), { type: "ACTIVATED" }),
        ).toEqual(lockedState(presentation));
      }
    });

    it("is inert to a finger as well as to the keyboard", () => {
      // The lock is enforced once, above every arm, so a gesture cannot even
      // begin against a decided hand: no press, and therefore nothing for a
      // classification to land on.
      const locked = lockedState("Revealed");
      expect(reduce(locked, { type: "PRESSED" })).toEqual(locked);
      expect(reduce(locked, { type: "CLASSIFIED", as: "Bending" })).toEqual(
        locked,
      );
      expect(reduce(locked, { type: "RELEASED" })).toEqual(locked);
      expect(reduce(locked, { type: "CANCELLED" })).toEqual(locked);
    });

    it("still lands its own flip on Revealed, and stays locked", () => {
      expect(reduce(lockedState("Turning"), { type: "TURN_FINISHED" })).toEqual(
        lockedState("Revealed"),
      );
    });

    it("is not what a committed gesture produces — only showdown locks", () => {
      // The recognizer reaches `Committed` on an ordinary bend past the reveal
      // threshold. A player who bent their way to face-up must still be able
      // to conceal, so the lock cannot live in the recognizer.
      const bendCommitted = state("Revealed", "Committed");
      expect(reduce(bendCommitted, { type: "ACTIVATED" }).presentation).toBe(
        "FaceDown",
      );
    });

    it("unlocks on the next hand boundary, face-down and live again", () => {
      expect(reduce(lockedState("Revealed"), { type: "DEALT" })).toEqual(
        state("FaceDown"),
      );
      expect(reduce(lockedState("Revealed"), { type: "CARDS_GONE" })).toEqual(
        state("Absent"),
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

  describe("PRESSED", () => {
    it("takes the pointer from a settled pair", () => {
      expect(reduce(state("FaceDown"), { type: "PRESSED" })).toEqual(
        state("FaceDown", "Pressing"),
      );
      expect(reduce(state("Revealed"), { type: "PRESSED" })).toEqual(
        state("Revealed", "Pressing"),
      );
    });

    it("ignores a second pointer landing mid-gesture — first pointer wins", () => {
      for (const recognizer of [
        "Pressing",
        "Bending",
        "FoldDragging",
        "Ignored",
        "Committed",
      ] as const) {
        const active = state("Peeking", recognizer);
        expect(reduce(active, { type: "PRESSED" })).toEqual(active);
      }
    });

    it("is a no-op with no cards in hand, and while the pair is leaving", () => {
      expect(reduce(state("Absent"), { type: "PRESSED" })).toEqual(
        state("Absent"),
      );
      expect(reduce(state("Leaving"), { type: "PRESSED" })).toEqual(
        state("Leaving"),
      );
    });
  });

  describe("CLASSIFIED", () => {
    it("opens the peel and moves the recognizer in one reduce", () => {
      // Coupled, and therefore atomic: there is no intermediate state in which
      // the recognizer is bending but the pair still presents face-down.
      expect(
        reduce(state("FaceDown", "Pressing"), {
          type: "CLASSIFIED",
          as: "Bending",
        }),
      ).toEqual(state("Peeking", "Bending"));
    });

    it("starts a fold drag without disturbing presentation", () => {
      expect(
        reduce(state("FaceDown", "Pressing"), {
          type: "CLASSIFIED",
          as: "FoldDragging",
        }),
      ).toEqual(state("FaceDown", "FoldDragging"));
      expect(
        reduce(state("Revealed", "Pressing"), {
          type: "CLASSIFIED",
          as: "FoldDragging",
        }),
      ).toEqual(state("Revealed", "FoldDragging"));
    });

    it("ignores an ambiguous drag without disturbing presentation", () => {
      expect(
        reduce(state("FaceDown", "Pressing"), {
          type: "CLASSIFIED",
          as: "Ignored",
        }),
      ).toEqual(state("FaceDown", "Ignored"));
    });

    it("is accepted only from Pressing, so classification is sticky", () => {
      const bending = state("Peeking", "Bending");
      expect(
        reduce(bending, { type: "CLASSIFIED", as: "FoldDragging" }),
      ).toEqual(bending);
      expect(reduce(bending, { type: "CLASSIFIED", as: "Ignored" })).toEqual(
        bending,
      );
    });

    it("leaves Ignored terminal: a curve upward cannot become a fold", () => {
      const ignored = state("FaceDown", "Ignored");
      expect(
        reduce(ignored, { type: "CLASSIFIED", as: "FoldDragging" }),
      ).toEqual(ignored);
    });

    it("is a no-op from Idle, so a stray classification cannot start a gesture", () => {
      expect(
        reduce(state("FaceDown"), { type: "CLASSIFIED", as: "Bending" }),
      ).toEqual(state("FaceDown"));
    });
  });

  describe("RELEASED and CANCELLED", () => {
    const endings = [{ type: "RELEASED" }, { type: "CANCELLED" }] as const;

    it("closes the peek, so a glance leaves nothing exposed", () => {
      for (const ending of endings) {
        expect(reduce(state("Peeking", "Bending"), ending)).toEqual(
          state("FaceDown"),
        );
      }
    });

    it("clears an ignored drag without changing what the pair is showing", () => {
      for (const ending of endings) {
        expect(reduce(state("Revealed", "Ignored"), ending)).toEqual(
          state("Revealed"),
        );
        expect(reduce(state("FaceDown", "Ignored"), ending)).toEqual(
          state("FaceDown"),
        );
      }
    });

    it("does not interrupt a committed turn — the flip finishes", () => {
      for (const ending of endings) {
        expect(reduce(state("Turning", "Committed"), ending)).toEqual(
          state("Turning"),
        );
      }
    });

    it("returns a below-threshold fold drag to the face it started from", () => {
      // A fold drag moves the pair around without turning it over, so the
      // presentation it was carrying *is* the stable state to restore — from
      // face-down and from revealed alike.
      for (const ending of endings) {
        expect(reduce(state("FaceDown", "FoldDragging"), ending)).toEqual(
          state("FaceDown"),
        );
        expect(reduce(state("Revealed", "FoldDragging"), ending)).toEqual(
          state("Revealed"),
        );
      }
    });

    it("commits nothing from an unclassified press", () => {
      for (const ending of endings) {
        expect(reduce(state("Revealed", "Pressing"), ending)).toEqual(
          state("Revealed"),
        );
      }
    });

    it("does not call a committed fold back from the muck", () => {
      for (const ending of endings) {
        expect(reduce(state("Leaving", "Committed"), ending)).toEqual(
          state("Leaving"),
        );
      }
    });

    it("is a no-op when no gesture is live", () => {
      for (const ending of endings) {
        expect(reduce(state("Revealed"), ending)).toEqual(state("Revealed"));
      }
    });

    it("is a no-op with no cards in hand", () => {
      for (const ending of endings) {
        expect(reduce(state("Absent"), ending)).toEqual(state("Absent"));
      }
    });

    it("is a no-op while locked — a decided hand has no gesture to cancel", () => {
      for (const ending of endings) {
        expect(reduce(lockedState("Revealed"), ending)).toEqual(
          lockedState("Revealed"),
        );
      }
    });
  });

  describe("RESET", () => {
    it("lands on FaceDown from every presentation, cancelling any gesture", () => {
      const gestures = [
        state("FaceDown", "Pressing"),
        state("Peeking", "Bending"),
        state("Turning", "Committed"),
        state("Revealed", "FoldDragging"),
        state("Revealed", "FoldDragging", true),
        state("Leaving", "Committed"),
      ];
      for (const active of gestures) {
        expect(reduce(active, reset)).toEqual(state("FaceDown"));
      }
    });

    it("snaps out of Turning rather than letting the flip finish", () => {
      // The one thing that interrupts a turn: no face-up frame of the previous
      // hand may survive into the next. Landing on `FaceDown` is also what
      // makes it a snap — `BendableCard` animates only while `Turning`.
      expect(reduce(state("Turning", "Committed"), reset)).toEqual(
        state("FaceDown"),
      );
    });

    it("leaves a seat holding no cards holding none", () => {
      // There is nothing to turn face-down. Every other presentation implies
      // cards in hand; `Absent` is the one that would be a lie.
      expect(reduce(state("Absent"), reset)).toEqual(state("Absent"));
    });

    it("does not disturb a decided showdown", () => {
      // Backgrounding the app must not conceal a public reveal — and a reload
      // remounts straight back to `Revealed` off the `locked` prop, so
      // honouring `RESET` here would make the two paths disagree.
      for (const presentation of ["Revealed", "Turning"] as const) {
        expect(reduce(lockedState(presentation), reset)).toEqual(
          lockedState(presentation),
        );
      }
    });
  });
});
