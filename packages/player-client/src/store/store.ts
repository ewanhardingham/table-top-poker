import { create } from "zustand";
import {
  type ConnectionSlice,
  createConnectionSlice,
} from "./connectionSlice.js";
import { createSeatSlice, type SeatSlice } from "./seatSlice.js";

export type PlayerStore = ConnectionSlice & SeatSlice;

export const usePlayerStore = create<PlayerStore>()((...args) => ({
  ...createConnectionSlice(...args),
  ...createSeatSlice(...args),
}));
