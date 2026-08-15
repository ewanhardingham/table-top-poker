// PROTOTYPE — throwaway. See prototype-position-marker/README.md.
import { color, font, shadow } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export type Marker = "button" | "small-blind" | "big-blind";

export const markerLabel: Record<Marker, string> = {
  button: "D",
  "small-blind": "SB",
  "big-blind": "BB",
};

/** The long form, for variants that spell the position out. */
export const markerWord: Record<Marker, string> = {
  button: "Dealer",
  "small-blind": "Small blind",
  "big-blind": "Big blind",
};

/** Lifted verbatim from table-client's Seats.tsx so the two can be compared. */
export const markerBackground: Record<Marker, string> = {
  button: color.buttonMarker,
  "small-blind": color.blindSmallMarker,
  "big-blind": color.blindBigMarker,
};

/**
 * The table's seat-pod badge, extracted. Same trick as Seats.tsx: the diameter
 * sits on the outer element and the font size on an inner one, so the disc
 * stays circular whatever the label's length.
 */
export function PositionMarker({
  marker,
  diameter = "1.6em",
  fontSize = "0.62em",
  style,
}: {
  readonly marker: Marker;
  readonly diameter?: string;
  readonly fontSize?: string;
  readonly style?: CSSProperties;
}) {
  return (
    <span
      data-testid={`position-marker-${marker}`}
      style={{
        width: diameter,
        height: diameter,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        background: markerBackground[marker],
        color: color.pillInk,
        boxShadow: shadow.card,
        ...style,
      }}
    >
      <span
        style={{
          fontFamily: font.mono,
          fontSize,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {markerLabel[marker]}
      </span>
    </span>
  );
}
