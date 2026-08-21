/*
 * PROTOTYPE — throwaway. Four treatments of the tabled Hand, rendered on the
 * real table chrome (real StatusBar, Seats, Board, TableControls) with a
 * static Showdown view. Switchable via
 * ?prototype=showdown-cards&variant=current|stack|fan|inline&seats=6|8.
 * Answers how big the Showdown Hole cards should be and what treatment reads
 * at the table. Not production code.
 */
import type {
  Card as CardType,
  RevealedResult,
  SeatView,
  TableView,
} from "@table-top-poker/protocol";
import { color } from "@table-top-poker/ui-shared";
import { Board } from "../Board.js";
import { Seats, type ShowdownTreatment } from "../Seats.js";
import { SettingsToggle } from "../SettingsToggle.js";
import { StatusBar } from "../StatusBar.js";
import { TableControls } from "../TableControls.js";

export const treatmentNames: Record<ShowdownTreatment, string> = {
  current: "As shipped (tiny)",
  stack: "Bigger on the plate",
  fan: "Tabled fan",
  inline: "Plate takes the hand",
};

const hands: readonly {
  readonly holeCards: readonly [CardType, CardType];
  readonly description: string;
  readonly rank: number;
}[] = [
  {
    holeCards: [
      { rank: "A", suit: "clubs" },
      { rank: "A", suit: "hearts" },
    ],
    description: "Three of a kind, aces",
    rank: 80,
  },
  {
    holeCards: [
      { rank: "K", suit: "spades" },
      { rank: "Q", suit: "spades" },
    ],
    description: "Flush, ace high",
    rank: 70,
  },
  {
    holeCards: [
      { rank: "9", suit: "diamonds" },
      { rank: "9", suit: "clubs" },
    ],
    description: "Two pair, nines and fours",
    rank: 60,
  },
  {
    holeCards: [
      { rank: "J", suit: "hearts" },
      { rank: "10", suit: "hearts" },
    ],
    description: "Straight to the jack",
    rank: 60,
  },
  {
    holeCards: [
      { rank: "7", suit: "clubs" },
      { rank: "2", suit: "diamonds" },
    ],
    description: "Pair of fours",
    rank: 40,
  },
  {
    holeCards: [
      { rank: "8", suit: "spades" },
      { rank: "3", suit: "hearts" },
    ],
    description: "Ace high",
    rank: 20,
  },
  {
    holeCards: [
      { rank: "6", suit: "clubs" },
      { rank: "5", suit: "clubs" },
    ],
    description: "Straight to the eight",
    rank: 65,
  },
  {
    holeCards: [
      { rank: "Q", suit: "diamonds" },
      { rank: "J", suit: "clubs" },
    ],
    description: "Queen high",
    rank: 25,
  },
];

const board: readonly CardType[] = [
  { rank: "A", suit: "spades" },
  { rank: "4", suit: "hearts" },
  { rank: "4", suit: "spades" },
  { rank: "7", suit: "spades" },
  { rank: "9", suit: "spades" },
];

const names = [
  "Avery",
  "Blake",
  "Casey",
  "Devin",
  "Emery",
  "Frankie",
  "Gale",
  "Harper",
];

function fixture(seatCount: number, shownCount: number) {
  const seats: SeatView[] = Array.from({ length: seatCount }, (_, id) => ({
    id,
    claimed: true,
    displayName: names[id] ?? `Seat ${String(id + 1)}`,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  }));
  const contestants = seats.map((seat) => seat.id);
  const results: RevealedResult[] = contestants
    .slice(0, shownCount)
    .map((seatId, i) => {
      const hand = hands[i % hands.length];
      if (hand === undefined) throw new Error("missing fixture hand");
      return {
        seatId,
        holeCards: hand.holeCards,
        rank: hand.rank,
        description: hand.description,
        bestHand: [...board] as unknown as RevealedResult["bestHand"],
      };
    });
  const best = Math.max(...results.map((r) => r.rank));
  const view: Extract<TableView, { phase: "showdown" }> = {
    phase: "showdown",
    button: 0,
    smallBlind: 1,
    bigBlind: 2,
    dealtSeatCount: seatCount,
    board: [...board],
    contestants,
    results,
    winners: results.filter((r) => r.rank === best).map((r) => r.seatId),
  };
  return { seats, view };
}

/* ---------- The real felt ---------- */

