import { color, font } from "@table-top-poker/ui-shared";
import { chromeBand, chromeFontSize, gutter } from "./chrome.js";
import { TRANSPORT_BAND } from "./ReplayTransport.js";

export interface CaptionStripProps {
  readonly caption: string | null;
}

/** The band the Caption owns, which `ReplayStage` lays the felt out above. */
export const CAPTION_BAND = chromeBand(2.2);

/**
 * `ReplayStage` reserves `BOTTOM_BAND` above this one, so a pod growing below
 * its anchor stays out of it. The layering is the backstop, not the mechanism.
 */
export const CAPTION_LAYER = 0;
export const FELT_LAYER = 1;

export function CaptionStrip({ caption }: CaptionStripProps) {
  return (
    <div
      data-testid="replay-caption"
      style={{
        position: "absolute",
        left: gutter,
        right: gutter,
        bottom: TRANSPORT_BAND,
        height: CAPTION_BAND,
        fontSize: chromeFontSize,
        zIndex: CAPTION_LAYER,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: font.mono,
        letterSpacing: "0.08em",
        color: color.textMuted,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        pointerEvents: "none",
      }}
    >
      {caption}
    </div>
  );
}
