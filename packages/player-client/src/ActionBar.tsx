import type { ActionType } from "@table-top-poker/protocol";
import {
  color,
  font,
  fontSize,
  radius,
  shadow,
} from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";
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

const ACTIONS = ["fold", "check", "call", "raise"] as const;

const LABELS: Record<ActionType, string> = {
  fold: "Fold",
  check: "Check",
  call: "Call",
  raise: "Raise",
};

/** Matches the prototype's per-button sub-caption ("muck"/"no bet"/…). */
const SUB_LABELS: Record<ActionType, string> = {
  fold: "muck",
  check: "no bet",
  call: "match",
  raise: "put in more",
};

const disabledStyle: CSSProperties = {
  border: `1px solid ${color.border}`,
  background: "rgba(255,255,255,.03)",
  color: color.textFaint,
};

const primaryToneStyle: CSSProperties = {
  border: `1px solid ${color.accentBorder}`,
  background: "rgba(229,68,60,.12)",
  color: color.textBright,
};

const toneStyle: Record<ActionType, CSSProperties> = {
  fold: {
    border: "1px solid rgba(232,139,125,.42)",
    background: "rgba(232,139,125,.13)",
    color: "#f0b3a8",
  },
  check: primaryToneStyle,
  call: primaryToneStyle,
  raise: {
    border: 0,
    background: color.pillGradient,
    color: color.pillInk,
    boxShadow: shadow.pill,
  },
};

const rejectionStyle: CSSProperties = {
  padding: "0.7em 0.9em",
  borderRadius: radius.control,
  background: "rgba(232,139,125,.13)",
  border: "1px solid rgba(232,139,125,.34)",
  fontSize: fontSize.caption,
  color: "#f0aa9d",
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
    <div
      data-testid="action-bar"
      style={{
        flex: "none",
        display: "flex",
        flexDirection: "column",
        gap: "0.7em",
      }}
    >
      {/* No pending command to attribute the reject to (no correlation id
          on the wire, docs/phase-1-spec.md §6) — falls back to a bar-level
          message rather than guessing which button triggered it. */}
      {rejection !== null && rejection.action === null && (
        <div
          data-testid="action-rejection"
          data-rejected-action=""
          style={rejectionStyle}
        >
          {rejectionCopy(rejection.reason)}
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.7em",
        }}
      >
        {ACTIONS.map((action) => {
          const enabled =
            legalActions.includes(action) && pendingAction === null;
          return (
            <div
              key={action}
              data-testid={`action-group-${action}`}
              style={{ display: "flex", flexDirection: "column", gap: "0.4em" }}
            >
              <button
                type="button"
                data-testid={`action-${action}`}
                data-pending={pendingAction === action}
                disabled={
                  !legalActions.includes(action) || pendingAction !== null
                }
                onClick={handlers[action]}
                style={{
                  height: "4.6em",
                  borderRadius: radius.control,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.2em",
                  fontFamily: font.body,
                  ...(enabled ? toneStyle[action] : disabledStyle),
                }}
              >
                <span
                  style={{
                    fontSize: fontSize.lg,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                  }}
                >
                  {LABELS[action]}
                </span>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: fontSize.xs,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    opacity: 0.72,
                  }}
                >
                  {SUB_LABELS[action]}
                </span>
              </button>
              {rejection !== null && rejection.action === action && (
                <div
                  data-testid="action-rejection"
                  data-rejected-action={action}
                  style={rejectionStyle}
                >
                  {rejectionCopy(rejection.reason)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
