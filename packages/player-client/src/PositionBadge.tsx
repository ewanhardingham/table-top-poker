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
  /**
   * Muted to match a banner that is no longer reporting live state. Nothing
   * else on this screen dims when the socket drops, but this disc is the
   * brightest thing on it: at full strength it would out-shout the very
   * banner telling the player their actions won't send (issue #207,
   * decision 5).
   */
  readonly dimmed?: boolean;
}

/**
 * The dealer/blind disc, drawn the way the table draws it on a seat pod:
 * the same three labels and colours (from `ui-shared`, so the two can't
 * drift), the same `shadow.card` lift, and the same split of diameter and
 * font size across two elements — `width: 2.1em` and `fontSize: 0.8em` on one
 * element would make the true diameter `2.1 x 0.8em` and shrink the disc to a
 * third of its intended size.
 *
 * Sized to stand as tall as the banner's kicker-and-text block beside it.
 */
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
      {/* "D" read aloud is a letter, not a position — `aria-label` above says
          what it means, so the label itself is decoration to a screen reader. */}
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
