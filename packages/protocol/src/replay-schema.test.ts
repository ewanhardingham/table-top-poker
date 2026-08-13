import { describe, expect, it } from "vitest";
import { ReplayRequestSchema } from "./replay-schema.js";

describe("ReplayRequestSchema", () => {
  it("accepts a bare list-hands request", () => {
    expect(ReplayRequestSchema.safeParse({ type: "list-hands" }).success).toBe(
      true,
    );
  });

  it("accepts a get-hand request addressing an ordinal", () => {
    const result = ReplayRequestSchema.safeParse({
      type: "get-hand",
      handOrdinal: 4,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({
      type: "get-hand",
      handOrdinal: 4,
    });
  });

  it("rejects a get-hand with no ordinal", () => {
    expect(ReplayRequestSchema.safeParse({ type: "get-hand" }).success).toBe(
      false,
    );
  });

  it.each([0, -1, 1.5, "4", null])(
    "rejects %p as a hand ordinal",
    (handOrdinal) => {
      const result = ReplayRequestSchema.safeParse({
        type: "get-hand",
        handOrdinal,
      });
      expect(result.success).toBe(false);
    },
  );

  it("rejects unknown fields on a request", () => {
    const result = ReplayRequestSchema.safeParse({
      type: "list-hands",
      roomCode: "attacker-chosen",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown request type", () => {
    expect(ReplayRequestSchema.safeParse({ type: "get-room" }).success).toBe(
      false,
    );
  });

  it("rejects a non-object payload", () => {
    expect(ReplayRequestSchema.safeParse("list-hands").success).toBe(false);
    expect(ReplayRequestSchema.safeParse(null).success).toBe(false);
  });
});
