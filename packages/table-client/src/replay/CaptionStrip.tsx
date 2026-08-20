import { color, font, fontSize } from "@table-top-poker/ui-shared";

export interface CaptionStripProps {
  readonly caption: string | null;
  /** Height in `em` of the transport chrome the strip sits above. */
  readonly transportHeight: number;
}

/**
 * The band the caption owns. The strip has a band of its own so it can never
 * sit on a seat pod, and `ReplayStage` lays the felt out above it (§6).
 */
export const CAPTION_BAND = 2.4;

/** What just happened, in the language of a poker table rather than ordinals. */
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
