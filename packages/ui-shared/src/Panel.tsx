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

export function Panel({ style, ...rest }: PanelProps) {
  return <div {...rest} style={{ ...baseStyle, ...style }} />;
}
