import { generateRoomCode } from "./room-code.js";

export interface Room {
  readonly code: string;
  readonly createdAt: Date;
}

/** In-memory room registry. No engine attached yet — rooms are just codes. */
export class RoomStore {
  readonly #rooms = new Map<string, Room>();
  readonly #random: () => number;

  constructor(random: () => number = Math.random) {
    this.#random = random;
  }

  create(): Room {
    const code = generateRoomCode((c) => this.#rooms.has(c), this.#random);
    const room: Room = { code, createdAt: new Date() };
    this.#rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.#rooms.get(code);
  }

  end(code: string): void {
    this.#rooms.delete(code);
  }
}
