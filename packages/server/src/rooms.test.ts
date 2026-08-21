import {
  DEFAULT_SEAT_COUNT,
  DEFAULT_SHOT_CLOCK,
  DEFAULT_SHOWDOWN_OVERLAY,
  DEFAULT_SOUND_SETTINGS,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_SEAT_COUNT,
  MIN_SEAT_COUNT,
  type SeatId,
} from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import {
  type DispatchResult,
  type EvictSeatResult,
  type Room,
  RoomStore,
  type SeatCommandType,
  toRoomView,
} from "./rooms.js";

/** A deterministic `Math.random` stand-in, repeating its last value forever. */
function sequenceOf(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

/**
 * Dispatches and commits in one step, as `app.ts` does once the append
 * confirms. Tests about the staging seam itself call `dispatch` directly and
 * settle the transaction themselves.
 */
function commitDispatch(
  store: RoomStore,
  code: string,
  identity: SeatId | "table",
  type: SeatCommandType,
): DispatchResult {
  const result = store.dispatch(code, identity, type);
  if ("commit" in result) result.commit();
  return result;
}

function commitEviction(
  store: RoomStore,
  code: string,
  seatId: SeatId,
): EvictSeatResult {
  const result = store.evictSeat(code, seatId);
  result.transaction?.commit();
  return result;
}

function commitLeave(
  store: RoomStore,
  code: string,
  seatId: SeatId,
  token: string,
): EvictSeatResult | { readonly error: "room-not-found" | "not-permitted" } {
  const result = store.leaveSeat(code, seatId, token);
  if (!("error" in result)) result.transaction?.commit();
  return result;
}

describe("RoomStore", () => {
  it("creates a room with a fresh code", () => {
    const store = new RoomStore();
    const room = store.create();
    expect(room.code).toHaveLength(4);
    expect(store.get(room.code)).toBe(room);
  });

  describe("durable identity and staged creation", () => {
    it("gives every room an opaque id distinct from its join code", () => {
      const store = new RoomStore();
      const first = store.create();
      const second = store.create();

      expect(first.id).not.toBe(first.code);
      expect(first.id).not.toBe(second.id);
      expect(first.id.length).toBeGreaterThan(first.code.length);
    });

    it("leaves a staged room unjoinable until it is committed", () => {
      const store = new RoomStore();
      const staged = store.stage(4);

      expect(store.get(staged.room.code)).toBeUndefined();
      expect(staged.commit()).toBe(staged.room);
      expect(store.get(staged.room.code)).toBe(staged.room);
    });

    it("never publishes a discarded room, and frees its code again", () => {
      const store = new RoomStore();
      const staged = store.stage(4);
      staged.discard();

      expect(store.get(staged.room.code)).toBeUndefined();
      // The reserved code is released, so the generator may reuse it.
      const replacement = store.create(4);
      expect(store.get(replacement.code)).toBe(replacement);
    });

    it("does not hand two staged rooms the same code", () => {
      // A generator this predictable would collide immediately if staged
      // codes were not reserved alongside live ones.
      const store = new RoomStore(
        // Roll "AAAA" twice — the second stage must reject its own first
        // roll as taken and re-roll, which it can only do if staged codes are
        // reserved alongside live ones.
        sequenceOf([0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5]),
      );
      const first = store.stage();
      const second = store.stage();

      expect(second.room.code).not.toBe(first.room.code);
    });
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

  it("creates a room with the shot clock disabled by default", () => {
    const store = new RoomStore();
    const room = store.create();

    expect(room.shotClockSettings).toEqual(DEFAULT_SHOT_CLOCK);
    expect(toRoomView(room).shotClockSettings).toEqual(DEFAULT_SHOT_CLOCK);
  });

  it("creates a room with the showdown overlay off, and remembers a change", () => {
    const store = new RoomStore();
    const room = store.create();

    expect(toRoomView(room).showdownOverlay).toEqual(DEFAULT_SHOWDOWN_OVERLAY);
    expect(store.changeShowdownOverlay(room.code, { enabled: true })).toEqual({
      enabled: true,
    });
    expect(toRoomView(room).showdownOverlay).toEqual({ enabled: true });
    expect(store.changeShowdownOverlay("ZZZZ", { enabled: true })).toEqual({
      error: "room-not-found",
    });
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

      const result = store.claimSeat(room.code, 0, "P0");

      expect(result).toEqual({
        seat: {
          id: 0,
          claimed: true,
          displayName: "P0",
          token: "token-0",
          sittingOut: false,
          disconnected: false,
        },
      });
      expect(room.seats[0]).toEqual({
        id: 0,
        claimed: true,
        displayName: "P0",
        token: "token-0",
        sittingOut: false,
        disconnected: false,
      });
    });

    it("stores the display name in the seat and public room view", () => {
      const store = new RoomStore();
      const room = store.create();

      const result = store.claimSeat(room.code, 0, " Avery ");

      if (!("seat" in result)) throw new Error("expected a claimed seat");
      expect(result.seat.displayName).toBe("Avery");
      expect(toRoomView(room).seats[0]).toMatchObject({
        claimed: true,
        displayName: "Avery",
      });
    });

    it("claims unique bot names on free seats and marks them in the room view", () => {
      const store = new RoomStore();
      const room = store.create(4);
      store.claimSeat(room.code, 0, "Bot 1");

      const result = store.addBots(room, 4);

      expect(result.seats).toHaveLength(3);
      expect(result.seats.map((seat) => seat.displayName)).toEqual([
        "Bot 2",
        "Bot 3",
        "Bot 4",
      ]);
      expect(result.seats.every((seat) => seat.bot === true)).toBe(true);
      expect(toRoomView(room).seats.filter((seat) => seat.bot)).toHaveLength(3);
    });

    it("rejects a blank or over-long display name without claiming the seat", () => {
      const store = new RoomStore();
      const room = store.create();

      expect(store.claimSeat(room.code, 0, "   ")).toEqual({
        error: "invalid-display-name",
      });
      expect(
        store.claimSeat(room.code, 0, "1".repeat(MAX_DISPLAY_NAME_LENGTH + 1)),
      ).toEqual({ error: "invalid-display-name" });
      expect(room.seats[0]?.claimed).toBe(false);
    });

    it("rejects a case-insensitive duplicate among claimed seats", () => {
      const store = new RoomStore();
      const room = store.create();
      store.claimSeat(room.code, 0, "Avery");

      expect(store.claimSeat(room.code, 1, " aVERY ")).toEqual({
        error: "duplicate-display-name",
      });
      expect(room.seats[1]?.claimed).toBe(false);

      commitEviction(store, room.code, 0);
      expect(store.claimSeat(room.code, 1, "Avery")).toHaveProperty("seat");
    });

    it("rejects claiming an already-claimed seat", () => {
      const store = new RoomStore();
      const room = store.create();
      store.claimSeat(room.code, 0, "P0");

      const result = store.claimSeat(room.code, 0, "P0");

      expect(result).toEqual({ error: "seat-already-claimed" });
    });

    it("finds a claimed seat by its token", () => {
      const store = new RoomStore(Math.random, () => "token");
      const room = store.create();
      const claim = store.claimSeat(room.code, 2, "P2");

      if (!("seat" in claim)) throw new Error("expected a claimed seat");
      expect(store.findSeatByToken(room.code, "token")).toBe(claim.seat);
      expect(store.findSeatByToken(room.code, "missing")).toBeUndefined();
    });

    it("rejects claiming a seat in an unknown room", () => {
      const store = new RoomStore();
      expect(store.claimSeat("ZZZZ", 0, "Avery")).toEqual({
        error: "room-not-found",
      });
    });

    it("rejects claiming an out-of-range seat", () => {
      const store = new RoomStore();
      const room = store.create();
      expect(store.claimSeat(room.code, DEFAULT_SEAT_COUNT, "Avery")).toEqual({
        error: "seat-not-found",
      });
      expect(store.claimSeat(room.code, -1, "Avery")).toEqual({
        error: "seat-not-found",
      });
    });

    it("claims a seat mid-hand with sittingOut false internally, shown as sitting out in the room view", () => {
      const store = new RoomStore();
      const room = store.create();
      store.claimSeat(room.code, 0, "P0");
      store.claimSeat(room.code, 1, "P1");
      commitDispatch(store, room.code, "table", "startHand");

      const result = store.claimSeat(room.code, 2, "P2");

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
      store.claimSeat(room.code, 0, "P0");

      commitEviction(store, room.code, 0);

      expect(room.seats[0]).toEqual({
        id: 0,
        claimed: false,
        token: null,
        sittingOut: false,
        disconnected: false,
      });
      const reclaimed = store.claimSeat(room.code, 0, "P0");
      if (!("seat" in reclaimed)) throw new Error("expected a claimed seat");
      expect(typeof reclaimed.seat.token).toBe("string");
      expect(reclaimed.seat).toMatchObject({
        id: 0,
        claimed: true,
        sittingOut: false,
      });
    });

    it("clears a bot flag when its seat is evicted", () => {
      const store = new RoomStore();
      const room = store.create();
      const added = store.addBots(room, 1);

      commitEviction(store, room.code, added.seats[0]?.id ?? 0);

      expect(room.seats[0]).not.toHaveProperty("bot");
      expect(toRoomView(room).seats[0]).not.toHaveProperty("bot");
    });

    it("carries names through a repack and clears them on eviction", () => {
      const store = new RoomStore();
      const room = store.create();
      store.claimSeat(room.code, 3, "Blair");
      store.changeSeatCount(room.code, 4);

      expect(room.seats[0]).toMatchObject({
        claimed: true,
        displayName: "Blair",
      });

      commitEviction(store, room.code, 0);

      expect(room.seats[0]).not.toHaveProperty("displayName");
    });

    it("evicting a seat in an unknown room is a no-op", () => {
      const store = new RoomStore();
      expect(() => {
        commitEviction(store, "ZZZZ", 0);
      }).not.toThrow();
    });
  });

  describe("ADR-0005: player self-leave", () => {
    function claimWithToken(store: RoomStore, code: string, seatId: number) {
      const result = store.claimSeat(code, seatId, `P${String(seatId)}`);
      if (!("seat" in result)) throw new Error("expected a claimed seat");
      const { token } = result.seat;
      if (token === null) throw new Error("expected a token");
      return token;
    }

    it("frees the seat back to the pool when the token matches", () => {
      const store = new RoomStore();
      const room = store.create();
      const token = claimWithToken(store, room.code, 0);

      const result = commitLeave(store, room.code, 0, token);

      expect(result).not.toHaveProperty("error");
      expect(room.seats[0]).toEqual({
        id: 0,
        claimed: false,
        token: null,
        sittingOut: false,
        disconnected: false,
      });
    });

    it("rejects a mismatched token and leaves the seat untouched", () => {
      const store = new RoomStore();
      const room = store.create();
      claimWithToken(store, room.code, 0);

      const result = commitLeave(store, room.code, 0, "not-the-token");

      expect(result).toEqual({ error: "not-permitted" });
      expect(room.seats[0]).toMatchObject({ claimed: true });
    });

    it("rejects leaving an unclaimed seat", () => {
      const store = new RoomStore();
      const room = store.create();

      expect(commitLeave(store, room.code, 0, "any")).toEqual({
        error: "not-permitted",
      });
    });

    it("reports room-not-found for an unknown room", () => {
      const store = new RoomStore();
      expect(commitLeave(store, "ZZZZ", 0, "any")).toEqual({
        error: "room-not-found",
      });
    });

    it("folds the current actor mid-hand, exactly as an eviction does", () => {
      const store = new RoomStore();
      const room = store.create();
      const tokens = [0, 1, 2].map((seatId) =>
        claimWithToken(store, room.code, seatId),
      );
      commitDispatch(store, room.code, "table", "startHand");
      const actor = store.currentActor(room.code);
      if (actor === undefined) throw new Error("expected a current actor");

      const result = commitLeave(store, room.code, actor, tokens[actor] ?? "");

      if ("error" in result) throw new Error("expected the leave to dispatch");
      expect(result.transaction?.steps.at(-1)?.event).toMatchObject({
        type: "ActionTaken",
        seatId: actor,
        action: "fold",
      });
      expect(room.seats[actor]).toMatchObject({ claimed: false });
      expect(store.currentActor(room.code)).not.toBe(actor);
    });
  });

  describe("seat-count changes", () => {
    function claimSeats(store: RoomStore, room: Room, ids: readonly number[]) {
      for (const seatId of ids) {
        const result = store.claimSeat(room.code, seatId, `P${String(seatId)}`);
        if (!("seat" in result)) throw new Error("expected a claimed seat");
      }
    }

    function completeHand(store: RoomStore, room: Room): void {
      for (let i = 0; i < MAX_SEAT_COUNT; i++) {
        if (room.engine?.hand?.status === "complete") return;
        const actor = store.currentActor(room.code);
        if (actor === undefined) throw new Error("expected a current actor");
        const result = commitDispatch(store, room.code, actor, "fold");
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
      const claimed = store.claimSeat(room.code, 1, "P1");
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
      const started = commitDispatch(store, room.code, "table", "startHand");
      if (!("steps" in started)) throw new Error("expected dispatch steps");

      expect(store.changeSeatCount(room.code, 4)).toMatchObject({
        seatCount: 4,
        pendingSeatCount: null,
        applied: true,
      });
      claimSeats(store, room, [2]);
      completeHand(store, room);

      const next = commitDispatch(store, room.code, "table", "nextHand");

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
      const started = commitDispatch(store, room.code, "table", "startHand");
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
      const next = commitDispatch(store, room.code, "table", "nextHand");

      if (!("steps" in next)) throw new Error("expected dispatch steps");
      expect(next.seatMoves).toEqual([
        { from: 2, to: 0 },
        { from: 5, to: 1 },
        { from: 7, to: 2 },
      ]);
      expect(room.pendingSeatCount).toBeNull();
      expect(room.seats).toHaveLength(3);
      expect(room.engine?.seats).toEqual([0, 1, 2]);
      expect(room.engine?.button).toBe(1);
      expect(room.engine?.hand?.status).toBe("betting");
    });

    it("applies a shrink immediately between hands", () => {
      const store = new RoomStore();
      const room = store.create();
      claimSeats(store, room, [2, 5, 7]);
      const started = commitDispatch(store, room.code, "table", "startHand");
      if (!("steps" in started)) throw new Error("expected dispatch steps");
      completeHand(store, room);
      const second = commitDispatch(store, room.code, "table", "nextHand");
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

      const next = commitDispatch(store, room.code, "table", "nextHand");

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
        store.claimSeat(room.code, seatId, `P${String(seatId)}`);
      }
      return room;
    }

    it("rejects a command for an unknown room", () => {
      const store = new RoomStore();
      expect(commitDispatch(store, "ZZZZ", "table", "startHand")).toEqual({
        error: "room-not-found",
      });
    });

    it("rejects a table-only command sent by a seat", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      expect(commitDispatch(store, room.code, 0, "startHand")).toEqual({
        error: "not-permitted",
      });
    });

    it("rejects a seat-only command sent by the table", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      expect(commitDispatch(store, room.code, "table", "fold")).toEqual({
        error: "not-permitted",
      });
    });

    it("rejects starting a hand with fewer than 2 dealt-in seats", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 1);
      expect(commitDispatch(store, room.code, "table", "startHand")).toEqual({
        reason: "not-enough-players",
      });
    });

    it("rejects an action before any hand has started", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      expect(commitDispatch(store, room.code, 0, "fold")).toEqual({
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

      const result = commitDispatch(store, room.code, "table", "startHand");

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
      commitDispatch(store, room.code, "table", "startHand");
      const midHandJoin = store.claimSeat(room.code, 2, "P2");
      if (!("seat" in midHandJoin)) throw new Error("expected a claim");

      const foldResult = commitDispatch(store, room.code, 2, "fold");

      expect(foldResult).toMatchObject({
        reason: "not-your-turn",
        command: { type: "fold", seatId: 2 },
        rejection: { type: "Rejection", reason: "not-your-turn" },
      });
      expect(toRoomView(room).seats[2]).toMatchObject({ sittingOut: true });
    });

    it("clears sittingOut on every seat dealt into a hand", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);

      commitDispatch(store, room.code, "table", "startHand");

      expect(room.seats[0]?.sittingOut).toBe(false);
      expect(room.seats[1]?.sittingOut).toBe(false);
    });

    it("rejects a second startHand once a hand is already in progress", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, 2);
      commitDispatch(store, room.code, "table", "startHand");

      const result = commitDispatch(store, room.code, "table", "startHand");
      expect(result).toMatchObject({
        reason: "hand-already-in-progress",
        command: {
          type: "startHand",
          seatId: 0,
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
      const started = commitDispatch(store, room.code, "table", "startHand");
      if (!("steps" in started)) throw new Error("expected dispatch steps");
      const streetStarted = started.steps.at(-1)?.event;
      if (streetStarted?.type !== "StreetStarted") {
        throw new Error("expected StreetStarted");
      }
      const outOfTurnSeat = room.seats.find(
        (seat) => seat.claimed && seat.id !== streetStarted.actor,
      );
      if (!outOfTurnSeat) throw new Error("expected an out-of-turn seat");

      expect(
        commitDispatch(store, room.code, outOfTurnSeat.id, "fold"),
      ).toMatchObject({
        reason: "not-your-turn",
        command: { type: "fold", seatId: outOfTurnSeat.id },
        rejection: { type: "Rejection", reason: "not-your-turn" },
      });
    });

    function completeHand(store: RoomStore, room: Room): void {
      for (let i = 0; i < DEFAULT_SEAT_COUNT; i++) {
        if (room.engine?.hand?.status === "complete") return;
        const actor = store.currentActor(room.code);
        if (actor === undefined) throw new Error("expected a current actor");
        const result = commitDispatch(store, room.code, actor, "fold");
        if (!("steps" in result)) throw new Error("expected dispatch steps");
      }
      throw new Error("hand did not complete");
    }

    describe("ADR-0002: per-hand deal-in recompute", () => {
      it("deals a mid-hand joiner into the next hand", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 2);
        commitDispatch(store, room.code, "table", "startHand");
        store.claimSeat(room.code, 2, "P2");
        completeHand(store, room);

        const result = commitDispatch(store, room.code, "table", "nextHand");

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
        commitDispatch(store, room.code, "table", "startHand");
        completeHand(store, room);
        store.claimSeat(room.code, 2, "P2");

        expect(toRoomView(room).seats[2]).toMatchObject({ sittingOut: true });

        const result = commitDispatch(store, room.code, "table", "nextHand");

        if (!("steps" in result)) throw new Error("expected dispatch steps");
        expect(toRoomView(room).seats[2]).toMatchObject({ sittingOut: false });
      });

      it("excludes a disconnected seat from the next hand's deal-in", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        commitDispatch(store, room.code, "table", "startHand");
        completeHand(store, room);
        store.setSeatDisconnected(room.code, 2, true);

        const result = commitDispatch(store, room.code, "table", "nextHand");

        if (!("steps" in result)) throw new Error("expected dispatch steps");
        expect(room.engine?.seats).not.toContain(2);
      });

      it("rejects nextHand once too few seats remain eligible, without dealing anyone in", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 2);
        commitDispatch(store, room.code, "table", "startHand");
        completeHand(store, room);
        store.setSeatDisconnected(room.code, 1, true);

        expect(commitDispatch(store, room.code, "table", "nextHand")).toEqual({
          reason: "not-enough-players",
        });
      });

      it("rejects nextHand as stale-next-hand while a hand is still live, leaving seats and button untouched", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        commitDispatch(store, room.code, "table", "startHand");
        store.setSeatDisconnected(room.code, 2, true);

        const seatsBefore = room.engine?.seats;
        const buttonBefore = room.engine?.button;

        const result = commitDispatch(store, room.code, "table", "nextHand");

        expect(result).toMatchObject({ reason: "stale-next-hand" });
        expect(room.engine?.seats).toBe(seatsBefore);
        expect(room.engine?.button).toBe(buttonBefore);
        expect(room.engine?.hand?.status).toBe("betting");
      });
    });

    describe("ADR-0003: manual eviction", () => {
      it("auto-folds the current actor before freeing the evicted seat", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        commitDispatch(store, room.code, "table", "startHand");
        const actor = store.currentActor(room.code);
        if (actor === undefined) throw new Error("expected a current actor");

        commitEviction(store, room.code, actor);

        expect(room.seats[actor]).toMatchObject({ claimed: false });
        expect(store.currentActor(room.code)).not.toBe(actor);
        if (room.engine?.hand?.status !== "betting") {
          throw new Error("expected the hand to continue");
        }
        expect(room.engine.hand.players.get(actor)?.folded).toBe(true);
      });

      it("keeps a bot reclaimed into an evicted live seat out until the next hand", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        commitDispatch(store, room.code, "table", "startHand");
        const actor = store.currentActor(room.code);
        if (actor === undefined) throw new Error("expected a current actor");

        commitEviction(store, room.code, actor);
        const added = store.addBots(room, 1);
        const bot = added.seats[0];
        if (bot === undefined) throw new Error("expected a bot seat");

        expect(bot.id).toBe(actor);
        expect(bot.waitingForNextHand).toBe(true);
        expect(toRoomView(room).seats[actor]).toMatchObject({
          claimed: true,
          bot: true,
          sittingOut: true,
          sittingOutReason: "waiting-for-next-hand",
        });
        if (room.engine?.hand?.status !== "betting") {
          throw new Error("expected the hand to continue");
        }
        expect(room.engine.hand.players.get(actor)?.folded).toBe(true);

        completeHand(store, room);
        const next = commitDispatch(store, room.code, "table", "nextHand");
        if (!("steps" in next)) throw new Error("expected next-hand steps");
        const holeCardsDealt = next.steps.find(
          (step) => step.event.type === "HoleCardsDealt",
        )?.event;
        if (holeCardsDealt?.type !== "HoleCardsDealt") {
          throw new Error("expected HoleCardsDealt");
        }

        expect(holeCardsDealt.deals.map((deal) => deal.seatId)).toContain(
          actor,
        );
        expect(bot).not.toHaveProperty("waitingForNextHand");
        expect(toRoomView(room).seats[actor]).toMatchObject({
          sittingOut: false,
          sittingOutReason: null,
          bot: true,
        });
      });

      it("auto-folds a later in-hand seat without moving the current actor", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        commitDispatch(store, room.code, "table", "startHand");
        if (room.engine?.hand?.status !== "betting") {
          throw new Error("expected a betting hand");
        }
        const actor = room.engine.hand.toAct[0];
        const evicted = room.engine.hand.toAct[1];
        if (actor === undefined || evicted === undefined) {
          throw new Error("expected two seats to be awaiting action");
        }

        const result = commitEviction(store, room.code, evicted);

        if (result.transaction === undefined) {
          throw new Error("expected the eviction fold to dispatch");
        }
        expect(result.transaction.command).toEqual({
          type: "evict",
          seatId: evicted,
        });
        expect(result.transaction.steps.map((step) => step.event)).toEqual([
          { type: "ActionTaken", seatId: evicted, action: "fold" },
        ]);
        expect(room.seats[evicted]).toMatchObject({ claimed: false });
        expect(store.currentActor(room.code)).toBe(actor);
        expect(room.engine.hand.toAct).not.toContain(evicted);
        expect(room.engine.hand.players.get(evicted)?.folded).toBe(true);
      });

      it("completes a heads-up hand when evicting the current actor", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 2);
        commitDispatch(store, room.code, "table", "startHand");
        const actor = store.currentActor(room.code);
        if (actor === undefined) throw new Error("expected a current actor");

        const result = commitEviction(store, room.code, actor);

        if (result.transaction === undefined) {
          throw new Error("expected the eviction fold to dispatch");
        }
        expect(result.transaction.steps.map((step) => step.event.type)).toEqual(
          ["ActionTaken", "HandFoldedOut", "HandComplete"],
        );
        expect(room.seats[actor]).toMatchObject({ claimed: false });
        expect(store.currentActor(room.code)).toBeUndefined();
        expect(room.engine?.hand?.status).toBe("complete");
      });

      it("frees a claimed seat via evictSeat regardless of connection status", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        commitDispatch(store, room.code, "table", "startHand");
        completeHand(store, room);
        store.setSeatDisconnected(room.code, 2, true);

        commitEviction(store, room.code, 2);

        expect(room.seats[2]).toMatchObject({ claimed: false, token: null });
      });

      it("has no automatic eviction — a disconnected seat stays occupied across any number of hands", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        commitDispatch(store, room.code, "table", "startHand");
        completeHand(store, room);
        store.setSeatDisconnected(room.code, 2, true);

        for (let i = 0; i < 5; i++) {
          commitDispatch(store, room.code, "table", "nextHand");
          completeHand(store, room);
        }

        expect(room.seats[2]).toMatchObject({ claimed: true });
      });

      it("evicts an active (non-disconnected) seat just as freely", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 2);

        commitEviction(store, room.code, 1);

        expect(room.seats[1]).toMatchObject({ claimed: false });
      });
    });

    describe("ADR-0002: sitOut/sitIn", () => {
      it("excludes a voluntarily sitting-out seat from deal-in and never marks it disconnected", () => {
        const store = new RoomStore();
        const room = roomWithClaimedSeats(store, 3);
        store.setSittingOut(room.code, 2, true);

        const result = commitDispatch(store, room.code, "table", "startHand");

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
        commitDispatch(store, room.code, "table", "startHand");
        completeHand(store, room);

        store.setSittingOut(room.code, 2, false);
        const result = commitDispatch(store, room.code, "table", "nextHand");

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

  describe("the commit seam", () => {
    function roomWithClaimedSeats(
      store: RoomStore,
      seatIds: readonly SeatId[],
    ) {
      const room = store.create();
      for (const seatId of seatIds) {
        store.claimSeat(room.code, seatId, `P${String(seatId)}`);
      }
      return room;
    }

    /** Checks the Hand down to Showdown, calling only where a check is illegal. */
    function playToShowdown(store: RoomStore, code: string): void {
      commitDispatch(store, code, "table", "startHand");
      for (let step = 0; step < MAX_ACTIONS_TO_SHOWDOWN; step++) {
        const actor = store.currentActor(code);
        if (actor === undefined) return;
        const checked = commitDispatch(store, code, actor, "check");
        if ("reason" in checked) commitDispatch(store, code, actor, "call");
      }
      throw new Error("hand never reached showdown");
    }

    const MAX_ACTIONS_TO_SHOWDOWN = 16;

    function stagedDispatch(
      store: RoomStore,
      code: string,
      identity: SeatId | "table",
      type: SeatCommandType,
    ) {
      const result = store.dispatch(code, identity, type);
      if (!("commit" in result)) throw new Error("expected a transaction");
      return result;
    }

    it("changes nothing about the room until the transaction commits", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1]);

      const transaction = stagedDispatch(
        store,
        room.code,
        "table",
        "startHand",
      );

      expect(room.engine).toBeNull();
      expect(room.revision).toBe(0);
      expect(store.currentActor(room.code)).toBeUndefined();

      transaction.commit();

      expect(room.engine?.hand?.status).toBe("betting");
      expect(room.revision).toBe(1);
    });

    it("leaves a discarded dispatch no trace, and takes the next one", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1]);

      stagedDispatch(store, room.code, "table", "startHand").discard();

      expect(room.engine).toBeNull();
      expect(room.revision).toBe(0);

      const retried = stagedDispatch(store, room.code, "table", "startHand");
      retried.commit();

      expect(room.engine?.hand?.status).toBe("betting");
      expect(room.revision).toBe(1);
    });

    it("refuses to settle a transaction twice", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1]);
      const transaction = stagedDispatch(
        store,
        room.code,
        "table",
        "startHand",
      );

      transaction.commit();

      expect(() => {
        transaction.commit();
      }).toThrow(/already settled/);
      expect(() => {
        transaction.discard();
      }).toThrow(/already settled/);
      expect(room.revision).toBe(1);
    });

    it("leaves a rejected command's revision alone, so a queued clock fold survives it", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1]);
      commitDispatch(store, room.code, "table", "startHand");
      const revision = room.revision;
      const actor = store.currentActor(room.code);
      if (actor === undefined) throw new Error("expected a current actor");

      const rejected = store.dispatch(room.code, 1 - actor, "fold");

      expect(rejected).toMatchObject({ reason: "not-your-turn" });
      expect(room.revision).toBe(revision);
    });

    it("stages the seat shrink with the hand it belongs to, not before", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [2, 5, 7]);
      commitDispatch(store, room.code, "table", "startHand");
      store.changeSeatCount(room.code, 3);
      for (let fold = 0; fold < 2; fold++) {
        const actor = store.currentActor(room.code);
        if (actor === undefined) throw new Error("expected a current actor");
        commitDispatch(store, room.code, actor, "fold");
      }
      const engineBefore = room.engine;

      const transaction = stagedDispatch(store, room.code, "table", "nextHand");

      expect(room.seats).toHaveLength(MAX_SEAT_COUNT);
      expect(room.pendingSeatCount).toBe(3);
      expect(room.engine).toBe(engineBefore);
      expect(transaction.seatMoves).toEqual([
        { from: 2, to: 0 },
        { from: 5, to: 1 },
        { from: 7, to: 2 },
      ]);

      transaction.commit();

      expect(room.seats).toHaveLength(3);
      expect(room.pendingSeatCount).toBeNull();
      expect(room.engine?.seats).toEqual([0, 1, 2]);
    });

    it("frees an evicted seat only once its fold is committed", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1, 2]);
      commitDispatch(store, room.code, "table", "startHand");
      const actor = store.currentActor(room.code);
      if (actor === undefined) throw new Error("expected a current actor");

      const eviction = store.evictSeat(room.code, actor);

      if (eviction.transaction === undefined) {
        throw new Error("expected the eviction fold to stage");
      }
      expect(room.seats[actor]).toMatchObject({ claimed: true });
      expect(store.currentActor(room.code)).toBe(actor);

      eviction.transaction.commit();

      expect(room.seats[actor]).toMatchObject({ claimed: false });
      expect(store.currentActor(room.code)).not.toBe(actor);
    });

    it("carries the whole operation the recording takes", () => {
      const startedAt = "2026-08-17T19:30:00.000Z";
      const store = new RoomStore(
        Math.random,
        undefined,
        () => "seed-1",
        undefined,
        () => new Date(startedAt),
      );
      const room = roomWithClaimedSeats(store, [0, 1]);

      const transaction = stagedDispatch(
        store,
        room.code,
        "table",
        "startHand",
      );

      expect(transaction.operation).toEqual({
        context: { startedAt, seats: [0, 1], button: 0 },
        command: { type: "startHand", seatId: 0, seed: "seed-1" },
        outcome: transaction.steps.map((step) => step.event),
      });
    });

    it("gives a rejection the operation that records it, and no hand context", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1]);
      commitDispatch(store, room.code, "table", "startHand");

      const rejected = store.dispatch(room.code, "table", "startHand");

      if (!("reason" in rejected)) throw new Error("expected a rejection");
      expect(rejected.operation).toEqual({
        command: rejected.command,
        outcome: rejected.rejection,
      });
    });

    it("stamps an all-in raise with the seat that declared it", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1]);
      commitDispatch(store, room.code, "table", "startHand");
      const actor = store.currentActor(room.code);
      if (actor === undefined) throw new Error("expected a current actor");

      const declared = commitDispatch(store, room.code, actor, "allInRaise");

      if (!("steps" in declared)) throw new Error("expected a transaction");
      expect(declared.command).toEqual({ type: "allInRaise", seatId: actor });
      expect(declared.steps.map((step) => step.event.type)).toContain(
        "ActionTaken",
      );
    });

    it("refuses an all-in call from the table", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1]);
      commitDispatch(store, room.code, "table", "startHand");

      expect(store.dispatch(room.code, "table", "allInCall")).toEqual({
        error: "not-permitted",
      });
    });

    it("takes reveal from the table and stamps a seat on it", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1]);
      playToShowdown(store, room.code);

      const revealed = commitDispatch(store, room.code, "table", "reveal");

      if (!("steps" in revealed)) throw new Error("expected a transaction");
      expect(revealed.command).toEqual({ type: "reveal", seatId: 0 });
      expect(revealed.steps.map((step) => step.event.type)).toContain(
        "WinnersDeclared",
      );
    });

    it("refuses reveal from a player and show from the table", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1]);
      playToShowdown(store, room.code);

      expect(store.dispatch(room.code, 0, "reveal")).toEqual({
        error: "not-permitted",
      });
      expect(store.dispatch(room.code, "table", "show")).toEqual({
        error: "not-permitted",
      });
    });

    it("shows a player's own hand on their own command", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0, 1]);
      playToShowdown(store, room.code);
      commitDispatch(store, room.code, "table", "reveal");

      const shown = commitDispatch(store, room.code, 1, "show");

      if (!("steps" in shown)) throw new Error("expected a transaction");
      expect(shown.command).toEqual({ type: "show", seatId: 1 });
    });

    it("has no operation for a refusal the engine never ruled on", () => {
      const store = new RoomStore();
      const room = roomWithClaimedSeats(store, [0]);

      expect(store.dispatch(room.code, "table", "startHand")).toEqual({
        reason: "not-enough-players",
      });
    });
  });

  describe("currentActor", () => {
    function roomWithClaimedSeats(store: RoomStore, count: number) {
      const room = store.create();
      for (let seatId = 0; seatId < count; seatId++) {
        store.claimSeat(room.code, seatId, `P${String(seatId)}`);
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
      const started = commitDispatch(store, room.code, "table", "startHand");
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
      commitDispatch(store, room.code, "table", "startHand");
      const actor = store.currentActor(room.code);
      if (actor === undefined) throw new Error("expected a current actor");

      commitDispatch(store, room.code, actor, "call");

      expect(store.currentActor(room.code)).not.toBe(actor);
    });
  });
});

