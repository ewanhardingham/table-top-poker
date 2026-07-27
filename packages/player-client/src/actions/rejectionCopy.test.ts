import type {
  RejectionReason,
  ServerRejectionReason,
} from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { rejectionCopy } from "./rejectionCopy.js";

const ALL_REASONS: (RejectionReason | ServerRejectionReason)[] = [
  "not-your-turn",
  "action-not-legal",
  "hand-not-in-progress",
  "hand-already-in-progress",
  "stale-next-hand",
  "invalid-command",
  "room-not-found",
  "not-enough-players",
  "not-permitted",
];

describe("rejectionCopy", () => {
  it("returns distinct, non-empty copy for every reason code", () => {
    const copy = ALL_REASONS.map(rejectionCopy);
    expect(copy.every((text) => text.length > 0)).toBe(true);
    expect(new Set(copy).size).toBe(ALL_REASONS.length);
  });

  it("names the sender's own turn for not-your-turn", () => {
    expect(rejectionCopy("not-your-turn")).toMatch(/turn/i);
  });
});
