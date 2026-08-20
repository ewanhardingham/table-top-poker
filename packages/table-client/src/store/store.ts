import { create } from "zustand";
import {
  type ConnectionSlice,
  createConnectionSlice,
} from "./connectionSlice.js";
import { createConfigSlice, type ConfigSlice } from "./configSlice.js";
import {
  createHandHistorySlice,
  type HandHistorySlice,
} from "./handHistorySlice.js";
import { createHandSlice, type HandSlice } from "./handSlice.js";
import { createReplaySlice, type ReplaySlice } from "./replaySlice.js";
import { createRoomSlice, type RoomSlice } from "./roomSlice.js";

export type TableStore = ConnectionSlice &
  ConfigSlice &
  RoomSlice &
  HandSlice &
  HandHistorySlice &
  ReplaySlice;

export const useTableStore = create<TableStore>()((...args) => ({
  ...createConnectionSlice(...args),
  ...createConfigSlice(...args),
  ...createRoomSlice(...args),
  ...createHandSlice(...args),
  ...createHandHistorySlice(...args),
  ...createReplaySlice(...args),
}));
