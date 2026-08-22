import type { ActionType, ClientCommand } from "@table-top-poker/protocol";
import { useCallback } from "react";
import { usePlayerStore } from "../store/store.js";
import type { AllInAction } from "./allIn.js";
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
  readonly allIn: (action: AllInAction) => void;
  readonly show: () => void;
  readonly muck: () => void;
}

type SendableAction = Extract<ClientCommand["type"], ActionType>;

export function canAct(
  legalActions: readonly ActionType[],
  pendingAction: ActionType | null,
  action: ActionType,
): boolean {
  return pendingAction === null && legalActions.includes(action);
}

export function useActionIntent(
  send: (command: ClientCommand) => void,
): ActionIntent {
  const handView = usePlayerStore((state) => state.handView);
  const pendingAction = usePlayerStore((state) => state.pendingAction);
  const rejection = usePlayerStore((state) => state.rejection);
  const sendStarted = usePlayerStore((state) => state.sendStarted);

  const legalActions = legalActionsFromView(handView);

  const act = useCallback(
    (action: SendableAction) => {
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
    allIn: (action: AllInAction) => {
      act(action);
    },
    show: () => {
      send({ type: "show" });
    },
    muck: () => {
      send({ type: "muck" });
    },
  };
}
