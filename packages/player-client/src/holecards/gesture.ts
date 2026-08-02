import type { CardEvent } from "./cardState.js";
import { classify, type Classification } from "./classify.js";
import { MOVE_SLOP_PX, REVEAL_THRESHOLD } from "./constants.js";
import { bendAxis, bendProgress, type BendAxis } from "./geometry.js";

/**
 * A live pointer gesture, as a value (Phase 3 spec #138 §4, §13).
 *
 * The hook holds one of these in a ref and never in React state — which is the
 * whole point. Splitting by **cardinality of change**, the discrete facts (has
 * it been classified, has a threshold been crossed) become reducer events, and
 * the continuous ones (peel progress, drag offset) become `MotionValue`s. A
 * finger dragging across the pair therefore produces no events at all between
 * threshold crossings, so it causes **zero** React re-renders, and `Hand`,
 * `ActionBar` and the turn banner are untouched by card handling.
 */
export interface GestureSession {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  /** The press landed on the bend affordance in a card's corner. */
  readonly fromBendZone: boolean;
  /** The pair was already face-up when the press landed. */
  readonly startedRevealed: boolean;
  /** `null` until the drag passes the slop; set exactly once thereafter. */
  readonly classification: Classification | null;
  /**
   * Whether the peel has already reached the reveal threshold. One-way: the
   * commit happens *on crossing*, not on release, so dragging back afterwards
   * cannot un-commit it and must not re-announce it either.
   */
  readonly crossed: boolean;
  /**
   * Whether the fold drag is currently past its threshold. Deliberately **not**
   * one-way, unlike `crossed`: crossing the fold line only arms, and the
   * commitment is the release (§10) — so pulling the cards back down disarms
   * again, and the player can always change their mind by putting them down.
   */
  readonly armed: boolean;
}

/** Continuous peel values, destined for `MotionValue`s rather than state. */
export interface BendMotion {
  readonly progress: number;
  readonly axis: BendAxis;
}

/** How far the pair has been carried towards the muck, in px. Never positive. */
export interface FoldMotion {
  readonly offset: number;
}

/** What the recognizer needs from the surrounding view to answer a move. */
export interface GestureContext {
  readonly foldLegal: boolean;
  /** Upward travel that arms the Fold, from `foldThreshold` (§15). */
  readonly foldThresholdPx: number;
}

export interface GestureStep {
  readonly session: GestureSession;
  readonly events: readonly CardEvent[];
  /** `null` when this move changes nothing continuous. */
  readonly bend: BendMotion | null;
  /** `null` unless this move is carrying the pair towards the muck. */
  readonly fold: FoldMotion | null;
}

export function beginGesture(press: {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly fromBendZone: boolean;
  readonly startedRevealed: boolean;
}): GestureSession {
  return {
    pointerId: press.pointerId,
    originX: press.x,
    originY: press.y,
    fromBendZone: press.fromBendZone,
    startedRevealed: press.startedRevealed,
    classification: null,
    crossed: false,
    armed: false,
  };
}

/**
 * Fold legality can disappear while the pointer is still moving. The view
 * event disarms the lifecycle reducer and this keeps the synchronous session
 * used by `endGesture` in agreement without ending the drag.
 */
function disarmGesture(session: GestureSession): GestureSession {
  return session.armed ? { ...session, armed: false } : session;
}

/**
 * Apply a view lifecycle event to the live pointer session. Server events that
 * end or lock the pair invalidate the pointer as well; otherwise a removed
 * button could leave a captured pointer blocking the next hand.
 */
export function applyViewEvent(
  session: GestureSession | null,
  event: CardEvent,
): GestureSession | null {
  switch (event.type) {
    case "CARDS_GONE":
    case "DEALT":
    case "RESET":
    case "SHOWDOWN_REVEAL":
      return null;
    case "FOLD_DISARMED":
      return session === null ? null : disarmGesture(session);
    default:
      return session;
  }
}

/**
 * Advance a gesture to a new pointer position.
 *
 * Nothing is classified below the slop, so a tap with a wobble still reads as
 * a tap. Past it, `classify` runs **once** and its answer is kept for the rest
 * of the gesture — this function never asks a second time, and the reducer
 * refuses a second answer anyway.
 */
