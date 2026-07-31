/**
 * PROTOTYPE — throwaway, wayfinder ticket #82.
 *
 * VARIANT A — **Autoplay, weighted.** The hand plays itself back at a pace
 * derived per event type, and the felt is the pause target. The bet: replay
 * on a table device is a thing people *watch together*, not a thing one
 * person operates, so the default state is moving and the controls stay out
 * of the way. Weighted timing is the whole claim — a fold and a river card
 * are one ordinal each, and giving them equal screen time is what makes
 * uniform autoplay feel like a metronome instead of a hand.
 */
import { color, font } from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useState } from "react";
import { UNIFORM_WEIGHT, beatAt, toBeats } from "./beats.js";
import { fixtureHand } from "./hand.js";
import { ReplayHeader, ReplayStage } from "./ReplayStage.js";

export const variantAName = "Autoplay, weighted per event";

const beats = toBeats(fixtureHand.events);
const total = beats.length;

const SPEEDS = [0.5, 1, 2] as const;

export function VariantA({ onClose }: { readonly onClose: () => void }) {
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(1);
  const [weighted, setWeighted] = useState(true);

  const atEnd = position >= total;

  // One timer per beat rather than a single ticking clock: the delay *is* the
  // per-event weight, so the schedule is recomputed each time a beat lands.
  useEffect(() => {
    if (!playing || atEnd) return;
    const next = beats[position];
    const hold = weighted ? (next?.weight ?? UNIFORM_WEIGHT) : UNIFORM_WEIGHT;
    const timer = window.setTimeout(() => {
      setPosition((p) => p + 1);
    }, hold / speed);
    return () => {
      window.clearTimeout(timer);
    };
  }, [playing, position, speed, weighted, atEnd]);

  const toggle = useCallback(() => {
    if (atEnd) {
      setPosition(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, [atEnd]);

  const current = beatAt(beats, position);
  const progress = total === 0 ? 0 : (position / total) * 100;

  return (
    <>
      {/* The felt itself is the pause target — no button to find, and it
          works from any seat around a table lying flat. */}
      <div
        onClick={toggle}
        style={{ position: "absolute", inset: 0, cursor: "pointer", zIndex: 1 }}
      />
      <ReplayStage position={position} caption={current?.caption ?? null} />
      <ReplayHeader position={position} total={total} onClose={onClose} />

      {/* Progress as a hairline, not a control: it reports, it doesn't invite
          a drag. Scrubbing is variant C's bet, not this one's. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "3px",
          background: "rgba(255,255,255,.07)",
          zIndex: 2,
        }}
      >
        <div
          style={{
            width: `${String(progress)}%`,
            height: "100%",
            background: color.accent,
            transition: "width 180ms linear",
          }}
        />
      </div>

      {!playing && !atEnd && <Badge>Paused — tap the felt to resume</Badge>}
      {atEnd && <Badge>End of hand — tap to watch again</Badge>}

      <div
        style={{
          position: "absolute",
          right: "1.8em",
          bottom: "1.6em",
          display: "flex",
          alignItems: "center",
          gap: "0.5em",
          zIndex: 3,
        }}
      >
        {SPEEDS.map((s) => (
          <Chip
            key={s}
            active={speed === s}
            onClick={() => {
              setSpeed(s);
            }}
          >
            {s}×
          </Chip>
        ))}
        <Chip
          active={weighted}
          onClick={() => {
            setWeighted((w) => !w);
          }}
        >
          {weighted ? "weighted" : "uniform"}
        </Chip>
      </div>
    </>
  );
}

function Badge({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: "3.4em",
        transform: "translateX(-50%)",
        padding: "0.6em 1.4em",
        borderRadius: "999px",
        background: "rgba(6,9,8,.72)",
        border: `1px solid ${color.border}`,
        fontFamily: font.mono,
        fontSize: "0.62em",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: color.textMuted,
        pointerEvents: "none",
        zIndex: 3,
      }}
    >
      {children}
    </div>
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
