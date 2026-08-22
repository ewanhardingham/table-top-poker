import { describe, expect, it } from "vitest";
import { ENGINE_LOG_VERSION } from "./version.js";

describe("ENGINE_LOG_VERSION", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(ENGINE_LOG_VERSION)).toBe(true);
    expect(ENGINE_LOG_VERSION).toBeGreaterThan(0);
  });

  it("uses the next version for showing in turn, with mucking", () => {
    expect(ENGINE_LOG_VERSION).toBe(6);
  });
});
