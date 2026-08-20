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
 * Chapter chips (3.4em) + gap (0.8em) + track (4.6em) + bottom margin (1.4em),
 * in `em`. `ReplayStage` reserves this band so the seat ring rides clear of it.
 */
export const TRANSPORT_HEIGHT = 10.2;

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
        bottom: "1.4em",
        display: "flex",
        flexDirection: "column",
        gap: "0.8em",
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
          height: "4.6em",
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
            data-street-boundary={beat.isStreetStart}
            style={{
              position: "absolute",
              left: `${String((beat.position / total) * 100)}%`,
              transform: "translateX(-50%)",
              width: beat.isStreetStart ? "3px" : "2px",
              height: beat.isStreetStart ? "2.2em" : "1.1em",
              borderRadius: "999px",
              background: beat.isStreetStart
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
        minHeight: "3.4em",
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
