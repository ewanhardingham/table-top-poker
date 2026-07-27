import { describe, expect, it } from "vitest";
import { canAct } from "./useActionIntent.js";

describe("canAct", () => {
  it("allows a legal action when nothing is pending", () => {
    expect(canAct(["fold", "check", "raise"], null, "check")).toBe(true);
  });

  it("refuses an action that isn't currently legal", () => {
    expect(canAct(["fold", "check", "raise"], null, "call")).toBe(false);
  });

  it("refuses any action while one is already pending, even a legal one", () => {
    expect(canAct(["fold", "check", "raise"], "fold", "check")).toBe(false);
  });
});
