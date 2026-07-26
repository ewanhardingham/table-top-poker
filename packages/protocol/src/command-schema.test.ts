import { describe, expect, it } from "vitest";
import { ClientCommandSchema } from "./command-schema.js";

describe("ClientCommandSchema", () => {
  it.each(["startHand", "fold", "check", "call", "raise", "nextHand"])(
    "accepts a bare %s command",
    (type) => {
      const result = ClientCommandSchema.safeParse({ type });
      expect(result.success).toBe(true);
    },
  );

  it("rejects an unknown command type", () => {
    const result = ClientCommandSchema.safeParse({ type: "advance" });
    expect(result.success).toBe(false);
  });

  it("rejects a client-supplied playerId or seed", () => {
    const result = ClientCommandSchema.safeParse({
      type: "startHand",
      playerId: 3,
      seed: "attacker-chosen",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(ClientCommandSchema.safeParse("startHand").success).toBe(false);
    expect(ClientCommandSchema.safeParse(null).success).toBe(false);
  });
});
