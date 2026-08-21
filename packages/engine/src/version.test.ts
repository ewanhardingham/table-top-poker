import { describe, expect, it } from "vitest";
import { ENGINE_LOG_VERSION } from "./version.js";

describe("ENGINE_LOG_VERSION", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(ENGINE_LOG_VERSION)).toBe(true);
    expect(ENGINE_LOG_VERSION).toBeGreaterThan(0);
  });

  it("uses the next version for showdown visibility as engine state", () => {
    expect(ENGINE_LOG_VERSION).toBe(5);
  });
});
