import { color, font } from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useRef, type ReactNode } from "react";
import type { Beat, Chapter } from "./beats.js";
import { positionAtRatio, ticksFor } from "./track.js";

export interface ReplayTransportProps {
  readonly beats: readonly Beat[];
  readonly chapters: readonly Chapter[];
  readonly position: number;
  readonly playing: boolean;
  readonly scrubbing: boolean;
  readonly onSeek: (position: number) => void;
  readonly onScrubbingChange: (scrubbing: boolean) => void;
  readonly onTogglePlay: () => void;
  readonly currentStreet: Chapter["street"] | null;
}

/**
 * Comfortably past the ~44px touch-target floor at the table device's root
 * size, and wide enough to hit without aiming.
 */
const CHIP_HEIGHT = 3.4;
const ROW_GAP = 0.8;
/** The grab zone, deliberately far taller than the 6px rail it draws. */
const TRACK_HEIGHT = 4.6;
const BOTTOM_MARGIN = 1.4;

/** The band `ReplayStage` reserves, so the seat ring rides clear of it. */
export const TRANSPORT_HEIGHT =
  CHIP_HEIGHT + ROW_GAP + TRACK_HEIGHT + BOTTOM_MARGIN;

/**
 * The scrub: a ticked track the width of the felt, chaptered by street, with
 * autoplay demoted to a chip beside the chapters.
 *
 * Sized for a finger rather than a cursor — the grab zone is the full height
 * of the track row, well past the visible rail, and the chips clear the touch
 * target floor (Phase 2 spec #129 §6).
 */
export function ReplayTransport({
  beats,
  chapters,
  position,
  playing,
  scrubbing,
  onSeek,
  onScrubbingChange,
  onTogglePlay,
  currentStreet,
}: ReplayTransportProps) {
  const total = beats.length;
  const trackRef = useRef<HTMLDivElement | null>(null);

  const seekToClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      onSeek(positionAtRatio((clientX - rect.left) / rect.width, total));
    },
    [onSeek, total],
  );

  // The drag continues wherever the finger goes, including off the track and
  // off the element entirely, so the listeners live on the window.
  useEffect(() => {
    if (!scrubbing) return;
    const onMove = (event: PointerEvent) => {
      seekToClientX(event.clientX);
    };
    const onUp = () => {
      onScrubbingChange(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrubbing, seekToClientX, onScrubbingChange]);

  const progress = total === 0 ? 0 : (position / total) * 100;

  return (
    <div
      data-testid="replay-transport"
      style={{
        position: "absolute",
        left: "1.8em",
        right: "1.8em",
        bottom: `${String(BOTTOM_MARGIN)}em`,
        display: "flex",
        flexDirection: "column",
        gap: `${String(ROW_GAP)}em`,
        zIndex: 3,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.7em" }}>
        <Chip
          active={playing}
          label={playing ? "Pause replay" : "Play replay"}
          testId="replay-play"
          onClick={onTogglePlay}
        >
          {playing ? "❚❚ pause" : "▶ play"}
        </Chip>
        <span style={{ flex: 1 }} />
        {chapters.map((chapter) => (
          <Chip
            key={chapter.street}
            active={currentStreet === chapter.street}
            label={`Seek to the ${chapter.label.toLowerCase()}`}
            testId={`replay-chapter-${chapter.street}`}
            onClick={() => {
              onSeek(chapter.position);
            }}
          >
            {chapter.label}
          </Chip>
        ))}
      </div>

      <div
        ref={trackRef}
        data-testid="replay-track"
        onPointerDown={(event) => {
          onScrubbingChange(true);
          seekToClientX(event.clientX);
        }}
        style={{
          position: "relative",
          height: `${String(TRACK_HEIGHT)}em`,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          touchAction: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: "6px",
            borderRadius: "999px",
            background: "rgba(255,255,255,.14)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${String(progress)}%`,
            height: "6px",
            borderRadius: "999px",
            background: color.accent,
          }}
        />
        {ticksFor(beats).map((beat) => (
          <span
            key={beat.position}
            data-testid={`replay-tick-${String(beat.position)}`}
            data-street-boundary={beat.isStreetBoundary}
            style={{
              position: "absolute",
              left: `${String((beat.position / total) * 100)}%`,
              transform: "translateX(-50%)",
              width: beat.isStreetBoundary ? "3px" : "2px",
              height: beat.isStreetBoundary ? "2.2em" : "1.1em",
              borderRadius: "999px",
              background: beat.isStreetBoundary
                ? color.textMuted
                : "rgba(255,255,255,.34)",
            }}
          />
        ))}
        <span
          data-testid="replay-thumb"
          style={{
            position: "absolute",
            left: `${String(progress)}%`,
            transform: "translate(-50%, 0)",
            width: "1.9em",
            height: "1.9em",
            borderRadius: "50%",
            background: color.text,
            border: `3px solid ${color.accent}`,
            boxShadow: "0 6px 20px rgba(0,0,0,.8)",
          }}
        />
      </div>
    </div>
  );
}

function Chip({
  active,
  label,
  testId,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly testId: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      style={{
        fontFamily: font.mono,
        fontSize: "0.78em",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        minHeight: `${String(CHIP_HEIGHT)}em`,
        minWidth: "6em",
        padding: "0.9em 1.6em",
        borderRadius: "999px",
        cursor: "pointer",
        background: active ? color.controlFill : "rgba(6,9,8,.5)",
        border: `1px solid ${active ? color.borderStrong : color.border}`,
        color: active ? color.text : color.textMuted,
      }}
    >
      {children}
    </button>
  );
}
