import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { color, font, radius, shadow } from "./theme.js";

export type PillButtonSize = "md" | "lg";
export type PillButtonTone = "solid" | "outline";

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly size?: PillButtonSize;
  readonly tone?: PillButtonTone;
}

const sizeStyle: Record<PillButtonSize, CSSProperties> = {
  md: { padding: "17px 34px", fontSize: "16px" },
  lg: { padding: "20px 44px", fontSize: "19px" },
};

const toneStyle: Record<PillButtonTone, CSSProperties> = {
  solid: {
    border: 0,
    background: color.pillGradient,
    color: color.pillInk,
    fontWeight: 700,
    letterSpacing: "0.04em",
    boxShadow: shadow.pill,
  },
  outline: {
    border: `1px solid ${color.border}`,
    background: "rgba(0,0,0,.28)",
    color: color.textMuted,
    fontFamily: font.mono,
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
};

const disabledStyle: CSSProperties = {
  background: color.controlFill,
  color: color.disabledText,
  border: `1px solid ${color.border}`,
  boxShadow: "none",
  cursor: "default",
};

export function PillButton({
  size = "md",
  tone = "solid",
  style,
  ...rest
}: PillButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      style={{
        borderRadius: radius.pill,
        fontFamily: font.body,
        ...toneStyle[tone],
        ...sizeStyle[size],
        ...(rest.disabled ? disabledStyle : {}),
        ...style,
      }}
    />
  );
}
