import { FOLD_AXIS_RATIO } from "./constants.js";

export type Classification = "Bending" | "FoldDragging" | "Ignored";

export interface ClassifyInput {
  readonly fromBendZone: boolean;
  readonly alreadyRevealed: boolean;
  readonly dx: number;
  readonly dy: number;
  readonly foldLegal: boolean;
}

export function classify({
  fromBendZone,
  alreadyRevealed,
  dx,
  dy,
  foldLegal,
}: ClassifyInput): Classification {
  if (fromBendZone && !alreadyRevealed) return "Bending";
  if (foldLegal && dy < 0 && Math.abs(dy) > Math.abs(dx) * FOLD_AXIS_RATIO) {
    return "FoldDragging";
  }
  return "Ignored";
}
