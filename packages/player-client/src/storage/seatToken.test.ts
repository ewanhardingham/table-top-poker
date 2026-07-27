import { describe, expect, it, vi } from "vitest";
import { clearSeatToken, loadSeatToken, saveSeatToken } from "./seatToken.js";

function fakeStorage(setItem: (key: string, value: string) => void): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
      setItem(key, value);
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

describe("saveSeatToken", () => {
  it("stores the seat token as JSON under a namespaced key", () => {
    const setItem = vi.fn();
    const storage = fakeStorage(setItem);

    saveSeatToken(storage, { roomCode: "ABCD", seatId: 3, token: "tok-1" });

    expect(setItem).toHaveBeenCalledWith(
      "ttp:seat-token",
      JSON.stringify({ roomCode: "ABCD", seatId: 3, token: "tok-1" }),
    );
  });
});

describe("loadSeatToken", () => {
  it("reads back a previously saved token", () => {
    const storage = fakeStorage(() => undefined);
    saveSeatToken(storage, { roomCode: "ABCD", seatId: 3, token: "tok-1" });

    expect(loadSeatToken(storage)).toEqual({
      roomCode: "ABCD",
      seatId: 3,
      token: "tok-1",
    });
  });

  it("returns null when nothing is stored", () => {
    const storage = fakeStorage(() => undefined);
    expect(loadSeatToken(storage)).toBeNull();
  });

  it("returns null for malformed JSON rather than throwing", () => {
    const storage = fakeStorage(() => undefined);
    storage.setItem("ttp:seat-token", "not json");
    expect(loadSeatToken(storage)).toBeNull();
  });

  it("returns null for well-formed JSON missing required fields", () => {
    const storage = fakeStorage(() => undefined);
    storage.setItem("ttp:seat-token", JSON.stringify({ roomCode: "ABCD" }));
    expect(loadSeatToken(storage)).toBeNull();
  });
});

describe("clearSeatToken", () => {
  it("removes the stored token", () => {
    const storage = fakeStorage(() => undefined);
    saveSeatToken(storage, { roomCode: "ABCD", seatId: 3, token: "tok-1" });

    clearSeatToken(storage);

    expect(loadSeatToken(storage)).toBeNull();
  });
});
