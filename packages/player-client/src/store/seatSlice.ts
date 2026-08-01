import type { SeatId, SittingOutReason } from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface SeatSlice {
  readonly seatId: SeatId | null;
  readonly displayName: string | null;
  readonly sittingOut: boolean;
  readonly sittingOutReason: SittingOutReason | null;
  readonly setSeat: (seat: {
    seatId: SeatId;
    sittingOut: boolean;
    sittingOutReason?: SittingOutReason | null;
    displayName?: string | null;
  }) => void;
  readonly moveSeat: (seatId: SeatId) => void;
  readonly clearSeat: () => void;
}

export const createSeatSlice: StateCreator<SeatSlice> = (set) => ({
  seatId: null,
  displayName: null,
  sittingOut: false,
  sittingOutReason: null,
  setSeat: ({
    seatId,
    sittingOut,
    sittingOutReason = null,
    displayName = null,
  }) => {
    set({ seatId, sittingOut, sittingOutReason, displayName });
  },
  moveSeat: (seatId) => {
    set({ seatId });
  },
  clearSeat: () => {
    set({
      seatId: null,
      displayName: null,
      sittingOut: false,
      sittingOutReason: null,
    });
  },
});
