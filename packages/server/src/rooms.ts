import { randomUUID } from "node:crypto";
import {
  apply,
  createInitialState,
  decide,
  type ClientCommandType,
  type Command,
  type EngineState,
  type HandEvent,
  type RejectionReason,
  type RoomView,
  type SeatId,
} from "@table-top-poker/protocol";
import { generateRoomCode } from "./room-code.js";

export const SEAT_COUNT = 8;

/**
 * `Seat` and `Room` are `RoomStore`'s internal mutable aggregate state, not
 * wire DTOs — mutated in place by the store rather than replaced, unlike
 * the `readonly` view/slice types elsewhere that cross a render or wire
 * boundary. `toRoomView` is the seam that turns them into an immutable
 * snapshot for broadcast.
 */
export interface Seat {
  readonly id: SeatId;
  claimed: boolean;
  token: string | null;
  sittingOut: boolean;
}

export interface Room {
  readonly code: string;
  readonly seats: Seat[];
  /** Null until the room's first `startHand` — see `RoomStore.dispatch`. */
  engine: EngineState | null;
}

export type ClaimSeatError =
  "room-not-found" | "seat-not-found" | "seat-already-claimed";

export type ClaimSeatResult = { seat: Seat } | { error: ClaimSeatError };

/** A step of engine state produced by one dispatched command, event by event. */
export interface DispatchStep {
  readonly event: HandEvent;
  readonly state: EngineState;
}

export type DispatchRejectionReason = RejectionReason | "not-enough-players";

export type DispatchResult =
  | { readonly steps: readonly DispatchStep[] }
  | { readonly error: "room-not-found" | "not-permitted" }
  | { readonly reason: DispatchRejectionReason };

const TABLE_ONLY_COMMANDS: ReadonlySet<ClientCommandType> = new Set([
  "startHand",
  "nextHand",
]);

function makeSeats(): Seat[] {
  return Array.from({ length: SEAT_COUNT }, (_, id) => ({
    id,
    claimed: false,
    token: null,
    sittingOut: false,
  }));
}

/**
 * True once the room's first hand has ever started. `nextHand` reuses the
 * same `EngineState` for the room's whole life (its `seats` are fixed at
 * creation, per `createInitialState`), so there's no later point at which a
 * seat that missed the deal-in is automatically un-sat-out — that's future
 * scope, not this ticket's.
 */
function isHandInProgress(room: Room): boolean {
  return room.engine !== null;
}

/** In-memory room registry, with the engine wired in behind `dispatch`. */
export class RoomStore {
  readonly #rooms = new Map<string, Room>();
  readonly #random: () => number;
  readonly #generateToken: () => string;
  readonly #generateSeed: () => string;

  constructor(
    random: () => number = Math.random,
    generateToken: () => string = randomUUID,
    generateSeed: () => string = randomUUID,
  ) {
    this.#random = random;
    this.#generateToken = generateToken;
    this.#generateSeed = generateSeed;
  }

  create(): Room {
    const code = generateRoomCode((c) => this.#rooms.has(c), this.#random);
    const room: Room = { code, seats: makeSeats(), engine: null };
    this.#rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.#rooms.get(code);
  }

  /** The seat currently owed a decision in `code`'s hand, or undefined between/after hands. */
  currentActor(code: string): SeatId | undefined {
    const hand = this.#rooms.get(code)?.engine?.hand;
    if (hand?.status !== "betting") return undefined;
    return hand.toAct[0];
  }

  end(code: string): void {
    this.#rooms.delete(code);
  }

  claimSeat(code: string, seatId: SeatId): ClaimSeatResult {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };

    const seat = room.seats[seatId];
    if (!seat) return { error: "seat-not-found" };
    if (seat.claimed) return { error: "seat-already-claimed" };

    seat.claimed = true;
    seat.token = this.#generateToken();
    seat.sittingOut = isHandInProgress(room);
    return { seat };
  }

  /** Force-clears a claimed seat. Stand-in for real disconnect handling (ticket 33). */
  clearSeat(code: string, seatId: SeatId): void {
    const room = this.#rooms.get(code);
    const seat = room?.seats[seatId];
    if (!seat) return;

    seat.claimed = false;
    seat.token = null;
    seat.sittingOut = false;
  }

  /**
   * Runs one command through the engine on behalf of an authenticated
   * socket. `identity` is derived server-side from the WS connection, never
   * from the message payload — see docs/phase-1-spec.md §6. `startHand` and
   * `nextHand` are table-only at this layer (the engine itself places no
   * such restriction); everything else is seat-only. A room's first
   * `startHand` builds its `EngineState` from the seats currently claimed
   * and not sitting out — every other seat stays sitting out for that hand.
   */
  dispatch(
    code: string,
    identity: SeatId | "table",
    type: ClientCommandType,
  ): DispatchResult {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };

    const isTableCommand = TABLE_ONLY_COMMANDS.has(type);
    if (identity === "table" ? !isTableCommand : isTableCommand) {
      return { error: "not-permitted" };
    }

    if (type === "startHand" && room.engine === null) {
      const dealIn = room.seats
        .filter((seat) => seat.claimed && !seat.sittingOut)
        .map((seat) => seat.id);
      if (dealIn.length < 2) return { reason: "not-enough-players" };
      room.engine = createInitialState(dealIn);
    }

    if (room.engine === null) return { reason: "hand-not-in-progress" };

    const command = this.#buildCommand(identity, type);
    const result = decide(room.engine, command);
    if (!Array.isArray(result)) return { reason: result.reason };

    const steps: DispatchStep[] = [];
    let state = room.engine;
    for (const event of result) {
      state = apply(state, event);
      steps.push({ event, state });
    }
    room.engine = state;

    if (type === "startHand") {
      for (const seatId of room.engine.seats) {
        const seat = room.seats[seatId];
        if (seat) seat.sittingOut = false;
      }
    }

    return { steps };
  }

  /**
   * `playerId` is unused by the engine for `startHand`/`nextHand` (no
   * issuer restriction at that layer, per docs/phase-1-spec.md §3) — the
   * table isn't a seat, so there's no meaningful id to supply; `0` is an
   * arbitrary placeholder.
   */
  #buildCommand(identity: SeatId | "table", type: ClientCommandType): Command {
    if (type === "startHand" || type === "nextHand") {
      return { type, playerId: 0, seed: this.#generateSeed() };
    }
    return { type, playerId: identity as SeatId };
  }
}

/** Public seat/room projection — never carries a seat's claim token. */
export function toRoomView(room: Room): RoomView {
  return {
    code: room.code,
    seats: room.seats.map((seat) => ({
      id: seat.id,
      claimed: seat.claimed,
      sittingOut: seat.sittingOut,
    })),
  };
}
