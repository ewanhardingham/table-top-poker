import { randomUUID } from "node:crypto";
import type { RoomView, SeatId } from "@table-top-poker/protocol";
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
  handInProgress: boolean;
}

export type ClaimSeatError =
  "room-not-found" | "seat-not-found" | "seat-already-claimed";

export type ClaimSeatResult = { seat: Seat } | { error: ClaimSeatError };

function makeSeats(): Seat[] {
  return Array.from({ length: SEAT_COUNT }, (_, id) => ({
    id,
    claimed: false,
    token: null,
    sittingOut: false,
  }));
}

/**
 * In-memory room registry. Seats are structural only — no engine attached
 * yet (ticket 29 wires the engine and takes over `sittingOut` on deal-in).
 */
export class RoomStore {
  readonly #rooms = new Map<string, Room>();
  readonly #random: () => number;
  readonly #generateToken: () => string;

  constructor(
    random: () => number = Math.random,
    generateToken: () => string = randomUUID,
  ) {
    this.#random = random;
    this.#generateToken = generateToken;
  }

  create(): Room {
    const code = generateRoomCode((c) => this.#rooms.has(c), this.#random);
    const room: Room = { code, seats: makeSeats(), handInProgress: false };
    this.#rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.#rooms.get(code);
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
    seat.sittingOut = room.handInProgress;
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

  /** Stand-in for the engine-driven flag ticket 29 will maintain. */
  markHandInProgress(code: string, inProgress: boolean): void {
    const room = this.#rooms.get(code);
    if (!room) return;
    room.handInProgress = inProgress;
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
