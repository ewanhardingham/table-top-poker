import { color, font, fontSize } from "@table-top-poker/ui-shared";

export interface CaptionStripProps {
  readonly caption: string | null;
  /** Height in `em` of the transport chrome the strip sits above. */
  readonly transportHeight: number;
}

/** The band the Caption owns, which `ReplayStage` lays the felt out above. */
export const CAPTION_BAND = 2.4;

/**
 * A bottom-row pod grows below its anchor, so on a short felt it can reach
 * into this band. The strip stays under the felt layer, so what gives is the
 * caption rather than the table. See Caption in `CONTEXT.md`.
 */
export const CAPTION_LAYER = 0;
export const FELT_LAYER = 1;

export function CaptionStrip({ caption, transportHeight }: CaptionStripProps) {
  return (
    <div
      data-testid="replay-caption"
      style={{
        position: "absolute",
        left: "1.8em",
        right: "1.8em",
        bottom: `${String(transportHeight)}em`,
        height: `${String(CAPTION_BAND)}em`,
        zIndex: CAPTION_LAYER,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: font.mono,
        fontSize: fontSize.sm,
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
