// PROTOTYPE — throwaway. See prototype-position-marker/README.md.
import {
  Card,
  color,
  font,
  fontSize,
  radius,
} from "@table-top-poker/ui-shared";
import type { ReactNode } from "react";
import { playerTopPillStyle } from "../topPillStyle.js";

/**
 * A static stand-in for the real player screen: same top pill row, same turn
 * banner, same hole-card region and action bar, built from the same tokens —
 * but with no store, no socket and no gestures, so a variant can hang a marker
 * anywhere in it without touching production components.
 */
export interface Slots {
  /** Rides inside the "Seat 3" pill, at its right end. */
  readonly inSeatPill?: ReactNode;
  /** Sits in the top row, to the left of the connection pill. */
  readonly inTopRow?: ReactNode;
  /** Replaces the turn banner's tone dot. */
  readonly asBannerDot?: ReactNode;
  /** Free-floating over the hole-card region (position it yourself). */
  readonly overCards?: ReactNode;
  /** A full-width strip between the banner and the cards. */
  readonly underBanner?: ReactNode;
}

const pillStyle = {
  ...playerTopPillStyle,
  // Relative so a variant can hang a corner badge off the pill the way the
  // table hangs one off a seat avatar.
  position: "relative" as const,
  gap: "0.5em",
  background: color.control,
  border: `1px solid ${color.border}`,
  color: color.textMuted,
};

export function MockPlayerScreen({ slots }: { readonly slots: Slots }) {
  return (
    <div className="app-shell" data-testid="proto-shell">
      <header
        style={{
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 18px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
          <div style={pillStyle}>Ewan · Seat 3{slots.inSeatPill}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6em" }}>
          {slots.inTopRow}
          <span style={pillStyle}>
            <span
              style={{
                width: "0.5em",
                height: "0.5em",
                borderRadius: "50%",
                background: color.textDim,
              }}
            />
            connected
          </span>
          <span style={{ ...pillStyle, padding: "0 10px" }}>⋯</span>
        </div>
      </header>

      <main className="hand">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.8em",
            borderRadius: radius.panel,
            padding: "0.9em 1.1em",
            background:
              "linear-gradient(120deg,rgba(229,68,60,.22),rgba(229,68,60,.08))",
            border: `1px solid ${color.accentBorder}`,
          }}
        >
          {slots.asBannerDot ?? (
            <span
              style={{
                width: "0.7em",
                height: "0.7em",
                borderRadius: "50%",
                flex: "none",
                background: color.accentBright,
              }}
            />
          )}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.1em" }}
          >
            <span
              style={{
                fontFamily: font.mono,
                fontSize: fontSize.xs,
                letterSpacing: "0.22em",
                textTransform: "uppercase",
                color: color.textBright,
              }}
            >
              Your turn
            </span>
            <span
              style={{
                fontSize: fontSize.md,
                fontWeight: 600,
                color: color.text,
              }}
            >
              You&apos;re to act — flop
            </span>
          </div>
        </div>

        {slots.underBanner}

        <div
          style={{
            position: "relative",
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "calc(var(--hole-card-unit) * 0.5)",
              fontSize: "var(--hole-card-unit)",
            }}
          >
            <div style={{ transform: "rotate(-4deg)" }}>
              <Card rank="A" suit="spades" />
            </div>
            <div style={{ transform: "rotate(4deg)" }}>
              <Card rank="K" suit="hearts" />
            </div>
          </div>
          {slots.overCards}
        </div>

        <div style={{ display: "flex", gap: "10px", flex: "none" }}>
          {["Fold", "Check", "Raise"].map((label) => (
            <div
              key={label}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "14px 0",
                borderRadius: radius.control,
                background:
                  label === "Raise" ? color.accent : color.controlFill,
                border: `1px solid ${label === "Raise" ? color.accent : color.border}`,
                fontFamily: font.mono,
                fontSize: fontSize.sm,
                fontWeight: 700,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: label === "Raise" ? "#fff" : color.textMuted,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
