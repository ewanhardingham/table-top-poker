import type { ActionType } from "@table-top-poker/protocol";
import { rejectionCopy } from "./actions/rejectionCopy.js";
import type { ActionRejection } from "./store/actionSlice.js";

export interface ActionBarProps {
  readonly legalActions: readonly ActionType[];
  readonly pendingAction: ActionType | null;
  readonly rejection: ActionRejection | null;
  readonly onFold: () => void;
  readonly onCheck: () => void;
  readonly onCall: () => void;
  readonly onRaise: () => void;
}

const LABELS: Record<ActionType, string> = {
  fold: "Fold",
  check: "Check",
  call: "Call",
  raise: "Raise",
};

/**
 * Fold/check/call/raise as the permanent base layer (docs/phase-1-spec.md
 * §9) — always rendered during a betting phase, never swapped out for
 * gestures. Disabled unless the action is in `legalActions` and nothing
 * else is pending; the pressed button carries `data-pending` until its
 * ack/reject lands. A rejection renders inline, once, near the buttons —
 * no toast, no persistent banner.
 */
export function ActionBar({
  legalActions,
  pendingAction,
  rejection,
  onFold,
  onCheck,
  onCall,
  onRaise,
}: ActionBarProps) {
  const handlers: Record<ActionType, () => void> = {
    fold: onFold,
    check: onCheck,
    call: onCall,
    raise: onRaise,
  };

  return (
    <div data-testid="action-bar">
      {(["fold", "check", "call", "raise"] as const).map((action) => (
        <div key={action} data-testid={`action-group-${action}`}>
          <button
            type="button"
            data-testid={`action-${action}`}
            data-pending={pendingAction === action}
            disabled={!legalActions.includes(action) || pendingAction !== null}
            onClick={handlers[action]}
          >
            {LABELS[action]}
          </button>
          {rejection !== null && rejection.action === action && (
            <div data-testid="action-rejection" data-rejected-action={action}>
              {rejectionCopy(rejection.reason)}
            </div>
          )}
        </div>
      ))}
      {/* No pending command to attribute the reject to (no correlation id
          on the wire, docs/phase-1-spec.md §6) — falls back to a bar-level
          message rather than guessing which button triggered it. */}
      {rejection !== null && rejection.action === null && (
        <div data-testid="action-rejection" data-rejected-action="">
          {rejectionCopy(rejection.reason)}
        </div>
      )}
    </div>
  );
}
