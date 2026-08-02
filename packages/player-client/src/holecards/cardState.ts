/**
 * The Hole-card lifecycle (Phase 3 spec #138 §3): Presentation and Recognizer
 * modelled as orthogonal machines but reduced by **one** pure function, so a
 * coupled event applies atomically and cannot half-land.
 *
 * Nothing here touches React or the DOM — every rule in the behaviour contract
 * is verifiable as a function call, which is why the module needs no store, no
 * socket and no simulated pointer to test.
 *
 * This slice carries the deal-in, the emptying, the keyboard reveal/conceal
 * toggle (#139) and the showdown reveal and lock (#140). Bend, tap and drag
 * arms are added by later tickets against this same shape.
 */

/** Pair-scoped: both cards always share one presentation. */
export type Presentation =
  "Absent" | "FaceDown" | "Peeking" | "Turning" | "Revealed" | "Leaving";

export type Recognizer =
  "Idle" | "Pressing" | "Bending" | "FoldDragging" | "Ignored" | "Committed";

export interface CardState {
  readonly presentation: Presentation;
  readonly recognizer: Recognizer;
  /**
   * Showdown reached with this seat still live: the hand is decided, so the
   * pair is face-up and inert (story 48).
   *
   * Its own field rather than a recognizer state, because the lock is not a
   * gesture outcome — `Committed` is what an ordinary bend past the reveal
   * threshold enters, and a Player who bent their way to face-up must not end
   * up holding a pair they can no longer conceal. It is not a presentation
   * either: `Revealed` is reachable both ways and only one of them is final.
   */
  readonly locked: boolean;
}

/** The live, un-gestured pair every hand starts from. */
const idle = { recognizer: "Idle", locked: false } as const;

export type CardEvent =
  /** Cards arrived: a fresh deal, or a new hand's cards swapping in. */
  | { readonly type: "DEALT" }
  /** Cards left: folded, mucked, or dealt out. */
  | { readonly type: "CARDS_GONE" }
  /** The pair was activated as a button — Enter, Space or a click. */
  | { readonly type: "ACTIVATED" }
  /** The committed flip to face-up finished animating. */
  | { readonly type: "TURN_FINISHED" }
  /** Showdown reached with this seat still live: turn face-up and lock. */
  | { readonly type: "SHOWDOWN_REVEAL" };

/**
 * Whether a locked pair still hears an event. Only four do, and none of them
 * is the Player handling the cards: the two hand boundaries that end the lock,
 * the reveal that starts it, and the flip it starts finishing.
 *
 * Stated as one allow-list and enforced once, at the top of `reduce`, rather
 * than arm by arm — so the tap and gesture events later tickets add are inert
 * against a decided hand by default, and cannot reach one by being forgotten.
 * A later ticket adding an event that a locked pair *should* hear (`RESET`,
 * say, if backgrounding the app is judged to outrank a settled showdown) has
 * to say so here, which is the point.
 */
function survivesLock(event: CardEvent): boolean {
  switch (event.type) {
    case "DEALT":
    case "CARDS_GONE":
    case "SHOWDOWN_REVEAL":
    case "TURN_FINISHED":
      return true;
    default:
      return false;
  }
}

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
  if (!hasCards) return { ...idle, presentation: "Absent" };
  if (locked) {
    return { presentation: "Revealed", recognizer: "Idle", locked: true };
  }
  return { ...idle, presentation: "FaceDown" };
}

export function reduce(state: CardState, event: CardEvent): CardState {
  if (state.locked && !survivesLock(event)) return state;

  switch (event.type) {
    case "DEALT":
      // Unconditional, from every presentation: deal detection is what makes
      // every hand start face-down, so no face-up frame of the previous hand
      // can survive into the next one. It also ends a showdown lock — a new
      // hand is live again by definition.
      return { ...idle, presentation: "FaceDown" };

    case "CARDS_GONE":
      return { ...idle, presentation: "Absent" };

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

    case "SHOWDOWN_REVEAL":
      // Folding is final (story 49), whether the cards are already gone or
      // still flying to the muck. The adapter withholds the event for a
      // folded-out seat anyway; the reducer holds the guarantee so it does not
      // rest on being called correctly.
      if (state.presentation === "Absent" || state.presentation === "Leaving") {
        return state;
      }
      return {
        // The **same** animated flip the bend commits to, so showdown reads
        // as the same object behaving (story 47) — except when the Player
        // already turned the cards over themselves, where re-flipping a
        // face-up pair would be motion with nothing to say.
        presentation:
          state.presentation === "Revealed" ? "Revealed" : "Turning",
        // Whatever the Player had a finger on is over; the hand is decided.
        recognizer: "Idle",
        locked: true,
      };
  }
}
