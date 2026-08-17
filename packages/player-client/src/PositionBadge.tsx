import {
  color,
  font,
  positionMarkerColor,
  positionMarkerLabel,
  shadow,
  type PositionMarker,
} from "@table-top-poker/ui-shared";

export interface PositionBadgeProps {
  readonly marker: PositionMarker;
  readonly dimmed?: boolean;
}

const DIAMETER = "2.1em";
const LABEL_FONT_SIZE = "0.8em";

const spokenPosition: Record<PositionMarker, string> = {
  button: "You are on the dealer button",
  "small-blind": "You are the small blind",
  "big-blind": "You are the big blind",
};

export function PositionBadge({ marker, dimmed = false }: PositionBadgeProps) {
  return (
    <span
      role="img"
      aria-label={spokenPosition[marker]}
      data-testid="position-badge"
      data-marker={marker}
      style={{
        width: DIAMETER,
        height: DIAMETER,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        background: positionMarkerColor[marker],
        color: color.pillInk,
        boxShadow: shadow.card,
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          fontFamily: font.mono,
          fontSize: LABEL_FONT_SIZE,
          fontWeight: 700,
          lineHeight: 1,
        }}
      >
        {positionMarkerLabel[marker]}
      </span>
    </span>
  );
}
