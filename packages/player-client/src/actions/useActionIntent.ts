import type { ActionType, ClientCommand } from "@table-top-poker/protocol";
import { useCallback } from "react";
import { usePlayerStore } from "../store/store.js";
import type { ActionRejection } from "../store/actionSlice.js";
import { legalActionsFromView } from "./legalActionsFromView.js";

export interface ActionIntent {
  readonly legalActions: readonly ActionType[];
  readonly pendingAction: ActionType | null;
  readonly rejection: ActionRejection | null;
  readonly fold: () => void;
  readonly check: () => void;
  readonly call: () => void;
  readonly raise: () => void;
}

/**
 * The action-intent module (docs/phase-1-spec.md §9): `fold`/`check`/
 * `call`/`raise`, plus `legalActions` derived from the latest view
 * snapshot. Each function is a no-op unless the action is currently legal
 * and nothing else is already pending — buttons are expected to disable
 * themselves off this same state, this is the belt-and-braces guard.
 */
export function useActionIntent(
  send: (command: ClientCommand) => void,
): ActionIntent {
  const handView = usePlayerStore((state) => state.handView);
  const pendingAction = usePlayerStore((state) => state.pendingAction);
  const rejection = usePlayerStore((state) => state.rejection);
  const sendStarted = usePlayerStore((state) => state.sendStarted);

  const legalActions = legalActionsFromView(handView);

  const act = useCallback(
    (action: ActionType) => {
      if (pendingAction !== null) return;
      if (!legalActions.includes(action)) return;
      sendStarted(action);
      send({ type: action });
    },
    [pendingAction, legalActions, sendStarted, send],
  );

  return {
    legalActions,
    pendingAction,
    rejection,
    fold: () => {
      act("fold");
    },
    check: () => {
      act("check");
    },
    call: () => {
      act("call");
    },
    raise: () => {
      act("raise");
    },
  };
}
