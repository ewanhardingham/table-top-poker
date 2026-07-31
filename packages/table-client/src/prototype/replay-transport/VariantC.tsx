/**
 * PROTOTYPE — throwaway, wayfinder ticket #82.
 *
 * VARIANT C — **Chaptered scrub.** A timeline the width of the felt, ticked
 * per event ordinal and chaptered by street, draggable to any position, with
 * autoplay demoted to a secondary toggle. The bet: the thing people actually
 * want is not to watch a hand — it is to get to *the moment*, which they can
 * already name ("on the turn, when Seat 4 raised"). A transport that makes
 * that one gesture beats one that makes you sit through the hand to reach it.
 *
 * This is also the variant that tests whether jumping by street is meaningful
 * given streets auto-cascade: the chapter chips seek to the `StreetStarted`
 * ordinal inside the cascade.
 */
import { color, font } from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { UNIFORM_WEIGHT, beatAt, chaptersOf, toBeats } from "./beats.js";
import { fixtureHand } from "./hand.js";
import { ReplayHeader, ReplayStage } from "./ReplayStage.js";

export const variantCName = "Chaptered scrub by street";

const beats = toBeats(fixtureHand.events);
const chapters = chaptersOf(beats);
const total = beats.length;

export function VariantC({ onClose }: { readonly onClose: () => void }) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const atEnd = position >= total;

  useEffect(() => {
    if (!playing || atEnd || scrubbing) return;
    const hold = beats[position]?.weight ?? UNIFORM_WEIGHT;
    const timer = window.setTimeout(() => {
      setPosition((p) => p + 1);
    }, hold);
    return () => {
      window.clearTimeout(timer);
    };
  }, [playing, position, scrubbing, atEnd]);

  /** Maps a pointer x within the track to the nearest event ordinal. */
  const seekTo = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    const next = Math.round(Math.max(0, Math.min(1, ratio)) * total);
    setPosition(next);
  }, []);

  useEffect(() => {
    if (!scrubbing) return;
    const onMove = (e: PointerEvent) => {
      seekTo(e.clientX);
    };
    const onUp = () => {
      setScrubbing(false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [scrubbing, seekTo]);

  const current = beatAt(beats, position);
  const currentStreet = current?.street ?? null;

  return (
    <>
      <ReplayStage position={position} caption={current?.caption ?? null} />
      <ReplayHeader position={position} total={total} onClose={onClose} />

      <div
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
        {/* Street chapters — the named landmarks people actually navigate by. */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
          <Chip
            active={playing}
            onClick={() => {
              if (atEnd) setPosition(0);
              setPlaying((p) => !p);
            }}
          >
            {playing ? "❚❚ pause" : "▶ play"}
          </Chip>
          <span style={{ flex: 1 }} />
          {chapters.map((chapter) => (
            <Chip
              key={chapter.street}
              active={currentStreet === chapter.street}
              onClick={() => {
                setPosition(chapter.position);
              }}
            >
              {chapter.label}
            </Chip>
          ))}
        </div>

        {/* The track. Ticks are event ordinals, so the hand's *shape* — where
            the action clustered — is legible before you touch it. */}
        <div
          ref={trackRef}
          onPointerDown={(e) => {
            setScrubbing(true);
            setPlaying(false);
            seekTo(e.clientX);
          }}
          style={{
            position: "relative",
            height: "2.6em",
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
              height: "2px",
              background: "rgba(255,255,255,.12)",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              width: `${String(total === 0 ? 0 : (position / total) * 100)}%`,
              height: "2px",
              background: color.accent,
            }}
          />
          {beats.map((beat) => (
            <span
              key={beat.position}
              style={{
                position: "absolute",
                left: `${String((beat.position / total) * 100)}%`,
                transform: "translateX(-50%)",
                width: beat.isStreetStart ? "2px" : "1px",
                height: beat.isStreetStart ? "1.4em" : "0.7em",
                background: beat.isStreetStart
                  ? color.textMuted
                  : "rgba(255,255,255,.3)",
              }}
            />
          ))}
          <span
            style={{
              position: "absolute",
              left: `${String(total === 0 ? 0 : (position / total) * 100)}%`,
              transform: "translate(-50%, 0)",
              width: "0.9em",
              height: "0.9em",
              borderRadius: "50%",
              background: color.text,
              boxShadow: "0 4px 14px rgba(0,0,0,.7)",
            }}
          />
        </div>
      </div>
    </>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        fontFamily: font.mono,
        fontSize: "0.6em",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: "0.6em 1em",
        borderRadius: "999px",
        cursor: "pointer",
        background: active ? color.controlFill : "transparent",
        border: `1px solid ${active ? color.borderStrong : color.border}`,
        color: active ? color.text : color.textFaint,
      }}
    >
      {children}
    </button>
  );
}
