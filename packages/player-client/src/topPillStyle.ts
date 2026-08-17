import { font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export const playerTopPillStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 30,
  padding: "0 10px",
  borderRadius: radius.pill,
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