describe("toRoomView", () => {
  it("projects seats without their tokens", () => {
    const store = new RoomStore();
    const room = store.create();
    store.claimSeat(room.code, 0, "P0");

    const view = toRoomView(room);

    expect(view).toEqual({
      code: room.code,
      pendingSeatCount: null,
      pendingShotClock: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
      shotClockSettings: DEFAULT_SHOT_CLOCK,
      showdownOverlay: DEFAULT_SHOWDOWN_OVERLAY,
      seats: [
        {
          id: 0,
          claimed: true,
          displayName: "P0",
          sittingOut: false,
          sittingOutReason: null,
          disconnected: false,
        },
        ...Array.from({ length: DEFAULT_SEAT_COUNT - 1 }, (_, i) => ({
          id: i + 1,
          claimed: false,
          sittingOut: false,
          sittingOutReason: null,
          disconnected: false,
        })),
      ],
    });
  });
});

describe("changeSoundSettings", () => {
  it("defaults a fresh room to fully audible", () => {
    const store = new RoomStore();
    const room = store.create();

    expect(toRoomView(room).soundSettings).toEqual(DEFAULT_SOUND_SETTINGS);
  });

  it("replaces the whole triple atomically", () => {
    const store = new RoomStore();
    const room = store.create();
    const settings = {
      sounds: true,
      cards: false,
      actions: true,
      notifications: true,
    };

    const result = store.changeSoundSettings(room.code, settings);

    expect(result).toEqual(settings);
    expect(toRoomView(room).soundSettings).toEqual(settings);
  });

  it("reports an unknown room", () => {
    const store = new RoomStore();

    expect(store.changeSoundSettings("ZZZZ", DEFAULT_SOUND_SETTINGS)).toEqual({
      error: "room-not-found",
    });
  });
});