export function moveGesture(
  session: GestureSession,
  point: { readonly x: number; readonly y: number },
  ctx: GestureContext,
): GestureStep {
  const dx = point.x - session.originX;
  const dy = point.y - session.originY;

  if (session.classification === null) {
    if (Math.hypot(dx, dy) <= MOVE_SLOP_PX) {
      return { session, events: [], bend: null, fold: null };
    }
    const classification = classify({
      fromBendZone: session.fromBendZone,
      alreadyRevealed: session.startedRevealed,
      dx,
      dy,
      // Fold legality admits the classification. Once a drag exists, the
      // prop-change adapter disarms it when the view withdraws legality; the
      // live fold step also gates threshold arming on the latest value.
      foldLegal: ctx.foldLegal,
    });
    return step(
      { ...session, classification },
      dx,
      dy,
      [{ type: "CLASSIFIED", as: classification }],
      ctx,
    );
  }

  // The steady state of a drag: continuous values only, and no events — the
  // reducer is not told that a finger moved.
  return step(session, dx, dy, [], ctx);
}

/**
 * One advanced step, plus the threshold crossing if this move is the one that
 * reaches it. A flick fast enough to classify and cross in a single move
 * emits both, in that order, and the reducer applies them in that order.
 */
function step(
  session: GestureSession,
  dx: number,
  dy: number,
  events: readonly CardEvent[],
  ctx: GestureContext,
): GestureStep {
  if (session.classification === "FoldDragging") {
    return foldStep(session, dy, events, ctx);
  }

  // Past the commit the turn owns the motion: the peel finishes on its own
  // schedule, so the finger stops driving it and a release cannot pull it back.
  if (session.crossed) return { session, events, bend: null, fold: null };

  const bend = bendFor(session, dx, dy);
  if (bend === null || bend.progress < REVEAL_THRESHOLD) {
    return { session, events, bend, fold: null };
  }
  return {
    session: { ...session, crossed: true },
    events: [...events, { type: "BEND_CROSSED" }],
    bend,
    fold: null,
  };
}

/**
 * The pair following the finger towards the muck, and the arming that turns
 * that motion into an offer.
 *
 * The threshold is crossed **both ways**: a player who drags past it and then
 * changes their mind disarms by putting the cards back down, which is the whole
 * of §10's promise that the commitment is on release and never on crossing the
 * line. Card motion plus the in-gesture text is the entire arming signal — on
 * iPhone/Safari there is no haptic at all — so the two must never disagree.
 */
function foldStep(
  session: GestureSession,
  dy: number,
  events: readonly CardEvent[],
  ctx: GestureContext,
): GestureStep {
  // Upward only: the cards go away from the player, and a drag that wanders
  // back below where it started must not shove them down the screen.
  const offset = Math.min(0, dy);
  const fold: FoldMotion = { offset };
  const armed = ctx.foldLegal && -offset >= ctx.foldThresholdPx;
  if (armed === session.armed) return { session, events, bend: null, fold };
  return {
    session: { ...session, armed },
    events: [...events, { type: armed ? "FOLD_ARMED" : "FOLD_DISARMED" }],
    bend: null,
    fold,
  };
}

function bendFor(
  session: GestureSession,
  dx: number,
  dy: number,
): BendMotion | null {
  if (session.classification !== "Bending") return null;
  return { progress: bendProgress(dx, dy), axis: bendAxis(dx, dy) };
}

export interface GestureEnd {
  readonly events: readonly CardEvent[];
  /**
   * Whether this release is the completing one that sends the Fold (§10).
   *
   * Answered from the **session** rather than from the reducer's state,
   * because the caller has to act on it synchronously and a `useReducer`
   * state read in a pointer handler can lag a threshold crossing that
   * happened one pointer event ago. The reducer reaches the same answer from
   * its own `armed` flag — see `releaseCommitsFold` — and the two agree
   * because both are driven by the same `FOLD_ARMED`/`FOLD_DISARMED` events.
   */
  readonly commitsFold: boolean;
}

/**
 * End a gesture. A release that never classified is a tap; a release from
 * `Ignored` is not — a drag that started sideways or downward does nothing at
 * all, including on the way out.
 *
 * **Cancellation commits nothing**, however far the cards were carried: the
 * player never completed the gesture, and Actions commit on the completing
 * release alone.
 */
export function endGesture(
  session: GestureSession,
  { cancelled }: { readonly cancelled: boolean },
): GestureEnd {
  if (cancelled) {
    return { events: [{ type: "CANCELLED" }], commitsFold: false };
  }
  if (session.classification === null) {
    return {
      events: [{ type: "RELEASED" }, { type: "TAPPED" }],
      commitsFold: false,
    };
  }
  return {
    events: [{ type: "RELEASED" }],
    commitsFold: session.classification === "FoldDragging" && session.armed,
  };
}
