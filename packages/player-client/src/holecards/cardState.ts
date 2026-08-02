/**
 * The Hole-card lifecycle (Phase 3 spec #138 §3): Presentation and Recognizer
 * modelled as orthogonal machines but reduced by **one** pure function, so a
 * coupled event applies atomically and cannot half-land.
 *
 * Nothing here touches React or the DOM — every rule in the behaviour contract
 * is verifiable as a function call, which is why the module needs no store, no
 * socket and no simulated pointer to test.
 *
 * This slice (#139) carries the deal-in, the emptying, and the keyboard
 * reveal/conceal toggle. Bend, tap, drag and showdown arms are added by later
 * tickets against this same shape.
 */

/** Pair-scoped: both cards always share one presentation. */
export type Presentation =
  "Absent" | "FaceDown" | "Peeking" | "Turning" | "Revealed" | "Leaving";

export type Recognizer =
  "Idle" | "Pressing" | "Bending" | "FoldDragging" | "Ignored" | "Committed";

export interface CardState {
  readonly presentation: Presentation;
  readonly recognizer: Recognizer;
}

export type CardEvent =
  /** Cards arrived: a fresh deal, or a new hand's cards swapping in. */
  | { readonly type: "DEALT" }
  /** Cards left: folded, mucked, or dealt out. */
  | { readonly type: "CARDS_GONE" }
  /** The pair was activated as a button — Enter, Space or a click. */
  | { readonly type: "ACTIVATED" }
  /** The committed flip to face-up finished animating. */
  | { readonly type: "TURN_FINISHED" };

/**
 * Mount state. A pair that mounts holding cards has not been dealt in as far
 * as this module is concerned — there is no deal-in event to observe — so it
 * simply starts face-down, and a locked (showdown) pair starts face-up.
 */
export function initialCardState({
  hasCards,
  locked,
}: {
  readonly hasCards: boolean;
  readonly locked: boolean;
}): CardState {
  if (!hasCards) return { presentation: "Absent", recognizer: "Idle" };
  return {
    presentation: locked ? "Revealed" : "FaceDown",
    recognizer: "Idle",
  };
}

export function reduce(state: CardState, event: CardEvent): CardState {
  switch (event.type) {
    case "DEALT":
      // Unconditional, from every presentation: deal detection is what makes
      // every hand start face-down, so no face-up frame of the previous hand
      // can survive into the next one.
      return { presentation: "FaceDown", recognizer: "Idle" };

    case "CARDS_GONE":
      return { presentation: "Absent", recognizer: "Idle" };

    case "ACTIVATED":
      // Reveal is a flip; conceal is instant. `Turning` is revealing-only —
      // there is no concealing flip, and an activation mid-turn is dropped
      // rather than queued.
      if (state.presentation === "FaceDown") {
        return { ...state, presentation: "Turning" };
      }
      if (state.presentation === "Revealed") {
        return { ...state, presentation: "FaceDown" };
      }
      return state;

    case "TURN_FINISHED":
      return state.presentation === "Turning"
        ? { ...state, presentation: "Revealed" }
        : state;
  }
}
