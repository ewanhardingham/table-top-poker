import {
  DEFAULT_SEAT_COUNT,
  MAX_SEAT_COUNT,
  MIN_SEAT_COUNT,
} from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { type Room, RoomStore, toRoomView } from "./rooms.js";

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
    expect(room.seats).toHaveLength(DEFAULT_SEAT_COUNT);
    for (const seat of room.seats) {
      expect(seat.claimed).toBe(false);
      expect(seat.token).toBeNull();
      expect(seat.sittingOut).toBe(false);
    }
  });

  it("creates a room with the seat count the creator chose", () => {
    const store = new RoomStore();
    for (
      let seatCount = MIN_SEAT_COUNT;
      seatCount <= MAX_SEAT_COUNT;
      seatCount++
    ) {
      const room = store.create(seatCount);
      expect(room.seats).toHaveLength(seatCount);
      expect(room.seats.map((seat) => seat.id)).toEqual(
        Array.from({ length: seatCount }, (_, id) => id),
      );
    }
  });

  it("rejects a seat count outside the 2-8 range", () => {
    const store = new RoomStore();
    for (const seatCount of [0, 1, 9, 2.5, Number.NaN]) {
      expect(() => store.create(seatCount)).toThrow(RangeError);
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
        seat: {
          id: 0,
          claimed: true,
          token: "token-0",
          sittingOut: false,
          disconnected: false,
        },
      });
      expect(room.seats[0]).toEqual({
        id: 0,
        claimed: true,
        token: "token-0",
        sittingOut: false,
        disconnected: false,
      });
    });

    it("rejects claiming an already-claimed seat", () => {
      const store = new RoomStore();
      const room = store.create();
      store.claimSeat(room.code, 0);

      const result = store.claimSeat(room.code, 0);

      expect(result).toEqual({ error: "seat-already-claimed" });
    });

    it("finds a claimed seat by its token", () => {
      const store = new RoomStore(Math.random, () => "token");
      const room = store.create();
      const claim = store.claimSeat(room.code, 2);

      if (!("seat" in claim)) throw new Error("expected a claimed seat");
      expect(store.findSeatByToken(room.code, "token")).toBe(claim.seat);
      expect(store.findSeatByToken(room.code, "missing")).toBeUndefined();
    });

    it("rejects claiming a seat in an unknown room", () => {
      const store = new RoomStore();
      expect(store.claimSeat("ZZZZ", 0)).toEqual({ error: "room-not-found" });
    });

    it("rejects claiming an out-of-range seat", () => {
      const store = new RoomStore();
      const room = store.create();
      expect(store.claimSeat(room.code, DEFAULT_SEAT_COUNT)).toEqual({
        error: "seat-not-found",
      });
      expect(store.claimSeat(room.code, -1)).toEqual({
        error: "seat-not-found",
      });
    });

    it("claims a seat mid-hand with sittingOut false internally, shown as sitting out in the room view", () => {
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
        sittingOut: false,
      });
      expect(toRoomView(room).seats[2]).toMatchObject({ sittingOut: true });
    });

    it("evicts a claimed seat so it can be reclaimed (ADR-0003)", () => {
      const store = new RoomStore();
      const room = store.create();
      store.claimSeat(room.code, 0);

      store.evictSeat(room.code, 0);

      expect(room.seats[0]).toEqual({
        id: 0,
        claimed: false,
        token: null,
        sittingOut: false,
        disconnected: false,
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

    it("evicting a seat in an unknown room is a no-op", () => {
      const store = new RoomStore();
      expect(() => {
        store.evictSeat("ZZZZ", 0);
      }).not.toThrow();
    });
  });

  describe("seat-count changes", () => {
    function claimSeats(store: RoomStore, room: Room, ids: readonly number[]) {
      for (const seatId of ids) {
        const result = store.claimSeat(room.code, seatId);
        if (!("seat" in result)) throw new Error("expected a claimed seat");
      }
    }

    function completeHand(store: RoomStore, room: Room): void {
      for (let i = 0; i < MAX_SEAT_COUNT; i++) {
        if (room.engine?.hand?.status === "complete") return;
        const actor = store.currentActor(room.code);
        if (actor === undefined) throw new Error("expected a current actor");
        const result = store.dispatch(room.code, actor, "fold");
        if (!("steps" in result)) throw new Error("expected dispatch steps");
      }
      throw new Error("hand did not complete");
    }

    it("uses the claimed-seat floor and still floors an empty table at two", () => {
      const store = new RoomStore();
      const room = store.create();
      claimSeats(store, room, [1, 4, 7]);

      expect(store.changeSeatCount(room.code, 2)).toEqual({
        error: "seat-count-below-floor",
        minimum: 3,
      });
      expect(store.changeSeatCount(room.code, 3)).toMatchObject({
        seatCount: 3,
        applied: true,
      });

      const empty = store.create();
      expect(store.changeSeatCount(empty.code, 1)).toEqual({
        error: "invalid-seat-count",
      });
      const min = store.changeSeatCount(empty.code, MIN_SEAT_COUNT);
      expect(min).toMatchObject({ seatCount: MIN_SEAT_COUNT, applied: true });
    });

    it("grows immediately and appends only fresh unclaimed seats", () => {
      const store = new RoomStore();
      const room = store.create(4);
      const claimed = store.claimSeat(room.code, 1);
      if (!("seat" in claimed)) throw new Error("expected a claimed seat");

      const result = store.changeSeatCount(room.code, 6);

      expect(result).toEqual({
        seatCount: 6,
        pendingSeatCount: null,
        applied: true,
        moves: [],
      });
      expect(room.seats.map((seat) => seat.id)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(room.seats[1]?.token).toBe(claimed.seat.token);
      expect(room.seats.slice(4).every((seat) => !seat.claimed)).toBe(true);
    });

    it("deals a newly claimed seat after an immediate growth on the next hand", () => {
      const store = new RoomStore();
      const room = store.create(2);
      claimSeats(store, room, [0, 1]);
      const started = store.dispatch(room.code, "table", "startHand");
      if (!("steps" in started)) throw new Error("expected dispatch steps");

      expect(store.changeSeatCount(room.code, 4)).toMatchObject({
        seatCount: 4,
        pendingSeatCount: null,
        applied: true,
      });
      claimSeats(store, room, [2]);
      completeHand(store, room);

      const next = store.dispatch(room.code, "table", "nextHand");

      if (!("steps" in next)) throw new Error("expected dispatch steps");
      expect(room.engine?.seats).toEqual([0, 1, 2]);
    });

    it("repacks claimed seats while carrying token and seat state", () => {
      const store = new RoomStore(Math.random, () => "token");
      const room = store.create();
      claimSeats(store, room, [0, 3, 5]);
      store.setSittingOut(room.code, 3, true);
      store.setSeatDisconnected(room.code, 5, true);
      const tokens = room.seats
        .filter((seat) => seat.claimed)
        .map((seat) => seat.token);

      const result = store.changeSeatCount(room.code, 4);

      expect(result).toEqual({
        seatCount: 4,
        pendingSeatCount: null,
        applied: true,
        moves: [
          { from: 3, to: 1 },
          { from: 5, to: 2 },
        ],
      });
      expect(
        room.seats.filter((seat) => seat.claimed).map((seat) => seat.token),
      ).toEqual(tokens);
      expect(room.seats[1]).toMatchObject({
        claimed: true,
        sittingOut: true,
        disconnected: false,
      });
      expect(room.seats[2]).toMatchObject({
        claimed: true,
        sittingOut: false,
        disconnected: true,
      });
      expect(room.seats.filter((seat) => seat.claimed)).toHaveLength(3);
    });

    it("queues a live-hand shrink and applies it at the next deal-in", () => {
      const store = new RoomStore();
      const room = store.create();
      claimSeats(store, room, [2, 5, 7]);
      const started = store.dispatch(room.code, "table", "startHand");
      if (!("steps" in started)) throw new Error("expected dispatch steps");
      const liveEngine = room.engine;

      const queued = store.changeSeatCount(room.code, 3);

      expect(queued).toEqual({
        seatCount: MAX_SEAT_COUNT,
        pendingSeatCount: 3,
        applied: false,
        moves: [],
      });
      expect(room.seats).toHaveLength(MAX_SEAT_COUNT);
      expect(room.engine).toBe(liveEngine);

      completeHand(store, room);
      const next = store.dispatch(room.code, "table", "nextHand");

      if (!("steps" in next)) throw new Error("expected dispatch steps");
      expect(next.seatMoves).toEqual([
        { from: 2, to: 0 },
        { from: 5, to: 1 },
        { from: 7, to: 2 },
      ]);
      expect(room.pendingSeatCount).toBeNull();
      expect(room.seats).toHaveLength(3);
      expect(room.engine?.seats).toEqual([0, 1, 2]);
      // The completed hand's next button was old seat 5; after repacking it
      // is seat 1 and the new hand keeps it there.
      expect(room.engine?.button).toBe(1);
      expect(room.engine?.hand?.status).toBe("betting");
    });

    it("applies a shrink immediately between hands", () => {
      const store = new RoomStore();
      const room = store.create();
      claimSeats(store, room, [2, 5, 7]);
      const started = store.dispatch(room.code, "table", "startHand");
      if (!("steps" in started)) throw new Error("expected dispatch steps");
      completeHand(store, room);
      const second = store.dispatch(room.code, "table", "nextHand");
      if (!("steps" in second)) throw new Error("expected dispatch steps");
      completeHand(store, room);

      const applied = store.changeSeatCount(room.code, 3);

      expect(applied).toEqual({
        seatCount: 3,
        pendingSeatCount: null,
        applied: true,
        moves: [
          { from: 2, to: 0 },
          { from: 5, to: 1 },
          { from: 7, to: 2 },
        ],
      });
      expect(room.seats).toHaveLength(3);
      expect(room.engine?.seats).toEqual([0, 1, 2]);
      expect(room.engine?.button).toBe(2);
      expect(room.engine?.hand?.status).toBe("complete");
      expect(toRoomView(room).seats.map((seat) => seat.sittingOut)).toEqual([
        false,
        false,
        false,
      ]);

      const next = store.dispatch(room.code, "table", "nextHand");

      if (!("steps" in next)) throw new Error("expected dispatch steps");
      expect(next.seatMoves).toBeUndefined();
      expect(room.engine?.seats).toEqual([0, 1, 2]);
      expect(room.engine?.button).toBe(2);
      expect(room.engine?.hand?.status).toBe("betting");
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

    it("excludes a mid-hand joiner from the deal, showing it sitting out", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      store.dispatch(room.code, "table", "startHand");
      const midHandJoin = store.claimSeat(room.code, 2);
      if (!("seat" in midHandJoin)) throw new Error("expected a claim");

      const foldResult = store.dispatch(room.code, 2, "fold");

      expect(foldResult).toMatchObject({
        reason: "not-your-turn",
        command: { type: "fold", playerId: 2 },
        rejection: { type: "Rejection", reason: "not-your-turn" },
      });
      expect(toRoomView(room).seats[2]).toMatchObject({ sittingOut: true });
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

      const result = store.dispatch(room.code, "table", "startHand");
      expect(result).toMatchObject({
        reason: "hand-already-in-progress",
        command: {
          type: "startHand",
          playerId: 0,
        },
        rejection: {
          type: "Rejection",
          reason: "hand-already-in-progress",
        },
      });
      if (!("command" in result)) throw new Error("expected a command");
      if (result.command.type !== "startHand") {
        throw new Error("expected a startHand command");
      }
      expect(typeof result.command.seed).toBe("string");
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

      expect(store.dispatch(room.code, outOfTurnSeat.id, "fold")).toMatchObject(
        {
          reason: "not-your-turn",
          command: { type: "fold", playerId: outOfTurnSeat.id },
          rejection: { type: "Rejection", reason: "not-your-turn" },
        },
      );
    });

    /** Folds every actor in turn until only one live player remains (fold-out). */
    function completeHand(store: RoomStore, room: Room): void {
      for (let i = 0; i < DEFAULT_SEAT_COUNT; i++) {
        if (room.engine?.hand?.status === "complete") return;
        const actor = store.currentActor(room.code);
        if (actor === undefined) throw new Error("expected a current actor");
        const result = store.dispatch(room.code, actor, "fold");
        if (!("steps" in result)) throw new Error("expected dispatch steps");
      }
      throw new Error("hand did not complete");
    }

    describe("ADR-0002: per-hand deal-in recompute", () => {
      it("deals a mid-hand joiner into the next hand", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 2);
        store.dispatch(room.code, "table", "startHand");
        store.claimSeat(room.code, 2);
        completeHand(store, room);

        const result = store.dispatch(room.code, "table", "nextHand");

        if (!("steps" in result)) throw new Error("expected dispatch steps");
        const holeCardsDealt = result.steps.find(
          (step) => step.event.type === "HoleCardsDealt",
        )?.event;
        if (holeCardsDealt?.type !== "HoleCardsDealt") {
          throw new Error("expected HoleCardsDealt");
        }
        expect(holeCardsDealt.deals.map((d) => d.seatId).sort()).toEqual([
          0, 1, 2,
        ]);
        expect(toRoomView(room).seats[2]).toMatchObject({ sittingOut: false });
      });

      it("keeps a between-hand joiner sitting out until the next deal-in", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 2);
        store.dispatch(room.code, "table", "startHand");
        completeHand(store, room);
        store.claimSeat(room.code, 2);

        expect(toRoomView(room).seats[2]).toMatchObject({ sittingOut: true });

        const result = store.dispatch(room.code, "table", "nextHand");

        if (!("steps" in result)) throw new Error("expected dispatch steps");
        expect(toRoomView(room).seats[2]).toMatchObject({ sittingOut: false });
      });

      it("excludes a disconnected seat from the next hand's deal-in", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        store.dispatch(room.code, "table", "startHand");
        completeHand(store, room);
        store.setSeatDisconnected(room.code, 2, true);

        const result = store.dispatch(room.code, "table", "nextHand");

        if (!("steps" in result)) throw new Error("expected dispatch steps");
        expect(room.engine?.seats).not.toContain(2);
      });

      it("rejects nextHand once too few seats remain eligible, without dealing anyone in", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 2);
        store.dispatch(room.code, "table", "startHand");
        completeHand(store, room);
        store.setSeatDisconnected(room.code, 1, true);

        expect(store.dispatch(room.code, "table", "nextHand")).toEqual({
          reason: "not-enough-players",
        });
      });
    });

    describe("ADR-0003: manual eviction", () => {
      it("frees a claimed seat via evictSeat regardless of connection status", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        store.dispatch(room.code, "table", "startHand");
        completeHand(store, room);
        store.setSeatDisconnected(room.code, 2, true);

        store.evictSeat(room.code, 2);

        expect(room.seats[2]).toMatchObject({ claimed: false, token: null });
      });

      it("has no automatic eviction — a disconnected seat stays occupied across any number of hands", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        store.dispatch(room.code, "table", "startHand");
        completeHand(store, room);
        store.setSeatDisconnected(room.code, 2, true);

        for (let i = 0; i < 5; i++) {
          store.dispatch(room.code, "table", "nextHand");
          completeHand(store, room);
        }

        expect(room.seats[2]).toMatchObject({ claimed: true });
      });

      it("evicts an active (non-disconnected) seat just as freely", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 2);

        store.evictSeat(room.code, 1);

        expect(room.seats[1]).toMatchObject({ claimed: false });
      });
    });

    describe("ADR-0002: sitOut/sitIn", () => {
      it("excludes a voluntarily sitting-out seat from deal-in and never marks it disconnected", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        store.setSittingOut(room.code, 2, true);

        const result = store.dispatch(room.code, "table", "startHand");

        if (!("steps" in result)) throw new Error("expected dispatch steps");
        expect(room.engine?.seats).not.toContain(2);
        expect(toRoomView(room).seats[2]).toMatchObject({
          sittingOut: true,
          disconnected: false,
        });
      });

      it("deals a seat back in once it sits back in", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        store.setSittingOut(room.code, 2, true);
        store.dispatch(room.code, "table", "startHand");
        completeHand(store, room);

        store.setSittingOut(room.code, 2, false);
        const result = store.dispatch(room.code, "table", "nextHand");

        if (!("steps" in result)) throw new Error("expected dispatch steps");
        expect(room.engine?.seats).toContain(2);
      });

      it("is a no-op on an unclaimed seat", () => {
        const store = new RoomStore();
        const room = store.create();

        store.setSittingOut(room.code, 0, true);

        expect(room.seats[0]?.sittingOut).toBe(false);
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
      pendingSeatCount: null,
      seats: [
        { id: 0, claimed: true, sittingOut: false, disconnected: false },
        ...Array.from({ length: DEFAULT_SEAT_COUNT - 1 }, (_, i) => ({
          id: i + 1,
          claimed: false,
          sittingOut: false,
          disconnected: false,
        })),
      ],
    });
  });
});
