import type {
  ActionType,
  RejectionReason,
  ServerRejectionReason,
} from "@table-top-poker/protocol";
import type { StateCreator } from "zustand";

export interface ActionRejection {
  /**
   * The action `reason` was rejecting, or `null` if a `command-rejected`
   * arrived with nothing pending — `command-rejected` carries no
   * correlation id (docs/phase-1-spec.md §6), so this is a best-effort
   * attribution, not a guarantee.
   */
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

/**
 * Tracks the one command a player may have in flight. `sendStarted` also
 * clears any stale rejection, so pressing another button dismisses the old
 * failure message even before a fresh view arrives — matching the "clears
 * on the player's next legal action or next view snapshot" rule in
 * docs/phase-1-spec.md §9.
 */
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
