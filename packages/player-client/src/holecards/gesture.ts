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
}

/** Continuous peel values, destined for `MotionValue`s rather than state. */
export interface BendMotion {
  readonly progress: number;
  readonly axis: BendAxis;
}

export interface GestureStep {
  readonly session: GestureSession;
  readonly events: readonly CardEvent[];
  /** `null` when this move changes nothing continuous. */
  readonly bend: BendMotion | null;
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
  };
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
  ctx: { readonly foldLegal: boolean },
): GestureStep {
  const dx = point.x - session.originX;
  const dy = point.y - session.originY;

  if (session.classification === null) {
    if (Math.hypot(dx, dy) <= MOVE_SLOP_PX) {
      return { session, events: [], bend: null };
    }
    const classification = classify({
      fromBendZone: session.fromBendZone,
      alreadyRevealed: session.startedRevealed,
      dx,
      dy,
      // Fold legality is sampled once, here, and never re-read. A drag that
      // outlives the player's turn disarms (§6); it does not reclassify.
      foldLegal: ctx.foldLegal,
    });
    return step({ ...session, classification }, dx, dy, [
      { type: "CLASSIFIED", as: classification },
    ]);
  }

  // The steady state of a drag: continuous values only, and no events — the
  // reducer is not told that a finger moved.
  return step(session, dx, dy, []);
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
): GestureStep {
  // Past the commit the turn owns the motion: the peel finishes on its own
  // schedule, so the finger stops driving it and a release cannot pull it back.
  if (session.crossed) return { session, events, bend: null };

  const bend = bendFor(session, dx, dy);
  if (bend === null || bend.progress < REVEAL_THRESHOLD) {
    return { session, events, bend };
  }
  return {
    session: { ...session, crossed: true },
    events: [...events, { type: "BEND_CROSSED" }],
    bend,
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

/**
 * End a gesture. A release that never classified is a tap; a release from
 * `Ignored` is not — a drag that started sideways or downward does nothing at
 * all, including on the way out.
 */
export function endGesture(
  session: GestureSession,
  { cancelled }: { readonly cancelled: boolean },
): readonly CardEvent[] {
  if (cancelled) return [{ type: "CANCELLED" }];
  if (session.classification === null) {
    return [{ type: "RELEASED" }, { type: "TAPPED" }];
  }
  return [{ type: "RELEASED" }];
}
