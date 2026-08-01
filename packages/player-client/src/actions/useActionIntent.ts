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
 * Whether `action` may be sent right now: it must be legal in the latest
 * view and nothing else already in flight. Buttons are expected to disable
 * themselves off this same state (`legalActions`/`pendingAction`) — this is
 * the belt-and-braces guard against a stale click slipping through.
 */
export function canAct(
  legalActions: readonly ActionType[],
  pendingAction: ActionType | null,
  action: ActionType,
): boolean {
  return pendingAction === null && legalActions.includes(action);
}

/**
 * The action-intent module (Phase 1 spec #130 §9): `fold`/`check`/
 * `call`/`raise`, plus `legalActions` derived from the latest view
 * snapshot.
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
      if (!canAct(legalActions, pendingAction, action)) return;
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
