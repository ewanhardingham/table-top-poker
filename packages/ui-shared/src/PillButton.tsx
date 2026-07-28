import type { ButtonHTMLAttributes, CSSProperties } from "react";
import { color, font, radius, shadow } from "./theme.js";

export type PillButtonSize = "md" | "lg";

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly size?: PillButtonSize;
}

const sizeStyle: Record<PillButtonSize, CSSProperties> = {
  md: { padding: "17px 34px", fontSize: "16px" },
  lg: { padding: "20px 44px", fontSize: "19px" },
};

/**
 * The rounded gradient pill used for primary actions ("Deal hand", "Create
 * room"). Matches the prototype's cream-on-felt button, not a generic button.
 */
export function PillButton({ size = "md", style, ...rest }: PillButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      style={{
        border: 0,
        borderRadius: radius.pill,
        background: color.pillGradient,
        color: color.pillInk,
        fontFamily: font.body,
        fontWeight: 700,
        letterSpacing: "0.04em",
        boxShadow: shadow.pill,
        ...sizeStyle[size],
        ...style,
      }}
    />
  );
}