describe("changeShotClockSettings", () => {
  it("queues an edit during a hand and applies it at the next deal-in", () => {
    const store = new RoomStore();
    const room = store.create();
    store.claimSeat(room.code, 0, "P0");
    store.claimSeat(room.code, 1, "P1");
    const started = commitDispatch(store, room.code, "table", "startHand");
    if (!("steps" in started)) throw new Error("expected start-hand steps");
    const settings = { enabled: true, seconds: 30 };

    expect(store.changeShotClockSettings(room.code, settings)).toEqual(
      settings,
    );
    expect(room.shotClockSettings).toEqual(DEFAULT_SHOT_CLOCK);
    expect(toRoomView(room).pendingShotClock).toEqual(settings);

    const actor = store.currentActor(room.code);
    if (actor === undefined) throw new Error("expected a current actor");
    const folded = commitDispatch(store, room.code, actor, "fold");
    if (!("steps" in folded)) throw new Error("expected fold steps");
    const next = commitDispatch(store, room.code, "table", "nextHand");
    if (!("steps" in next)) throw new Error("expected next-hand steps");

    expect(room.shotClockSettings).toEqual(settings);
    expect(room.pendingShotClock).toBeNull();
    expect(toRoomView(room).shotClockSettings).toEqual(settings);
  });

  it("rejects an invalid duration without changing the room", () => {
    const store = new RoomStore();
    const room = store.create();

    expect(
      store.changeShotClockSettings(room.code, {
        enabled: true,
        seconds: 4,
      }),
    ).toEqual({ error: "invalid-shot-clock" });
    expect(room.shotClockSettings).toEqual(DEFAULT_SHOT_CLOCK);
    expect(room.pendingShotClock).toBeNull();
  });

  it("reports an unknown room", () => {
    const store = new RoomStore();

    expect(
      store.changeShotClockSettings("ZZZZ", {
        enabled: true,
        seconds: 30,
      }),
    ).toEqual({ error: "room-not-found" });
  });
});
