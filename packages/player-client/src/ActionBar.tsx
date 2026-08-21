import type { ActionType } from "@table-top-poker/protocol";
import {
  color,
  font,
  fontSize,
  radius,
  shadow,
} from "@table-top-poker/ui-shared";
import { useEffect, useState, type CSSProperties } from "react";
import { AllInRow } from "./AllInRow.js";
import {
  allInChoices,
  isAllInAction,
  pressAllIn,
  type AllInAction,
} from "./actions/allIn.js";
import { RejectionNotice } from "./actions/RejectionNotice.js";
import type { ActionRejection } from "./store/actionSlice.js";

export interface ActionBarProps {
  readonly legalActions: readonly ActionType[];
  readonly pendingAction: ActionType | null;
  readonly rejection: ActionRejection | null;
  readonly onFold: () => void;
  readonly onCheck: () => void;
  readonly onCall: () => void;
  readonly onRaise: () => void;
  readonly facingAllIn: boolean;
  readonly onAllIn: (action: AllInAction) => void;
}

const ACTIONS = ["fold", "check", "call", "raise"] as const;

type OfferedAction = (typeof ACTIONS)[number];

const LABELS: Record<OfferedAction, string> = {
  fold: "Fold",
  check: "Check",
  call: "Call",
  raise: "Raise",
};

const SUB_LABELS: Record<OfferedAction, string> = {
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

const toneStyle: Record<OfferedAction, CSSProperties> = {
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

export function ActionBar({
  legalActions,
  pendingAction,
  rejection,
  onFold,
  onCheck,
  onCall,
  onRaise,
  facingAllIn,
  onAllIn,
}: ActionBarProps) {
  const handlers: Record<OfferedAction, () => void> = {
    fold: onFold,
    check: onCheck,
    call: onCall,
    raise: onRaise,
  };
  const [armedAllIn, setArmedAllIn] = useState<AllInAction | null>(null);
  const choices = allInChoices(legalActions, facingAllIn);

  const offer = legalActions.join(",");
  useEffect(() => {
    setArmedAllIn(null);
  }, [offer]);

  const pressAllInChoice = (action: AllInAction) => {
    const press = pressAllIn(armedAllIn, action);
    setArmedAllIn(press.armed);
    if (press.send !== null) onAllIn(press.send);
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
      {rejection !== null && rejection.action === null && (
        <RejectionNotice rejection={rejection} />
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
                <RejectionNotice rejection={rejection} attributedTo={action} />
              )}
            </div>
          );
        })}
      </div>
      <AllInRow
        choices={choices}
        armed={armedAllIn}
        pending={pendingAction !== null}
        onPress={pressAllInChoice}
      />
      {rejection !== null && isAllInAction(rejection.action) && (
        <RejectionNotice
          rejection={rejection}
          attributedTo={rejection.action}
        />
      )}
    </div>
  );
}
