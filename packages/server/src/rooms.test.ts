import { describe, expect, it } from "vitest";
import { RoomStore } from "./rooms.js";

describe("RoomStore", () => {
  it("creates a room with a fresh code", () => {
    const store = new RoomStore();
    const room = store.create();
    expect(room.code).toHaveLength(4);
    expect(store.get(room.code)).toBe(room);
  });

  it("re-rolls the code on collision against live rooms", () => {
    const randoms = [0, 0, 0, 0, 0.9, 0.9, 0.9, 0.9];
    let calls = 0;
    const store = new RoomStore(() => randoms[calls++] ?? 0);

    const first = store.create();
    const second = store.create();

    expect(second.code).not.toBe(first.code);
  });

  it("returns undefined for an unknown room code", () => {
    const store = new RoomStore();
    expect(store.get("ZZZZ")).toBeUndefined();
  });

  it("discards a room's state when ended", () => {
    const store = new RoomStore();
    const room = store.create();

    store.end(room.code);

    expect(store.get(room.code)).toBeUndefined();
  });

  it("ending an unknown room is a no-op", () => {
    const store = new RoomStore();
    expect(() => {
      store.end("ZZZZ");
    }).not.toThrow();
  });
});
