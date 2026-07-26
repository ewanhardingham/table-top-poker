import type { StateCreator } from "zustand";

export interface RoomSlice {
  readonly roomCode: string | null;
  readonly setRoomCode: (roomCode: string | null) => void;
}

/** Placeholder slice — replaced by the real room `view` snapshot once ticket 13 lands. */
export const createRoomSlice: StateCreator<RoomSlice> = (set) => ({
  roomCode: null,
  setRoomCode: (roomCode) => {
    set({ roomCode });
  },
});
