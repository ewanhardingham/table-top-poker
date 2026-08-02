import { describe, expect, it, vi } from "vitest";
import type { TeachableGesture } from "./coaching.js";
import { loadDiscovered, saveDiscovered } from "./hintStorage.js";

function fakeStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    clear: () => {
      data.clear();
    },
    key: () => null,
    length: 0,
  };
}

describe("saveDiscovered", () => {
  it("stores the discovery set as JSON under a namespaced key", () => {
    const storage = fakeStorage();
    const setItem = vi.spyOn(storage, "setItem");

    saveDiscovered(storage, new Set<TeachableGesture>(["bend", "check"]));

    expect(setItem).toHaveBeenCalledWith(
      "ttp:discovered-gestures",
      JSON.stringify(["bend", "check"]),
    );
  });

  it("survives a storage that refuses to write", () => {
    // Safari in private browsing throws from `setItem`. Losing the record of a
    // discovered gesture costs the player a hint they have already outgrown;
    // losing the Fold it was written during would cost them the hand.
    const storage = fakeStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    expect(() => {
      saveDiscovered(storage, new Set<TeachableGesture>(["fold"]));
    }).not.toThrow();
  });
});

describe("loadDiscovered", () => {
  it("round-trips a saved discovery set", () => {
    const storage = fakeStorage();
    const discovered = new Set<TeachableGesture>(["bend", "conceal", "fold"]);

    saveDiscovered(storage, discovered);

    expect(loadDiscovered(storage)).toEqual(discovered);
  });

  it("reads absent storage as nothing discovered", () => {
    expect(loadDiscovered(fakeStorage())).toEqual(new Set());
  });

  it("reads malformed storage as nothing discovered", () => {
    // A cleared or corrupted localStorage re-teaches the gestures rather than
    // guessing: an extra hint is a small cost, and there is nothing else the
    // set could honestly be.
    for (const raw of ["", "not json", "{}", '"bend"', "null", "42"]) {
      expect(
        loadDiscovered(fakeStorage({ "ttp:discovered-gestures": raw })),
      ).toEqual(new Set());
    }
  });

  it("keeps the gestures it recognises and drops everything else", () => {
    // A key written by a later version of the surface, or by hand: the set is
    // an allow-list, so an unknown name never reaches the selector.
    const storage = fakeStorage({
      "ttp:discovered-gestures": JSON.stringify(["bend", "shuffle", 7, null]),
    });

    expect(loadDiscovered(storage)).toEqual(new Set(["bend"]));
  });
});
