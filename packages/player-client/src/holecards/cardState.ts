/**
 * The Hole-card lifecycle (Phase 3 spec #138 §3): Presentation and Recognizer
 * modelled as orthogonal machines but reduced by **one** pure function, so a
 * coupled event applies atomically and cannot half-land.
 *
 * Nothing here touches React or the DOM — every rule in the behaviour contract
 * is verifiable as a function call, which is why the module needs no store, no
 * socket and no simulated pointer to test.
 *
 * `CardState` and `CardEvent` are **complete**: every event name the phase
 * needs is declared here, including the ones no arm answers yet. Later slices
 * add reducer arms against this shape rather than reshaping it, so the
 * gestures that follow are additions rather than surgery.
 *
 * Answered so far: the deal-in, the emptying and the keyboard reveal/conceal
 * toggle (#139), the showdown reveal and lock (#140), and the press, the
 * classification and the release that make up a bend (#141).
 */

import type { Classification } from "./classify.js";

/** Pair-scoped: both cards always share one presentation. */
export type Presentation =
  "Absent" | "FaceDown" | "Peeking" | "Turning" | "Revealed" | "Leaving";

export type Recognizer =
  "Idle" | "Pressing" | "Bending" | "FoldDragging" | "Ignored" | "Committed";

export interface CardState {
  readonly presentation: Presentation;
  readonly recognizer: Recognizer;
  /**
   * Whether releasing now would commit the Fold. Only ever true while
   * `FoldDragging` — crossing the threshold arms, and release commits (§10).
   */
  readonly armed: boolean;
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

export type CardEvent =
  /** Cards arrived: a fresh deal, or a new hand's cards swapping in. */
  | { readonly type: "DEALT" }
  /** Cards left: folded, mucked, or dealt out. */
  | { readonly type: "CARDS_GONE" }
  /** The pair was activated as a button — Enter, Space or a click. */
  | { readonly type: "ACTIVATED" }
  /** The committed flip to face-up finished animating. */
  | { readonly type: "TURN_FINISHED" }
  /** A pointer landed on the pair. */
  | { readonly type: "PRESSED" }
  /** The drag passed the slop and resolved, once and for all, to one thing. */
  | { readonly type: "CLASSIFIED"; readonly as: Classification }
  /** The peel passed the reveal threshold: recognizer and presentation both. */
  | { readonly type: "BEND_CROSSED" }
  /** The fold drag passed the distance threshold; releasing now commits. */
  | { readonly type: "FOLD_ARMED" }
  /** Fold stopped being legal mid-drag; the cards keep tracking regardless. */
  | { readonly type: "FOLD_DISARMED" }
  /** The pointer completing the gesture lifted. */
  | { readonly type: "RELEASED" }
  /** The browser took the pointer away, or capture was lost. */
  | { readonly type: "CANCELLED" }
  /** A hand boundary, a reload, or the app leaving the foreground. */
  | { readonly type: "RESET" }
  /** A single tap landed on the pair. */
  | { readonly type: "TAPPED" }
  /** A second tap landed inside the double-tap window. */
  | { readonly type: "DOUBLE_TAPPED" }
  /** An in-flight Action resolved, one way or the other. */
  | { readonly type: "PENDING_RESOLVED"; readonly hasCards: boolean }
  /** Showdown reached with this seat still live: turn face-up and lock. */
  | { readonly type: "SHOWDOWN_REVEAL" };

/** The live, un-gestured, unlocked pair every hand starts from. */
function idle(presentation: Presentation): CardState {
  return { presentation, recognizer: "Idle", armed: false, locked: false };
}

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
  if (!hasCards) return idle("Absent");
  if (locked) return { ...idle("Revealed"), locked: true };
  return idle("FaceDown");
}

/**
 * Where a gesture puts the pair down. `Peeking` is the only presentation a
 * gesture creates that is not stable in itself: a peek is held open by the
 * finger, so letting go — for any reason — closes it, and a glance costs the
 * player nothing and leaves nothing exposed.
 */
function settled(state: CardState): CardState {
  return {
    ...state,
    presentation:
      state.presentation === "Peeking" ? "FaceDown" : state.presentation,
    recognizer: "Idle",
    armed: false,
  };
}

function classified(state: CardState, as: Classification): CardState {
  switch (as) {
    case "Bending":
      // Coupled, and therefore atomic: one reduce moves the recognizer *and*
      // opens the peel. There is no frame in which the pair is bending but
      // still presenting face-down.
      return {
        ...state,
        presentation: "Peeking",
        recognizer: "Bending",
        armed: false,
      };
    case "FoldDragging":
      return { ...state, recognizer: "FoldDragging", armed: false };
    case "Ignored":
      return { ...state, recognizer: "Ignored", armed: false };
  }
}

export function reduce(state: CardState, event: CardEvent): CardState {
  if (state.locked && !survivesLock(event)) return state;

  switch (event.type) {
    case "DEALT":
      // Unconditional, from every presentation: deal detection is what makes
      // every hand start face-down, so no face-up frame of the previous hand
      // can survive into the next one. It also ends a showdown lock — a new
      // hand is live again by definition.
      return idle("FaceDown");

    case "CARDS_GONE":
      return idle("Absent");

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

    case "PRESSED":
      // **First pointer wins** (§4): while a gesture is live, a second finger
      // landing is ignored until the first releases or cancels. Latest-pointer
      // -wins would let a stray thumb silently retarget a fold drag.
      if (state.recognizer !== "Idle") return state;
      // Nothing to handle: no cards, or a Fold already in flight (§7).
      if (state.presentation === "Absent" || state.presentation === "Leaving") {
        return state;
      }
      return { ...state, recognizer: "Pressing" };

    case "CLASSIFIED":
      // **Stickiness lives here.** `classify` is run once by the pointer
      // handler and never revisited; the reducer enforces that by accepting
      // the result only from `Pressing`, so a second classification — however
      // it arises — is a no-op, and `Ignored` stays terminal until release.
      if (state.recognizer !== "Pressing") return state;
      return classified(state, event.as);

    case "RELEASED":
    case "CANCELLED":
      // `Turning` is a point of no return for both lift and cancellation: the
      // flip completes, because cancellation must restore *stable*
      // presentation and mid-turn is not stable (§10). A `Committed`
      // recognizer therefore only clears itself.
      if (state.recognizer === "Idle") return state;
      if (state.recognizer === "Committed") {
        return { ...state, recognizer: "Idle", armed: false };
      }
      return settled(state);

    case "BEND_CROSSED":
      // The peel reaching the threshold *is* the commit (§3): the same sheet
      // carries on past the opposite corner and lands face-up, so there is no
      // separate flip to start and nothing for a release to undo. Only a live
      // bend can cross — a fold drag or an ignored drag never peels.
      if (state.recognizer !== "Bending") return state;
      return { ...state, presentation: "Turning", recognizer: "Committed" };

    // Declared in the union so the shape is settled up front, and answered by
    // the slices that own them: tap-conceal (#142), cancellation and resets
    // (#143), the double-tap Check (#144), the fold drag (#145) and fold
    // disarming (#146).
    case "FOLD_ARMED":
    case "FOLD_DISARMED":
    case "RESET":
    case "TAPPED":
    case "DOUBLE_TAPPED":
    case "PENDING_RESOLVED":
      return state;

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
        armed: false,
        locked: true,
      };
  }
}
