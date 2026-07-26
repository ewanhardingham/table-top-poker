import { create } from "zustand";
import {
  type ConnectionSlice,
  createConnectionSlice,
} from "./connectionSlice.js";
import { createRoomSlice, type RoomSlice } from "./roomSlice.js";

export type TableStore = ConnectionSlice & RoomSlice;

export const useTableStore = create<TableStore>()((...args) => ({
  ...createConnectionSlice(...args),
  ...createRoomSlice(...args),
}));
