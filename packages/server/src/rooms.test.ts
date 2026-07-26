import { describe, expect, it } from "vitest";
import { RoomStore, SEAT_COUNT, toRoomView } from "./rooms.js";

describe("RoomStore", () => {
  it("creates a room with a fresh code", () => {
    const store = new RoomStore();
    const room = store.create();
    expect(room.code).toHaveLength(4);
    expect(store.get(room.code)).toBe(room);
  });

  it("creates a room with 8 unclaimed seats", () => {
    const store = new RoomStore();
    const room = store.create();
    expect(room.seats).toHaveLength(SEAT_COUNT);
    for (const seat of room.seats) {
      expect(seat.claimed).toBe(false);
      expect(seat.token).toBeNull();
      expect(seat.sittingOut).toBe(false);
    }
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

  describe("seat claiming", () => {
    it("claims a free seat, issuing an opaque token", () => {
      let calls = 0;
      const store = new RoomStore(
        Math.random,
        () => `token-${String(calls++)}`,
      );
      const room = store.create();

      const result = store.claimSeat(room.code, 0);

      expect(result).toEqual({
        seat: { id: 0, claimed: true, token: "token-0", sittingOut: false },
      });
      expect(room.seats[0]).toEqual({
        id: 0,
        claimed: true,
        token: "token-0",
        sittingOut: false,
      });
    });

    it("rejects claiming an already-claimed seat", () => {
      const store = new RoomStore();
      const room = store.create();
      store.claimSeat(room.code, 0);

      const result = store.claimSeat(room.code, 0);

      expect(result).toEqual({ error: "seat-already-claimed" });
    });

    it("rejects claiming a seat in an unknown room", () => {
      const store = new RoomStore();
      expect(store.claimSeat("ZZZZ", 0)).toEqual({ error: "room-not-found" });
    });

    it("rejects claiming an out-of-range seat", () => {
      const store = new RoomStore();
      const room = store.create();
      expect(store.claimSeat(room.code, SEAT_COUNT)).toEqual({
        error: "seat-not-found",
      });
      expect(store.claimSeat(room.code, -1)).toEqual({
        error: "seat-not-found",
      });
    });

    it("marks a seat claimed while a hand is in progress as sitting out", () => {
      const store = new RoomStore();
      const room = store.create();
      store.markHandInProgress(room.code, true);

      const result = store.claimSeat(room.code, 0);

      if (!("seat" in result)) throw new Error("expected a claimed seat");
      expect(typeof result.seat.token).toBe("string");
      expect(result.seat).toMatchObject({
        id: 0,
        claimed: true,
        sittingOut: true,
      });
    });

    it("force-clears a claimed seat so it can be reclaimed", () => {
      const store = new RoomStore();
      const room = store.create();
      store.claimSeat(room.code, 0);

      store.clearSeat(room.code, 0);

      expect(room.seats[0]).toEqual({
        id: 0,
        claimed: false,
        token: null,
        sittingOut: false,
      });
      const reclaimed = store.claimSeat(room.code, 0);
      if (!("seat" in reclaimed)) throw new Error("expected a claimed seat");
      expect(typeof reclaimed.seat.token).toBe("string");
      expect(reclaimed.seat).toMatchObject({
        id: 0,
        claimed: true,
        sittingOut: false,
      });
    });

    it("clearing a seat in an unknown room is a no-op", () => {
      const store = new RoomStore();
      expect(() => {
        store.clearSeat("ZZZZ", 0);
      }).not.toThrow();
    });
  });

  describe("hand-in-progress flag", () => {
    it("toggling an unknown room is a no-op", () => {
      const store = new RoomStore();
      expect(() => {
        store.markHandInProgress("ZZZZ", true);
      }).not.toThrow();
    });
  });
});

describe("toRoomView", () => {
  it("projects seats without their tokens", () => {
    const store = new RoomStore();
    const room = store.create();
    store.claimSeat(room.code, 0);

    const view = toRoomView(room);

    expect(view).toEqual({
      code: room.code,
      seats: [
        { id: 0, claimed: true, sittingOut: false },
        ...Array.from({ length: SEAT_COUNT - 1 }, (_, i) => ({
          id: i + 1,
          claimed: false,
          sittingOut: false,
        })),
      ],
    });
  });
});
