// PROTOTYPE (proto/shot-clock-countdown): static harness rendering the REAL
// Seats component with mock data forcing seat 0 to be the actor, so the faked
// shot clock shows. A floating bar switches the visual variant via `?sc=`.
// No server, no store. Throwaway.
import type { SeatView, TableView } from "@table-top-poker/protocol";
import { color } from "@table-top-poker/ui-shared";
import React from "react";
import ReactDOM from "react-dom/client";
import { Seats } from "./Seats.js";
import "./app-shell.css";

const NAMES = ["Avery", "Blake", "Cass", "Dev", "Ede", "Fin"];
const seats: SeatView[] = NAMES.map((displayName, id) => ({
  id,
  claimed: true,
  displayName,
  sittingOut: false,
  sittingOutReason: null,
  disconnected: false,
}));

// Seat 0 is to act -> the actor -> the shot clock mounts on its pod.
const view: TableView = {
  phase: "betting",
  button: 2,
  smallBlind: 1,
  bigBlind: 2,
  dealtSeatCount: 6,
  street: "flop",
  board: [
    { rank: "A", suit: "spades" },
    { rank: "K", suit: "hearts" },
    { rank: "2", suit: "clubs" },
  ],
  toAct: [0],
  seats: seats.map((s) => ({ seatId: s.id, folded: false })),
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
    <div style={{ position: "fixed", inset: 0, background: "#0b0a09" }}>
      <div
        style={{
          position: "absolute",
          inset: "1em",
          bottom: "4.5em",
          borderRadius: "0.7em",
          background: color.felt,
          boxShadow:
            "inset 0 0 12em 4em rgba(0,0,0,.62), inset 0 2px 0 rgba(255,255,255,.08)",
        }}
      >
        <Seats seats={seats} view={view} />
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
      <span style={{ color: "#666", fontSize: 12, marginLeft: "1em" }}>
        table · active seat = Avery
      </span>
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
