// PROTOTYPE — throwaway. See prototype-position-marker/README.md.
import { color, font, fontSize, radius } from "@table-top-poker/ui-shared";
import { useEffect, useState } from "react";
import { MockPlayerScreen } from "./MockPlayerScreen.js";
import type { Marker } from "./PositionMarker.js";
import { variants } from "./variants.js";

/** The seat the prototype pretends you are sitting in. */
type Position = "button" | "small-blind" | "big-blind" | "none";

/**
 * The same suppression rule table-client's `Seats.markerFor` applies, copied
 * here so the player screen can be judged against the display the table
 * already gives: no blinds between hands, and heads-up shows only the button.
 */
function markerFor(
  position: Position,
  phase: "betting" | "no-hand",
  headsUp: boolean,
): Marker | null {
  if (position === "none") return null;
  if (phase === "no-hand" || headsUp) {
    return position === "button" ? "button" : null;
  }
  return position;
}

function readParam(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

const barButton = (active: boolean) => ({
  padding: "7px 12px",
  borderRadius: radius.pill,
  border: `1px solid ${active ? color.accent : color.border}`,
  background: active ? color.accentWash : "transparent",
  color: active ? color.text : color.textDim,
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
});

export function Prototype() {
  const [variantId, setVariantId] = useState(() =>
    readParam("variant", variants[0].id),
  );
  const [position, setPosition] = useState<Position>(
    () => readParam("position", "button") as Position,
  );
  const [phase, setPhase] = useState<"betting" | "no-hand">("betting");
  const [headsUp, setHeadsUp] = useState(false);

  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const marker = markerFor(position, phase, headsUp);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("variant", variant.id);
    params.set("position", position);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [variant.id, position]);

  return (
    <div
      style={{
        // #root (app-shell.css) already owns the viewport box and centres its
        // child; this just fills it.
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: color.background,
        color: color.text,
        fontFamily: font.body,
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
          padding: "18px 0 0",
        }}
      >
        <div style={{ width: "100%", maxWidth: 480, height: "68dvh" }}>
          <MockPlayerScreen
            slots={marker ? variant.slots(marker) : {}}
            key={`${variant.id}-${String(marker)}`}
          />
        </div>
      </div>

      <div
        style={{
          flex: "none",
          borderTop: `1px solid ${color.border}`,
          background: color.surfaceGradient,
          padding: "12px 16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => {
                setVariantId(v.id);
              }}
              style={barButton(v.id === variant.id)}
            >
              {v.name}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["button", "small-blind", "big-blind", "none"] as const).map(
            (p) => (
              <button
                key={p}
                onClick={() => {
                  setPosition(p);
                }}
                style={barButton(p === position)}
              >
                {p === "button" ? "dealer" : p}
              </button>
            ),
          )}
          <button
            onClick={() => {
              setPhase(phase === "betting" ? "no-hand" : "betting");
            }}
            style={barButton(phase === "no-hand")}
          >
            phase: {phase}
          </button>
          <button
            onClick={() => {
              setHeadsUp(!headsUp);
            }}
            style={barButton(headsUp)}
          >
            heads-up: {headsUp ? "on" : "off"}
          </button>
        </div>

        <div
          style={{
            fontFamily: font.mono,
            fontSize: fontSize.xs,
            lineHeight: 1.7,
            color: color.textDim,
          }}
        >
          <div>
            state → variant={variant.id} position={position} phase={phase}{" "}
            headsUp={String(headsUp)} ⇒ marker={String(marker)}
          </div>
          <div style={{ color: color.textMuted, marginTop: 6 }}>
            {variant.note}
          </div>
        </div>
      </div>
    </div>
  );
}
