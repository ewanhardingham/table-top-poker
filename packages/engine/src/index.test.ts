import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("scaffold smoke test", () => {
  it("is deterministic for identity", () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        expect(n).toBe(n);
      }),
    );
  });
});
