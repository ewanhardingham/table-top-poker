import { create } from "zustand";
import { createActionSlice, type ActionSlice } from "./actionSlice.js";
import {
  type ConnectionSlice,
  createConnectionSlice,
} from "./connectionSlice.js";
import { createHandSlice, type HandSlice } from "./handSlice.js";
import { createRoomSlice, type RoomSlice } from "./roomSlice.js";
import { createSeatSlice, type SeatSlice } from "./seatSlice.js";

export type PlayerStore =
  ConnectionSlice & RoomSlice & SeatSlice & HandSlice & ActionSlice;

export const usePlayerStore = create<PlayerStore>()((...args) => ({
  ...createConnectionSlice(...args),
  ...createRoomSlice(...args),
  ...createSeatSlice(...args),
  ...createHandSlice(...args),
  ...createActionSlice(...args),
}));
