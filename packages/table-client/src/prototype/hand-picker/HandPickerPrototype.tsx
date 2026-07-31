/**
 * PROTOTYPE — throwaway, wayfinder ticket #81 (extended by #87).
 *
 * Three variants of the session hand picker, switchable via `?variant=`, on
 * the real table shell (StatusBar, felt, seat ring, control rail) so each is
 * judged against the density it will actually sit in — the picker is an
 * overlay on the felt, reachable only between hands (map #79).
 *
 * Ticket #87 adds a second axis, `?clock=`, that only applies to Variant A —
 * the chosen design (ticket #81) — switching between showing no start time,
 * an absolute local time, or a live-ticking relative label ("6m ago") for
 * each Hand row. The clock switcher only renders for Variant A; B and C were
 * already settled and are kept only for provenance.
 *
 * Run: `npm run dev -w @table-top-poker/table-client`
 *      then open /?prototype=hand-picker&variant=A&clock=relative
 */
import type { SeatView } from "@table-top-poker/protocol";
import { PillButton, color, font, radius } from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useState } from "react";
import { Seats } from "../../Seats.js";
import { StatusBar } from "../../StatusBar.js";
import { TableControls } from "../../TableControls.js";
import { PrototypeSwitcher } from "../PrototypeSwitcher.js";
import { type ClockMode, clockModeNames, clockModes } from "./clock.js";
import { fixtureHands, fixtureSeatIds } from "./fixtures.js";
import { VariantA, variantAName } from "./VariantA.js";
import { VariantB, variantBName } from "./VariantB.js";
import { VariantC, variantCName } from "./VariantC.js";

const variants = ["A", "B", "C"] as const;
const names: Record<string, string> = {
  A: variantAName,
  B: variantBName,
  C: variantCName,
};

function readClockMode(): ClockMode {
  const c = new URLSearchParams(window.location.search).get("clock") ?? "relative";
  return clockModes.includes(c as ClockMode) ? (c as ClockMode) : "relative";
}

/** Ticks once a second so a relative label ("just now" → "1m ago") goes
 * visibly stale while the picker stays open — the exact concern #87 raises. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, []);
  return now;
}

const fixtureSeats: readonly SeatView[] = fixtureSeatIds.map((id) => ({
  id,
  claimed: true,
  sittingOut: false,
  disconnected: false,
}));

function readVariant(): string {
  const v = new URLSearchParams(window.location.search).get("variant") ?? "A";
  return variants.includes(v as (typeof variants)[number]) ? v : "A";
}

export function HandPickerPrototype() {
  const [variant, setVariantState] = useState(readVariant);
  const [clockMode, setClockModeState] = useState(readClockMode);
  const [open, setOpen] = useState(true);
  const [picked, setPicked] = useState<number | null>(null);
  const now = useNow();

  const setVariant = useCallback((next: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
    setVariantState(next);
  }, []);

  const setClockMode = useCallback((next: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("clock", next);
    window.history.replaceState(null, "", url);
    setClockModeState(next as ClockMode);
  }, []);

  const onSelect = useCallback((handNumber: number) => {
    setPicked(handNumber);
  }, []);

  return (
    <div className="app-shell" data-testid="table-client-shell">
      <StatusBar roomCode="PROTO" connectionStatus="connected" />
      <main className="felt">
        <div
          style={{
            position: "absolute",
            inset: "1em",
            borderRadius: "0.7em",
            background: color.felt,
            boxShadow:
              "inset 0 0 12em 4em rgba(0,0,0,.62), inset 0 2px 0 rgba(255,255,255,.08)",
          }}
        >
          <Seats seats={fixtureSeats} view={null} />
          <TableControls
            canStartHand
            handComplete={false}
            onStartHand={() => undefined}
            onNextHand={() => undefined}
            onEndSession={() => undefined}
            onReviewHands={() => {
              setOpen(true);
            }}
          />

          {open && (
            <div
              style={{
                position: "absolute",
                // Clears the 13em control rail on the right, so the picker
                // never covers the actions it sits alongside.
                inset: "2.5em 15.5em 2.5em 3em",
                display: "flex",
                flexDirection: "column",
                gap: "1em",
                padding: "1.4em",
                borderRadius: radius.panel,
                background: color.sideMenuGradient,
                border: `1px solid ${color.borderStrong}`,
                boxShadow: "0 44px 90px -30px rgba(0,0,0,.95)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: "1em",
                }}
              >
                <span
                  style={{
                    fontFamily: font.display,
                    fontSize: "1.4em",
                    color: color.text,
                  }}
                >
                  Review a hand
                </span>
                <span
                  style={{
                    fontFamily: font.mono,
                    fontSize: "0.62em",
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: color.textDim,
                  }}
                >
                  {
                    fixtureHands.filter((h) => h.outcome.kind !== "in-progress")
                      .length
                  }{" "}
                  hands this session
                </span>
                <PillButton
                  tone="outline"
                  onClick={() => {
                    setOpen(false);
                    setPicked(null);
                  }}
                  style={{ padding: "12px 18px", fontSize: "11px" }}
                >
                  Close
                </PillButton>
              </div>

              <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
                <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  {variant === "A" && (
                    <VariantA
                      hands={fixtureHands}
                      clockMode={clockMode}
                      now={now}
                      onSelect={onSelect}
                    />
                  )}
                  {variant === "B" && (
                    <VariantB hands={fixtureHands} onSelect={onSelect} />
                  )}
                  {variant === "C" && (
                    <VariantC hands={fixtureHands} onSelect={onSelect} />
                  )}
                </div>
              </div>

              <span
                style={{
                  fontFamily: font.mono,
                  fontSize: "0.62em",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: picked === null ? color.textFaint : color.winKicker,
                }}
              >
                {picked === null
                  ? "Pick a hand to replay"
                  : `Selected hand ${String(picked)} — playback is ticket #82`}
              </span>
            </div>
          )}
        </div>
      </main>

      <PrototypeSwitcher
        variants={[...variants]}
        current={variant}
        names={names}
        onChange={setVariant}
      />
      {variant === "A" && (
        <PrototypeSwitcher
          variants={[...clockModes]}
          current={clockMode}
          names={clockModeNames}
          onChange={setClockMode}
          bottom={64}
          keyboard={false}
        />
      )}
    </div>
  );
}
