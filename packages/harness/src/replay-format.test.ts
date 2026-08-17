import { describe, expect, it } from "vitest";
import type { EngineState } from "@table-top-poker/engine";
import type { ReplayFlipbook } from "@table-top-poker/engine";
import { renderFlipbook, SelectorOutOfRangeError } from "./replay-format.js";

const state = (n: number): EngineState =>
  ({
    seats: [0, 1, 2],
    button: 0,
    hand: null,
    tag: n,
  }) as unknown as EngineState;

function flipbook(): ReplayFlipbook {
  return {
    positions: [
      { position: 0, event: null, state: state(0) },
      {
        position: 1,
        event: { type: "HandStarted", seed: "s", button: 0 },
        state: state(1),
      },
      {
        position: 2,
        event: { type: "StreetStarted", street: "preflop", actor: 1 },
        state: state(2),
      },
    ],
    rejections: [
      {
        position: 1,
        record: 4,
        rejection: {
          type: "Rejection",
          reason: "not-your-turn",
          command: { type: "call", seatId: 2 },
        },
      },
      {
        position: 2,
        record: 6,
        rejection: {
          type: "Rejection",
          reason: "action-not-legal",
          command: { type: "check", seatId: 1 },
        },
      },
    ],
  };
}

describe("renderFlipbook", () => {
  it("emits every position and interleaves rejections in transcript order for 'all'", () => {
    const records = renderFlipbook(14, flipbook(), { kind: "all" });
    expect(records.map((r) => [r.kind, r.position])).toEqual([
      ["position", 0],
      ["position", 1],
      ["rejection", 1],
      ["position", 2],
      ["rejection", 2],
    ]);
    expect(records.every((r) => r.hand === 14)).toBe(true);
  });

  it("'--at N' emits the position plus every rejection that occurred at it", () => {
    const records = renderFlipbook(14, flipbook(), {
      kind: "at",
      position: 1,
    });
    expect(records.map((r) => r.kind)).toEqual(["position", "rejection"]);
  });

  it("'--at 0' emits position 0 with event: null and no rejections", () => {
    const records = renderFlipbook(14, flipbook(), { kind: "at", position: 0 });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      kind: "position",
      position: 0,
      event: null,
    });
  });

  it("'--from/--to' emits an inclusive range", () => {
    const records = renderFlipbook(14, flipbook(), {
      kind: "range",
      from: 1,
      to: 2,
    });
    expect(records.map((r) => [r.kind, r.position])).toEqual([
      ["position", 1],
      ["rejection", 1],
      ["position", 2],
      ["rejection", 2],
    ]);
  });

  it("rejects a selector naming a position past the flipbook's last position", () => {
    expect(() =>
      renderFlipbook(14, flipbook(), { kind: "at", position: 99 }),
    ).toThrow(SelectorOutOfRangeError);
    expect(() =>
      renderFlipbook(14, flipbook(), { kind: "range", from: 0, to: 99 }),
    ).toThrow(SelectorOutOfRangeError);
  });
});
