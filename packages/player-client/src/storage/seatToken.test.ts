import { describe, expect, it, vi } from "vitest";
import { saveSeatToken } from "./seatToken.js";

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
