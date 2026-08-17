import {
  BEND_TRAVEL_PX,
  FOLD_DISTANCE_RATIO,
  MIN_FOLD_DISTANCE_PX,
} from "./constants.js";

export type BendAxis = "left" | "up";

export function bendProgress(dx: number, dy: number): number {
  const inward = Math.max(0, -dx) + Math.max(0, -dy);
  return Math.min(1, inward / BEND_TRAVEL_PX);
}

export function bendAxis(dx: number, dy: number): BendAxis {
  return Math.abs(dy) >= Math.abs(dx) ? "up" : "left";
}

export function foldThreshold(viewportHeight: number): number {
  return Math.max(
    MIN_FOLD_DISTANCE_PX,
    Math.round(viewportHeight * FOLD_DISTANCE_RATIO),
  );
}

export function foldFlightDistance(viewportHeight: number): number {
  return Math.max(viewportHeight, foldThreshold(viewportHeight) * 2);
}
