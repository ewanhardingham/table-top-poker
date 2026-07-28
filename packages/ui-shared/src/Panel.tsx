import type { CSSProperties, HTMLAttributes } from "react";
import { color, radius, shadow } from "./theme.js";

export type PanelProps = HTMLAttributes<HTMLDivElement>;

const baseStyle: CSSProperties = {
  borderRadius: radius.panel,
  background: color.surface,
  border: `1px solid ${color.border}`,
  boxShadow: shadow.panel,
  backdropFilter: "blur(6px)",
  WebkitBackdropFilter: "blur(6px)",
};

/**
 * The blurred dark card container behind the settings sheet, join panel, and
 * side menu. Consumers override `style` for layout that diverges from this
 * base (the side menu's drawer shape, the settings sheet's fixed width).
 */
export function Panel({ style, ...rest }: PanelProps) {
  return <div {...rest} style={{ ...baseStyle, ...style }} />;
}
