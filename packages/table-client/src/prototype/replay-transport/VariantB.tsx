/**
 * PROTOTYPE — throwaway, wayfinder ticket #82.
 *
 * VARIANT B — **Step on tap.** No clock anywhere. Tap the felt to advance one
 * beat; a back affordance walks it in reverse. The bet: a hand is re-watched
 * because someone is *arguing about it*, and an argument needs the hand to
 * stop where the argument is. Every timed transport makes that a fight with a
 * timer. This one has no opinion about pace, which is the strongest possible
 * answer to the ticket's weighting question — it refuses it.
 *
 * The cost this variant has to be judged on is its taps-per-hand: the fixture
 * is a real engine log, so the count on screen is the honest one, not a
 * flattering short hand.
 */
import { color, font } from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useState } from "react";
import { beatAt, toBeats } from "./beats.js";
import { fixtureHand } from "./hand.js";
import { ReplayHeader, ReplayStage } from "./ReplayStage.js";

export const variantBName = "Step on tap, no clock";

const beats = toBeats(fixtureHand.events);
const total = beats.length;

export function VariantB({ onClose }: { readonly onClose: () => void }) {
  const [position, setPosition] = useState(0);

  const forward = useCallback(() => {
    setPosition((p) => Math.min(p + 1, total));
  }, []);
  const back = useCallback(() => {
    setPosition((p) => Math.max(p - 1, 0));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Left/Right belong to the prototype switcher; stepping takes the keys
      // a reader would reach for anyway.
      if (event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        forward();
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        back();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [forward, back]);

  const current = beatAt(beats, position);
  const atEnd = position >= total;

  return (
    <>
      <div
        onClick={forward}
        style={{ position: "absolute", inset: 0, cursor: "pointer", zIndex: 1 }}
      />
      <ReplayStage position={position} caption={current?.caption ?? null} />
      <ReplayHeader position={position} total={total} onClose={onClose} />

      {/* Beat pips: the only sense of "how far through" this variant offers,
          and they double as an honest count of how many taps a hand costs. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: "3.6em",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "3px",
          zIndex: 2,
          pointerEvents: "none",
        }}
      >
        {beats.map((beat) => (
          <span
            key={beat.position}
            style={{
              width: beat.isStreetStart ? "3px" : "6px",
              height: "6px",
              borderRadius: beat.isStreetStart ? "1px" : "999px",
              background:
                beat.position <= position
                  ? beat.isStreetStart
                    ? color.textMuted
                    : color.accent
                  : "rgba(255,255,255,.14)",
            }}
          />
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: "1.8em",
          bottom: "1.6em",
          display: "flex",
          alignItems: "center",
          gap: "0.6em",
          zIndex: 3,
        }}
      >
        <Step onClick={back} disabled={position === 0}>
          ← back
        </Step>
        <span
          style={{
            fontFamily: font.mono,
            fontSize: "0.58em",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: color.textFaint,
          }}
        >
          {atEnd ? "End of hand" : "Tap the felt to advance"}
        </span>
      </div>
    </>
  );
}

function Step({
  onClick,
  disabled,
  children,
}: {
  readonly onClick: () => void;
  readonly disabled: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      style={{
        fontFamily: font.mono,
        fontSize: "0.6em",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: "0.7em 1.2em",
        borderRadius: "999px",
        cursor: disabled ? "default" : "pointer",
        background: "transparent",
        border: `1px solid ${color.border}`,
        color: disabled ? color.textFaint : color.text,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}
