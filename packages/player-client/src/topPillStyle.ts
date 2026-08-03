import { font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

/**
 * The geometry every pill along the top of the player screen shares — name,
 * seat number, sit-out and connection. One height and one padding, so the row
 * reads as a set of chips rather than four controls that happen to be adjacent.
 *
 * Colour is deliberately absent: each pill carries its own, and the sit-out
 * control is a `PillButton` whose disabled state must stay PillButton's to set.
 */
export const playerTopPillStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 30,
  padding: "0 12px",
  borderRadius: radius.pill,
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};
