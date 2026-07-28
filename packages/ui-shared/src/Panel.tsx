import type { CSSProperties, HTMLAttributes } from "react";
import { color, radius, shadow } from "./theme.js";

export type PanelProps = HTMLAttributes<HTMLDivElement>;

const baseStyle: CSSProperties = {
  borderRadius: radius.panel,
  background: color.surface,
  border: `1px solid ${color.border}`,
  boxShadow: shadow.panel,
  backdropFilter: "blur(3px)",
  WebkitBackdropFilter: "blur(3px)",
};

/**
 * The blurred dark card container behind the settings sheet, join panel, and
 * side menu. Defaults match the join panel exactly; the settings sheet
 * (opaque gradient, no self-blur) and the side menu (drawer shape, no
 * radius) diverge, so those consumers override `background`/`style`.
 */
export function Panel({ style, ...rest }: PanelProps) {
  return <div {...rest} style={{ ...baseStyle, ...style }} />;
}