const feltSurfaceStyle = {
  position: "absolute" as const,
  inset: "1em",
  borderRadius: "0.7em",
  background: color.felt,
  boxShadow:
    "inset 0 0 12em 4em rgba(0,0,0,.62), inset 0 2px 0 rgba(255,255,255,.08)",
};

function Felt({
  treatment,
  seatCount,
  shownCount,
}: {
  readonly treatment: ShowdownTreatment;
  readonly seatCount: number;
  readonly shownCount: number;
}) {
  const { seats, view } = fixture(seatCount, shownCount);
  const noop = () => undefined;

  return (
    <div className="app-shell" data-testid="table-client-shell">
      <StatusBar
        roomCode="ABCD"
        connectionStatus="connected"
        showRoomCode
        onOpenJoin={noop}
      />
      <main className="felt">
        <div style={feltSurfaceStyle}>
          <Seats
            seats={seats}
            view={view}
            showdownTreatment={treatment}
            onSeatClick={noop}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <Board view={view} seats={seats} />
          </div>
          <SettingsToggle open={false} onToggle={noop} />
          <TableControls
            canStartHand={false}
            handComplete
            canDealNextHand
            onStartHand={noop}
            onNextHand={noop}
            onEndSession={noop}
            onReviewHands={noop}
          />
        </div>
      </main>
    </div>
  );
}

/* ---------- Switcher ---------- */

const order: readonly ShowdownTreatment[] = [
  "current",
  "stack",
  "fan",
  "inline",
];

function setParam(key: string, value: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event("prototype-nav"));
}

const buttonStyle = {
  border: 0,
  borderRadius: "999px",
  width: 34,
  height: 34,
  fontSize: 17,
  cursor: "pointer",
  background: "#fff",
  color: "#111",
};

function chipStyle(active: boolean) {
  return {
    border: 0,
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    background: active ? "#111" : "rgba(255,255,255,.25)",
    color: active ? "#fff" : "#111",
  };
}

function Switcher({
  treatment,
  seatCount,
  shownCount,
}: {
  readonly treatment: ShowdownTreatment;
  readonly seatCount: number;
  readonly shownCount: number;
}) {
  const step = (delta: number) => {
    const next =
      order[(order.indexOf(treatment) + delta + order.length) % order.length];
    if (next) setParam("variant", next);
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 18,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 99,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 999,
        background: "rgba(255,255,255,.92)",
        color: "#111",
        boxShadow: "0 10px 40px rgba(0,0,0,.6)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <button
        type="button"
        style={buttonStyle}
        onClick={() => {
          step(-1);
        }}
      >
        ←
      </button>
      <span style={{ fontSize: 14, fontWeight: 700, minWidth: 200 }}>
        {treatmentNames[treatment]}
      </span>
      <button
        type="button"
        style={buttonStyle}
        onClick={() => {
          step(1);
        }}
      >
        →
      </button>
      <span style={{ width: 1, height: 22, background: "rgba(0,0,0,.2)" }} />
      {[6, 8].map((n) => (
        <button
          key={n}
          type="button"
          style={chipStyle(seatCount === n)}
          onClick={() => {
            setParam("seats", String(n));
          }}
        >
          {n} seats
        </button>
      ))}
      <span style={{ width: 1, height: 22, background: "rgba(0,0,0,.2)" }} />
      <button
        type="button"
        style={chipStyle(shownCount === seatCount)}
        onClick={() => {
          setParam("shown", String(seatCount));
        }}
      >
        all shown
      </button>
      <button
        type="button"
        style={chipStyle(shownCount === 3)}
        onClick={() => {
          setParam("shown", "3");
        }}
      >
        3 shown
      </button>
    </div>
  );
}

export function ShowdownCardsPrototype() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("variant") ?? "inline";
  const treatment: ShowdownTreatment = order.includes(raw as ShowdownTreatment)
    ? (raw as ShowdownTreatment)
    : "inline";
  const seatCount = params.get("seats") === "6" ? 6 : 8;
  const shownParam = Number(params.get("shown") ?? seatCount);
  const shownCount = Number.isFinite(shownParam)
    ? Math.min(Math.max(shownParam, 0), seatCount)
    : seatCount;

  return (
    <>
      <Felt
        treatment={treatment}
        seatCount={seatCount}
        shownCount={shownCount}
      />
      <Switcher
        treatment={treatment}
        seatCount={seatCount}
        shownCount={shownCount}
      />
    </>
  );
}
