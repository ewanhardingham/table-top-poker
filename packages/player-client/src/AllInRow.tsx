import { color, font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";
import type { AllInAction, AllInChoice } from "./actions/allIn.js";

export interface AllInRowProps {
  readonly choices: readonly AllInChoice[];
  readonly armed: AllInAction | null;
  readonly pending: boolean;
  readonly onPress: (action: AllInAction) => void;
}

const restingStyle: CSSProperties = {
  border: `1px solid ${color.accentBorder}`,
  background: "rgba(229,68,60,.10)",
  color: color.textBright,
};

const armedStyle: CSSProperties = {
  border: `1px solid ${color.accentBright}`,
  background: "rgba(229,68,60,.34)",
  color: color.textBright,
};

const disabledStyle: CSSProperties = {
  border: `1px solid ${color.border}`,
  background: "rgba(255,255,255,.03)",
  color: color.textFaint,
};

export function AllInRow({ choices, armed, pending, onPress }: AllInRowProps) {
  if (choices.length === 0) return null;

  return (
    <div
      data-testid="all-in-row"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${String(choices.length)}, 1fr)`,
        gap: "0.7em",
      }}
    >
      {choices.map((choice) => {
        const isArmed = armed === choice.action;
        return (
          <button
            key={choice.action}
            type="button"
            data-testid={`action-${choice.action}`}
            data-armed={isArmed}
            disabled={pending}
            onClick={() => {
              onPress(choice.action);
            }}
            style={{
              height: "3.6em",
              borderRadius: radius.control,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.2em",
              fontFamily: font.body,
              ...(pending
                ? disabledStyle
                : isArmed
                  ? armedStyle
                  : restingStyle),
            }}
          >
            <span style={{ fontSize: fontSize.md, fontWeight: 700 }}>
              {isArmed ? "Confirm" : choice.label}
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
              {isArmed ? choice.label : "put in stack"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
