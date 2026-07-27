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
      store.claimSeat(room.code, 0);
      store.claimSeat(room.code, 1);
      store.dispatch(room.code, "table", "startHand");

      const result = store.claimSeat(room.code, 2);

      if (!("seat" in result)) throw new Error("expected a claimed seat");
      expect(typeof result.seat.token).toBe("string");
      expect(result.seat).toMatchObject({
        id: 2,
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

  describe("dispatch", () => {
    function roomWithClaimedSeats(store: RoomStore, count: number) {
      const room = store.create();
      for (let seatId = 0; seatId < count; seatId++) {
        store.claimSeat(room.code, seatId);
      }
      return room;
    }

    it("rejects a command for an unknown room", () => {
      const store = new RoomStore();
      expect(store.dispatch("ZZZZ", "table", "startHand")).toEqual({
        error: "room-not-found",
      });
    });

    it("rejects a table-only command sent by a seat", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      expect(store.dispatch(room.code, 0, "startHand")).toEqual({
        error: "not-permitted",
      });
    });

    it("rejects a seat-only command sent by the table", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      expect(store.dispatch(room.code, "table", "fold")).toEqual({
        error: "not-permitted",
      });
    });

    it("rejects starting a hand with fewer than 2 dealt-in seats", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 1);
      expect(store.dispatch(room.code, "table", "startHand")).toEqual({
        reason: "not-enough-players",
      });
    });

    it("rejects an action before any hand has started", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      expect(store.dispatch(room.code, 0, "fold")).toEqual({
        reason: "hand-not-in-progress",
      });
    });

    it("starts a hand with a fresh CSPRNG seed, dealing to every claimed seat", () => {
      let calls = 0;
      const store = new RoomStore(Math.random, undefined, () => {
        calls += 1;
        return `seed-${String(calls)}`;
      });
      const room = roomWithClaimedSeats(store, 3);

      const result = store.dispatch(room.code, "table", "startHand");

      if (!("steps" in result)) throw new Error("expected dispatch steps");
      expect(result.steps.map((step) => step.event.type)).toEqual([
        "HandStarted",
        "HoleCardsDealt",
        "StreetStarted",
      ]);
      const holeCardsDealt = result.steps[1]?.event;
      if (holeCardsDealt?.type !== "HoleCardsDealt") {
        throw new Error("expected HoleCardsDealt");
      }
      expect(holeCardsDealt.deals.map((deal) => deal.seatId).sort()).toEqual([
        0, 1, 2,
      ]);
      expect(room.engine?.hand?.status).toBe("betting");
    });

    it("excludes a sitting-out seat from the deal and leaves it sitting out", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      store.dispatch(room.code, "table", "startHand");
      const midHandJoin = store.claimSeat(room.code, 2);
      if (!("seat" in midHandJoin)) throw new Error("expected a claim");
      expect(midHandJoin.seat.sittingOut).toBe(true);

      const foldResult = store.dispatch(room.code, 2, "fold");

      expect(foldResult).toEqual({ reason: "not-your-turn" });
      expect(room.seats[2]?.sittingOut).toBe(true);
    });

    it("clears sittingOut on every seat dealt into a hand", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);

      store.dispatch(room.code, "table", "startHand");

      expect(room.seats[0]?.sittingOut).toBe(false);
      expect(room.seats[1]?.sittingOut).toBe(false);
    });

    it("rejects a second startHand once a hand is already in progress", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      store.dispatch(room.code, "table", "startHand");

      expect(store.dispatch(room.code, "table", "startHand")).toEqual({
        reason: "hand-already-in-progress",
      });
    });

    it("rejects an out-of-turn fold", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      const started = store.dispatch(room.code, "table", "startHand");
      if (!("steps" in started)) throw new Error("expected dispatch steps");
      const streetStarted = started.steps.at(-1)?.event;
      if (streetStarted?.type !== "StreetStarted") {
        throw new Error("expected StreetStarted");
      }
      const outOfTurnSeat = room.seats.find(
        (seat) => seat.claimed && seat.id !== streetStarted.actor,
      );
      if (!outOfTurnSeat) throw new Error("expected an out-of-turn seat");

      expect(store.dispatch(room.code, outOfTurnSeat.id, "fold")).toEqual({
        reason: "not-your-turn",
      });
    });
  });

  describe("currentActor", () => {
    function roomWithClaimedSeats(store: RoomStore, count: number) {
      const room = store.create();
      for (let seatId = 0; seatId < count; seatId++) {
        store.claimSeat(room.code, seatId);
      }
      return room;
    }

    it("is undefined for an unknown room", () => {
      const store = new RoomStore();
      expect(store.currentActor("ZZZZ")).toBeUndefined();
    });

    it("is undefined before any hand has started", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      expect(store.currentActor(room.code)).toBeUndefined();
    });

    it("is the seat named by the hand's own StreetStarted event", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      const started = store.dispatch(room.code, "table", "startHand");
      if (!("steps" in started)) throw new Error("expected dispatch steps");
      const streetStarted = started.steps.at(-1)?.event;
      if (streetStarted?.type !== "StreetStarted") {
        throw new Error("expected StreetStarted");
      }

      expect(store.currentActor(room.code)).toBe(streetStarted.actor);
    });

    it("advances to the next actor after a legal action", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      store.dispatch(room.code, "table", "startHand");
      const actor = store.currentActor(room.code);
      if (actor === undefined) throw new Error("expected a current actor");

      store.dispatch(room.code, actor, "call");

      expect(store.currentActor(room.code)).not.toBe(actor);
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
