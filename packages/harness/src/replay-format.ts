import type { ReplayFlipbook, ReplayRejection } from "@table-top-poker/engine";
import type { ReplaySelector } from "./replay-args.js";

export type ReplayRecord =
  | {
      readonly kind: "position";
      readonly hand: number;
      readonly position: number;
      readonly event: ReplayFlipbook["positions"][number]["event"];
      readonly state: ReplayFlipbook["positions"][number]["state"];
    }
  | {
      readonly kind: "rejection";
      readonly hand: number;
      readonly position: number;
      readonly record: number;
      readonly rejection: ReplayFlipbook["rejections"][number]["rejection"];
    };

/** `--at`/`--from`/`--to` named a position the (possibly incomplete) flipbook never reached. */
export class SelectorOutOfRangeError extends Error {}

function validateSelector(
  selector: ReplaySelector,
  lastPosition: number,
): void {
  const positions =
    selector.kind === "at"
      ? [selector.position]
      : selector.kind === "range"
        ? [selector.from, selector.to]
        : [];
  for (const position of positions) {
    if (position > lastPosition) {
      throw new SelectorOutOfRangeError(
        `position ${String(position)} is out of range: this replay reaches position ${String(lastPosition)}`,
      );
    }
  }
}

function includesPosition(selector: ReplaySelector, position: number): boolean {
  switch (selector.kind) {
    case "all":
      return true;
    case "at":
      return position === selector.position;
    case "range":
      return position >= selector.from && position <= selector.to;
  }
}

/**
 * Renders a flipbook into the JSONL records §7 specifies, in transcript
 * order: each selected position, immediately followed by every Rejection
 * that occurred while the Hand stayed at that position. Both lists already
 * carry that relative order — positions ascend by construction, and a
 * Rejection's `position` never precedes the position it was pushed after —
 * so grouping by position reconstructs it without re-deriving an ordinal.
 */
export function renderFlipbook(
  hand: number,
  flipbook: ReplayFlipbook,
  selector: ReplaySelector,
): readonly ReplayRecord[] {
  const lastPosition = flipbook.positions.length - 1;
  validateSelector(selector, lastPosition);

  const rejectionsByPosition = new Map<number, ReplayRejection[]>();
  for (const rejection of flipbook.rejections) {
    const existing = rejectionsByPosition.get(rejection.position);
    if (existing === undefined) {
      rejectionsByPosition.set(rejection.position, [rejection]);
    } else {
      existing.push(rejection);
    }
  }

  const records: ReplayRecord[] = [];
  for (const entry of flipbook.positions) {
    if (includesPosition(selector, entry.position)) {
      records.push({
        kind: "position",
        hand,
        position: entry.position,
        event: entry.event,
        state: entry.state,
      });
    }
    for (const rejection of rejectionsByPosition.get(entry.position) ?? []) {
      if (!includesPosition(selector, rejection.position)) continue;
      records.push({
        kind: "rejection",
        hand,
        position: rejection.position,
        record: rejection.record,
        rejection: rejection.rejection,
      });
    }
  }
  return records;
}
