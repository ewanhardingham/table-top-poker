import { useEffect, useState } from "react";
import { color, font, fontSize, radius } from "./theme.js";

export type ShotClockVariant = "ring" | "number";

export interface ShotClockProps {
  readonly turnEndsAt: number | null;
  readonly durationSeconds: number;
  readonly variant: ShotClockVariant;
  readonly testId: string;
  readonly numberPosition?: "top-right" | "bottom-right";
  /** Stays hidden until this many seconds remain; absent means always shown. */
  readonly showWithinSeconds?: number;
}

export function shotClockColor(fraction: number): string {
  const remaining = Math.max(0, Math.min(1, fraction));
  const hue =
    remaining > 0.4
      ? 45 + ((remaining - 0.4) / 0.6) * (130 - 45)
      : (remaining / 0.4) * 45;
  const saturation = remaining > 0.4 ? 70 : 85;
  const lightness = remaining > 0.15 ? 52 : 58;
  return `hsl(${String(hue)} ${String(saturation)}% ${String(lightness)}%)`;
}

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, []);

  return now;
}

export function ShotClock({
  turnEndsAt,
  durationSeconds,
  variant,
  testId,
  numberPosition = "top-right",
  showWithinSeconds,
}: ShotClockProps) {
  const now = useNow();
  if (turnEndsAt === null) return null;

  const durationMs = Math.max(1, durationSeconds * 1000);
  const remainingMs = Math.max(0, turnEndsAt - now);
  if (
    showWithinSeconds !== undefined &&
    remainingMs > showWithinSeconds * 1000
  ) {
    return null;
  }
  const fraction = Math.max(0, Math.min(1, remainingMs / durationMs));
  const tint = shotClockColor(fraction);
  const seconds = Math.ceil(remainingMs / 1000);

  if (variant === "number") {
    const numberAnchorStyle =
      numberPosition === "bottom-right"
        ? { bottom: "-0.5em", right: "-0.5em" }
        : { top: "-0.5em", right: "-0.5em" };
    return (
      <span
        data-testid={testId}
        style={{
          position: "absolute",
          ...numberAnchorStyle,
          minWidth: "1.6em",
          padding: "0 0.3em",
          textAlign: "center",
          borderRadius: radius.pill,
          background: color.pillInk,
          color: tint,
          border: `1px solid ${tint}`,
          fontFamily: font.display,
          fontWeight: 800,
          fontSize: "0.7em",
          fontVariantNumeric: "tabular-nums",
          pointerEvents: "none",
        }}
      >
        {seconds}
      </span>
    );
  }

  const radiusValue = 46;
  const circumference = 2 * Math.PI * radiusValue;
  return (
    <div
      data-testid={testId}
      style={{
        marginLeft: "auto",
        position: "relative",
        width: "2.6em",
        height: "2.6em",
        flex: "none",
      }}
    >
      <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
        <circle
          cx="50"
          cy="50"
          r={radiusValue}
          fill="none"
          stroke={color.textFaint}
          strokeWidth={7}
        />
        <circle
          cx="50"
          cy="50"
          r={radiusValue}
          fill="none"
          stroke={tint}
          strokeWidth={7}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: tint,
          fontFamily: font.mono,
          fontSize: fontSize.sm,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {seconds}
      </span>
    </div>
  );
}
