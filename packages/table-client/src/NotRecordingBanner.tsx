import { color, font, fontSize } from "@table-top-poker/ui-shared";

/**
 * Persistent notice for the remainder of a Room's life once "Continue
 * without recording" has resumed it (Phase 2 spec #129 §3). Never
 * dismissable and never paired with a "recording resumed" counterpart —
 * recording does not come back.
 */
export function NotRecordingBanner() {
  return (
    <div
      data-testid="not-recording-banner"
      role="status"
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5em",
        width: "100%",
        padding: "0.5em 1em",
        background: color.lossBackground,
        borderBottom: `1px solid ${color.lossBorder}`,
        fontFamily: font.mono,
        fontSize: fontSize.xs,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: color.textBright,
      }}
    >
      Not recording — hands from here on will not be saved
    </div>
  );
}
