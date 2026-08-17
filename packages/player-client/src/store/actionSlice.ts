import type {
  ActionType,
  RejectionReason,
  ServerRejectionReason,
} from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface ActionRejection {
  readonly action: ActionType | null;
  readonly reason: RejectionReason | ServerRejectionReason;
}

export interface ActionSlice {
  readonly pendingAction: ActionType | null;
  readonly rejection: ActionRejection | null;
  readonly sendStarted: (action: ActionType) => void;
  readonly commandRejected: (
    reason: RejectionReason | ServerRejectionReason,
  ) => void;
  readonly viewSnapshotReceived: () => void;
}

export const createActionSlice: StateCreator<ActionSlice> = (set) => ({
  pendingAction: null,
  rejection: null,
  sendStarted: (action) => {
    set({ pendingAction: action, rejection: null });
  },
  commandRejected: (reason) => {
    set((state) => ({
      pendingAction: null,
      rejection: { action: state.pendingAction, reason },
    }));
  },
  viewSnapshotReceived: () => {
    set({ pendingAction: null, rejection: null });
  },
});
