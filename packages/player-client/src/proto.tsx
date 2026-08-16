// PROTOTYPE (proto/shot-clock-countdown): static harness rendering the REAL
// Hand component with a mock PlayerView forcing "your turn", so the faked shot
// clock shows in the turn banner. A floating bar switches the variant via `?sc=`.
// No server, no store. Throwaway.
import type { PlayerView, SeatView } from "@table-top-poker/protocol";
import React from "react";
import ReactDOM from "react-dom/client";
import { Hand } from "./Hand.js";
import "./app-shell.css";

const seats: SeatView[] = [0, 1, 2].map((id) => ({
  id,
  claimed: true,
  displayName: ["You", "Blake", "Cass"][id] ?? `Seat ${String(id + 1)}`,
  sittingOut: false,
  sittingOutReason: null,
  disconnected: false,
}));

// legalActions non-empty => it's your turn => the banner tone is "turn".
const view: PlayerView = {
  phase: "betting",
  button: 1,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 3,
  street: "flop",
  board: [
    { rank: "A", suit: "spades" },
    { rank: "K", suit: "hearts" },
    { rank: "2", suit: "clubs" },
  ],
  toAct: [0],
  seats: [{ seatId: 0, folded: false }],
  yourSeatId: 0,
  yourHoleCards: [
    { rank: "Q", suit: "diamonds" },
    { rank: "J", suit: "clubs" },
  ],
  legalActions: ["fold", "check", "raise"],
};

const VARIANTS = ["ring", "bar", "number"] as const;
const current = new URLSearchParams(window.location.search).get("sc") ?? "ring";

function setVariant(v: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("sc", v);
  window.location.href = url.toString();
}

function Harness() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#050403",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          padding: "1.2em",
          paddingBottom: "5em",
        }}
      >
        <div style={{ width: "min(30em, 100%)" }}>
          <Hand
            view={view}
            seatId={0}
            seats={seats}
            connectionStatus="connected"
          />
        </div>
      </div>
      <VariantBar />
    </div>
  );
}

function VariantBar() {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        gap: "0.6em",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.7em",
        background: "#000000cc",
        borderTop: "1px solid #333",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <span style={{ color: "#888", fontSize: 13 }}>Shot-clock variant:</span>
      {VARIANTS.map((v) => (
        <button
          key={v}
          onClick={() => {
            setVariant(v);
          }}
          style={{
            padding: "0.4em 0.9em",
            borderRadius: 8,
            border: "1px solid #444",
            background: v === current ? "#2f6bff" : "#1b1b1b",
            color: "#eee",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element not found");
}
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
