// PROTOTYPE — throwaway. See prototype-position-marker/README.md.
import { color, font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { Slots } from "./MockPlayerScreen.js";
import {
  markerBackground,
  markerWord,
  PositionMarker,
  type Marker,
} from "./PositionMarker.js";
import { playerTopPillStyle } from "../topPillStyle.js";

export interface Variant {
  readonly id: string;
  readonly name: string;
  /** What this variant is arguing for, in one line. */
  readonly note: string;
  readonly slots: (marker: Marker) => Slots;
}

/** Non-empty by type, so the first entry can be the default without a `!`. */
export const variants: readonly [Variant, ...Variant[]] = [
  {
    id: "seat-pill-corner",
    name: "Seat pill, corner badge",
    note: "The table's exact move: the badge hangs off the corner of the thing that identifies you. Reads as 'this seat is the dealer' with no extra chrome, but it's small and it breaks the top row's clean pill silhouette.",
    slots: (marker) => ({
      inSeatPill: (
        <PositionMarker
          marker={marker}
          diameter="1.9em"
          fontSize="0.72em"
          style={{ position: "absolute", top: "-0.55em", right: "-0.6em" }}
        />
      ),
    }),
  },
  {
    id: "seat-pill-inline",
    name: "Seat pill, inline disc",
    note: "Same disc, but riding inside the pill instead of off its corner. Nothing overlaps, the row keeps its shape — at the cost of looking like part of the seat label rather than a marker that moves each hand.",
    slots: (marker) => ({
      inSeatPill: (
        <PositionMarker marker={marker} diameter="1.7em" fontSize="0.66em" />
      ),
    }),
  },
  {
    id: "top-row-chip",
    name: "Top row, labelled chip",
    note: "Its own pill next to the connection badge: disc plus the word. Unambiguous for anyone who doesn't already read D/SB/BB — but it's a third pill competing for a narrow row, and the word is redundant once you know the code.",
    slots: (marker) => ({
      inTopRow: (
        <span
          style={{
            ...playerTopPillStyle,
            gap: "0.55em",
            paddingLeft: 5,
            background: color.control,
            border: `1px solid ${color.border}`,
            color: color.textMuted,
          }}
        >
          <PositionMarker marker={marker} diameter="1.9em" fontSize="0.72em" />
          {markerWord[marker]}
        </span>
      ),
    }),
  },
  {
    id: "banner-dot",
    name: "Banner, in place of the tone dot",
    note: "The marker takes over the slot the banner's status dot already occupies, so position lands where the player is looking for the state of the hand. Costs the tone dot, and the marker inherits the banner's turn-glow it has nothing to do with.",
    slots: (marker) => ({
      asBannerDot: (
        <PositionMarker marker={marker} diameter="2.1em" fontSize="0.8em" />
      ),
    }),
  },
  {
    id: "under-banner-strip",
    name: "Strip under the banner",
    note: "A dedicated row: disc, word, and room to say what it implies ('you act last'). Most legible and the most room to grow — but it spends vertical space the hole cards want on something that changes once a hand.",
    slots: (marker) => ({
      underBanner: (
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            gap: "0.7em",
            padding: "0.55em 0.9em",
            borderRadius: radius.control,
            background: color.mutedSurface,
            border: `1px solid ${color.border}`,
          }}
        >
          <PositionMarker marker={marker} diameter="2em" fontSize="0.76em" />
          <span
            style={{
              fontFamily: font.mono,
              fontSize: fontSize.xs,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: color.textMuted,
            }}
          >
            {markerWord[marker]}
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: fontSize.sm,
              color: color.textFaint,
            }}
          >
            {marker === "button"
              ? "You act last"
              : marker === "small-blind"
                ? "Posted ½ blind"
                : "Posted the blind"}
          </span>
        </div>
      ),
    }),
  },
  {
    id: "over-cards",
    name: "Chip beside the cards",
    note: "A physical dealer button sitting next to your cards, at table scale — the closest thing to how it works on felt, and impossible to miss. Also the loudest, and it crowds the card region on a small phone.",
    slots: (marker) => ({
      overCards: (
        <div
          style={{
            position: "absolute",
            top: "8%",
            right: "4%",
            fontSize: "1.6rem",
          }}
        >
          <PositionMarker
            marker={marker}
            diameter="2.2em"
            fontSize="0.8em"
            style={{
              border: `2px solid rgba(255,255,255,.55)`,
              outline: `1px solid ${markerBackground[marker]}`,
              outlineOffset: 2,
            }}
          />
        </div>
      ),
    }),
  },
];
