import { create } from "zustand";
import {
  type ConnectionSlice,
  createConnectionSlice,
} from "./connectionSlice.js";
import { createConfigSlice, type ConfigSlice } from "./configSlice.js";
import { createHandSlice, type HandSlice } from "./handSlice.js";
import { createRoomSlice, type RoomSlice } from "./roomSlice.js";

export type TableStore = ConnectionSlice & ConfigSlice & RoomSlice & HandSlice;

export const useTableStore = create<TableStore>()((...args) => ({
  ...createConnectionSlice(...args),
  ...createConfigSlice(...args),
  ...createRoomSlice(...args),
  ...createHandSlice(...args),
}));
