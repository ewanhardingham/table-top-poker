import { describe, expect, it } from "vitest";
import { claimErrorCode } from "./claimError.js";

describe("claimErrorCode", () => {
  it("preserves a seat-not-found race from the server", () => {
    expect(claimErrorCode(new Error("seat-not-found"))).toBe("seat-not-found");
  });

  it("keeps an occupied seat distinct from a failure the server never named", () => {
    expect(claimErrorCode(new Error("seat-already-claimed"))).toBe(
      "seat-already-claimed",
    );
    expect(claimErrorCode(new Error("network-failure"))).toBe("claim-failed");
    expect(claimErrorCode(new Error("failed to claim seat: 500"))).toBe(
      "claim-failed",
    );
    expect(claimErrorCode("not an error")).toBe("claim-failed");
  });
});
