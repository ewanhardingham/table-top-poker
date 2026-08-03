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
    // No `textTransform` and normal tracking: every pill reads in the sentence
    // case its label is written in, so a rail of mixed tones doesn't look like
    // two different vocabularies. Primary vs secondary is carried by the fill.
    letterSpacing: "0.04em",
  },
};

/**
 * One disabled look for every pill, whatever its tone. A disabled action still
 * has to read as the same control it was a moment ago — same size, same
 * position — so only the fill, the ink and the cursor change. This lives here
 * rather than at the call sites: three of them had grown their own copy of it.
 */
const disabledStyle: CSSProperties = {
  background: color.controlFill,
  color: color.disabledText,
  border: `1px solid ${color.border}`,
  boxShadow: "none",
  cursor: "default",
};

/**
 * The rounded pill used for table/player actions. `tone="solid"` is the
 * cream gradient for primary actions ("Deal hand", "Create room"); `tone="outline"`
 * is the muted mono-label pill used for secondary actions ("End session").
 *
 * Both tones render their label as written — the distinction is the fill, not
 * the casing. Labels are therefore authored in sentence case at the call site.
 */
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
