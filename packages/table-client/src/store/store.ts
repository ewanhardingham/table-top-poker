import { create } from "zustand";
import {
  type ConnectionSlice,
  createConnectionSlice,
} from "./connectionSlice.js";
import { createHandSlice, type HandSlice } from "./handSlice.js";
import { createRoomSlice, type RoomSlice } from "./roomSlice.js";

export type TableStore = ConnectionSlice & RoomSlice & HandSlice;

export const useTableStore = create<TableStore>()((...args) => ({
  ...createConnectionSlice(...args),
  ...createRoomSlice(...args),
  ...createHandSlice(...args),
}));
