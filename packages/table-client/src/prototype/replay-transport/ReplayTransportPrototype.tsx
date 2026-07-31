/**
 * PROTOTYPE — throwaway, wayfinder ticket #82.
 *
 * Three replay transports on the real table shell, switchable via `?variant=`.
 * The replay occupies the felt itself rather than a panel over it — the map
 * fixes the table screen as the board, and a transport judged inside a small
 * overlay would be judged at the wrong size.
 *
 * Run: `npm run dev -w @table-top-poker/table-client`
 *      then open /?prototype=replay-transport&variant=A
 */
import { color, font, radius } from "@table-top-poker/ui-shared";
import { useCallback, useEffect, useState } from "react";
import { StatusBar } from "../../StatusBar.js";
import { TableControls } from "../../TableControls.js";
import { PrototypeSwitcher } from "../PrototypeSwitcher.js";
import { fixtureHand } from "./hand.js";
import { VariantA, variantAName } from "./VariantA.js";
import { VariantB, variantBName } from "./VariantB.js";
import { VariantC, variantCName } from "./VariantC.js";

const variants = ["A", "B", "C"] as const;
const names: Record<string, string> = {
  A: variantAName,
  B: variantBName,
  C: variantCName,
};

function readVariant(): string {
  const v = new URLSearchParams(window.location.search).get("variant") ?? "A";
  return variants.includes(v as (typeof variants)[number]) ? v : "A";
}

export function ReplayTransportPrototype() {
  const [variant, setVariantState] = useState(readVariant);
  const [open, setOpen] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const setVariant = useCallback((next: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
    setVariantState(next);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  /**
   * The map fixes that review is *force-dismissed* when a hand starts, so a
   * review left open can never swallow the board. That rule is invisible
   * until you feel it land mid-playback — this fires it on demand.
   */
  const simulateHandStart = useCallback(() => {
    setOpen(false);
    setDismissed(true);
  }, []);

  useEffect(() => {
    if (!dismissed) return;
    const timer = window.setTimeout(() => {
      setDismissed(false);
    }, 2600);
    return () => {
      window.clearTimeout(timer);
    };
  }, [dismissed]);

  const Variant =
    variant === "B" ? VariantB : variant === "C" ? VariantC : VariantA;

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
            overflow: "hidden",
          }}
        >
          {open ? (
            <Variant onClose={close} />
          ) : (
            <>
              <TableControls
                canStartHand
                handComplete={false}
                onStartHand={simulateHandStart}
                onNextHand={() => undefined}
                onEndSession={() => undefined}
                onReviewHands={() => {
                  setOpen(true);
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingRight: "13em",
                  fontFamily: font.mono,
                  fontSize: "0.7em",
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: dismissed ? color.winKicker : color.textFaint,
                  textAlign: "center",
                }}
              >
                {dismissed
                  ? "Hand starting — review was force-dismissed"
                  : "Review closed — reopen from the rail"}
              </div>
            </>
          )}
        </div>
      </main>

      {/* Prototype-only chrome: fires the map's force-dismiss rule mid-replay
          so it can be judged rather than assumed. */}
      <button
        type="button"
        onClick={simulateHandStart}
        style={{
          position: "fixed",
          bottom: "16px",
          right: "16px",
          zIndex: 9999,
          fontFamily: "ui-monospace, monospace",
          fontSize: "12px",
          padding: "8px 14px",
          borderRadius: radius.pill,
          background: "#fff",
          color: "#111",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 8px 30px rgba(0,0,0,.6)",
        }}
      >
        simulate hand start
      </button>

      <span
        style={{
          position: "fixed",
          bottom: "18px",
          left: "16px",
          zIndex: 9999,
          fontFamily: "ui-monospace, monospace",
          fontSize: "11px",
          color: "rgba(255,255,255,.45)",
        }}
      >
        hand {fixtureHand.handNumber} — {fixtureHand.events.length} events
      </span>

      <PrototypeSwitcher
        variants={[...variants]}
        current={variant}
        names={names}
        onChange={setVariant}
      />
    </div>
  );
}
