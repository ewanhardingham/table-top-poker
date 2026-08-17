import type { CardEvent } from "./cardState.js";
import { classify, type Classification } from "./classify.js";
import { MOVE_SLOP_PX, REVEAL_THRESHOLD } from "./constants.js";
import { bendAxis, bendProgress, type BendAxis } from "./geometry.js";

export interface GestureSession {
  readonly pointerId: number;
  readonly originX: number;
  readonly originY: number;
  readonly fromBendZone: boolean;
  readonly startedRevealed: boolean;
  readonly classification: Classification | null;
  readonly crossed: boolean;
  readonly armed: boolean;
}

export interface BendMotion {
  readonly progress: number;
  readonly axis: BendAxis;
}

export interface FoldMotion {
  readonly offset: number;
}

export interface GestureContext {
  readonly foldLegal: boolean;
  readonly foldThresholdPx: number;
}

export interface GestureStep {
  readonly session: GestureSession;
  readonly events: readonly CardEvent[];
  readonly bend: BendMotion | null;
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

export function applyCardEvent(
  session: GestureSession | null,
  event: CardEvent,
): GestureSession | null {
  if (session === null || event.type !== "FOLD_DISARMED") return session;
  return { ...session, armed: false };
}

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

  return step(session, dx, dy, [], ctx);
}

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

function foldStep(
  session: GestureSession,
  dy: number,
  events: readonly CardEvent[],
  ctx: GestureContext,
): GestureStep {
  const offset = Math.min(0, dy);
  const fold: FoldMotion = { offset };
  const armed = -offset >= ctx.foldThresholdPx;
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
  readonly commitsFold: boolean;
}

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
