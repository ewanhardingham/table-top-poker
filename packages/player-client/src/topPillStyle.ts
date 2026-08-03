import { font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

/**
 * The geometry every pill along the top of the player screen shares — name,
 * seat number and connection. One height and one padding, so the row reads as a
 * set of chips rather than controls that happen to be adjacent. The seat
 * actions now live behind the menu button (ADR-0005), which matches this height.
 *
 * Colour is deliberately absent: each pill carries its own.
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
