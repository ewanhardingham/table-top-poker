/*
 * PROTOTYPE — throwaway. Three variants of the tabled Hand on the Seat plate,
 * switchable via ?prototype=showdown-cards&variant=A|B|C&seats=6|8.
 * Answers: how big should the Showdown Hole cards be, and what treatment reads
 * on a real table? Not production code — no tests, no abstractions.
 */
import type {
  Card as CardType,
  RevealedResult,
  SeatView,
  TableView,
} from "@table-top-poker/protocol";
import { Card, color, font, shadow } from "@table-top-poker/ui-shared";
import { Board } from "../Board.js";
import { ordinal, rankShowdownHands } from "../showdownRanking.js";
import { posFor } from "../table/posFor.js";

type Variant = "A" | "B" | "C";

export const variantNames: Record<Variant, string> = {
  A: "Bigger on the plate",
  B: "Tabled fan",
  C: "Plate takes the hand",
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

interface Tabled {
  readonly result: RevealedResult | null;
  readonly place: number | null;
  readonly isWinner: boolean;
  readonly splitting: boolean;
}

function badgeStyle(isWinner: boolean, size: string) {
  return {
    flex: "none" as const,
    padding: "0.2em 0.55em",
    borderRadius: "999px",
    fontFamily: font.mono,
    fontSize: size,
    fontWeight: 700,
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    background: isWinner ? color.winBright : color.controlFill,
    color: isWinner ? color.pillInk : color.textMuted,
  };
}

function verdictText(tabled: Tabled): string | null {
  const outcome = tabled.splitting ? "splits" : "wins";
  if (tabled.result === null) {
    return tabled.isWinner ? `Not shown — ${outcome}` : null;
  }
  return tabled.isWinner
    ? `${tabled.result.description} — ${outcome}`
    : tabled.result.description;
}

/* ---------- Variant A: same stack, cards ~2.3x bigger, label stacked ---------- */

const A_SCALE = "clamp(0.85rem, 2.6vh, 1.25rem)";

function TabledA({ tabled }: { readonly tabled: Tabled }) {
  const verdict = verdictText(tabled);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.35rem",
        maxWidth: "11rem",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.16em",
          padding: "0.22em",
          borderRadius: "0.45em",
          fontSize: A_SCALE,
          border: `1px solid ${tabled.isWinner ? color.winBorder : "transparent"}`,
          background: tabled.isWinner ? color.winPlate : undefined,
        }}
      >
        {tabled.result === null ? (
          <>
            <Card faceDown />
            <Card faceDown />
          </>
        ) : (
          tabled.result.holeCards.map((card, i) => (
            <Card key={i} rank={card.rank} suit={card.suit} />
          ))
        )}
      </div>
      {tabled.place !== null && (
        <span style={badgeStyle(tabled.isWinner, "0.6rem")}>
          {ordinal(tabled.place)}
        </span>
      )}
      {verdict !== null && (
        <span
          style={{
            textAlign: "center",
            lineHeight: 1.25,
            fontSize: "0.72rem",
            fontWeight: 600,
            color: tabled.isWinner ? color.winText : color.textDim,
          }}
        >
          {verdict}
        </span>
      )}
    </div>
  );
}

/* ---------- Variant B: overlapped, tilted fan; badge rides the cards ---------- */

const B_SCALE = "clamp(1rem, 3.1vh, 1.5rem)";

function TabledB({ tabled }: { readonly tabled: Tabled }) {
  const verdict = verdictText(tabled);
  const faces =
    tabled.result === null
      ? [null, null]
      : [tabled.result.holeCards[0], tabled.result.holeCards[1]];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.3rem",
        maxWidth: "12rem",
      }}
    >
      <div style={{ position: "relative", fontSize: B_SCALE, height: "5.4em" }}>
        {faces.map((card, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: i === 0 ? 0 : "2.2em",
              top: i === 0 ? "0.25em" : 0,
              transform: `rotate(${String(i === 0 ? -7 : 6)}deg)`,
              filter: `drop-shadow(${shadow.card})`,
            }}
          >
            {card === null ? (
              <Card faceDown />
            ) : (
              <Card rank={card.rank} suit={card.suit} />
            )}
          </div>
        ))}
        <div style={{ width: "5.7em", height: "5.4em" }} />
        {tabled.place !== null && (
          <span
            style={{
              ...badgeStyle(tabled.isWinner, "0.55em"),
              position: "absolute",
              right: "-0.7em",
              bottom: "0.1em",
              boxShadow: shadow.card,
            }}
          >
            {ordinal(tabled.place)}
          </span>
        )}
      </div>
      {verdict !== null && (
        <span
          style={{
            textAlign: "center",
            lineHeight: 1.25,
            fontSize: "0.72rem",
            fontWeight: 600,
            color: tabled.isWinner ? color.winText : color.textDim,
          }}
        >
          {verdict}
        </span>
      )}
    </div>
  );
}

/* ---------- Variant C: the hand sits beside the avatar, pod goes wide ---------- */

const C_SCALE = "clamp(0.95rem, 2.9vh, 1.4rem)";

function TabledC({
  tabled,
  seat,
}: {
  readonly tabled: Tabled;
  readonly seat: SeatView;
}) {
  const verdict = verdictText(tabled);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        padding: "0.4rem 0.6rem",
        borderRadius: "0.8rem",
        border: `1px solid ${tabled.isWinner ? color.winBorder : color.border}`,
        background: tabled.isWinner ? color.winPlate : color.control,
        maxWidth: "17rem",
      }}
    >
      <div style={{ display: "flex", gap: "0.14em", fontSize: C_SCALE }}>
        {tabled.result === null ? (
          <>
            <Card faceDown />
            <Card faceDown />
          </>
        ) : (
          tabled.result.holeCards.map((card, i) => (
            <Card key={i} rank={card.rank} suit={card.suit} />
          ))
        )}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.25rem",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          {tabled.place !== null && (
            <span style={badgeStyle(tabled.isWinner, "0.58rem")}>
              {ordinal(tabled.place)}
            </span>
          )}
          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: 700,
              color: color.textBright,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {seat.displayName}
          </span>
        </div>
        {verdict !== null && (
          <span
            style={{
              fontSize: "0.72rem",
              lineHeight: 1.25,
              fontWeight: 600,
              color: tabled.isWinner ? color.winText : color.textDim,
            }}
          >
            {verdict}
          </span>
        )}
      </div>
    </div>
  );
}

/* ---------- The felt ---------- */

function Placard({ seat }: { readonly seat: SeatView }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5em" }}>
      <div
        style={{
          width: "3em",
          height: "3em",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: font.display,
          fontWeight: 800,
          fontSize: "1.1em",
          background: color.text,
          color: color.pillInk,
        }}
      >
        {seat.id + 1}
      </div>
      <div
        style={{ fontSize: "0.7em", fontWeight: 600, color: color.textBright }}
      >
        {seat.displayName}
      </div>
    </div>
  );
}

function Felt({
  variant,
  seatCount,
  shownCount,
}: {
  readonly variant: Variant;
  readonly seatCount: number;
  readonly shownCount: number;
}) {
  const { seats, view } = fixture(seatCount, shownCount);
  const ranked = new Map(
    rankShowdownHands(view.results).map((h) => [h.result.seatId, h]),
  );
  const winners = view.winners ?? [];

  return (
    <main className="felt" style={{ position: "relative", flex: 1 }}>
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
        {seats.map((seat) => {
          const hand = ranked.get(seat.id);
          const tabled: Tabled = {
            result: hand?.result ?? null,
            place: hand?.place ?? null,
            isWinner: winners.includes(seat.id),
            splitting: winners.length > 1,
          };
          const pos = posFor(seat.id, seats.length);
          const isTopRow = pos.top < 50;
          const block =
            variant === "A" ? (
              <TabledA tabled={tabled} />
            ) : variant === "B" ? (
              <TabledB tabled={tabled} />
            ) : (
              <TabledC tabled={tabled} seat={seat} />
            );

          return (
            <div
              key={seat.id}
              style={{
                position: "absolute",
                left: `${String(pos.left)}%`,
                top: `${String(pos.top)}%`,
                transform: "translate(-50%, -50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.5em",
              }}
            >
              {!isTopRow && block}
              {variant !== "C" && (
                <div
                  style={{ transform: isTopRow ? "rotate(180deg)" : undefined }}
                >
                  <Placard seat={seat} />
                </div>
              )}
              {isTopRow && block}
            </div>
          );
        })}
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
      </div>
    </main>
  );
}

/* ---------- Switcher ---------- */

const order: readonly Variant[] = ["A", "B", "C"];

function setParam(key: string, value: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set(key, value);
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new Event("prototype-nav"));
}

function Switcher({
  variant,
  seatCount,
  shownCount,
}: {
  readonly variant: Variant;
  readonly seatCount: number;
  readonly shownCount: number;
}) {
  const step = (delta: number) => {
    const next =
      order[(order.indexOf(variant) + delta + order.length) % order.length];
    if (next) setParam("variant", next);
  };
  const button = {
    border: 0,
    borderRadius: "999px",
    width: 34,
    height: 34,
    fontSize: 17,
    cursor: "pointer",
    background: "#fff",
    color: "#111",
  };
  const chip = (active: boolean) => ({
    border: 0,
    borderRadius: "999px",
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    background: active ? "#111" : "rgba(255,255,255,.25)",
    color: active ? "#fff" : "#111",
  });

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
        style={button}
        onClick={() => {
          step(-1);
        }}
      >
        ←
      </button>
      <span style={{ fontSize: 14, fontWeight: 700, minWidth: 190 }}>
        {variant} — {variantNames[variant]}
      </span>
      <button
        type="button"
        style={button}
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
          style={chip(seatCount === n)}
          onClick={() => {
            setParam("seats", String(n));
          }}
        >
          {n} seats
        </button>
      ))}
      <span style={{ width: 1, height: 22, background: "rgba(0,0,0,.2)" }} />
      {[
        ["all", seatCount],
        ["3 shown", 3],
      ].map(([label, n]) => (
        <button
          key={String(label)}
          type="button"
          style={chip(shownCount === n)}
          onClick={() => {
            setParam("shown", String(n));
          }}
        >
          {String(label)}
        </button>
      ))}
    </div>
  );
}

export function ShowdownCardsPrototype() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("variant") ?? "A";
  const variant: Variant = order.includes(raw as Variant)
    ? (raw as Variant)
    : "A";
  const seatCount = params.get("seats") === "6" ? 6 : 8;
  const shownParam = Number(params.get("shown") ?? seatCount);
  const shownCount = Number.isFinite(shownParam)
    ? Math.min(Math.max(shownParam, 0), seatCount)
    : seatCount;

  return (
    <div
      className="app-shell"
      style={{ display: "flex", flexDirection: "column", height: "100vh" }}
    >
      <Felt variant={variant} seatCount={seatCount} shownCount={shownCount} />
      <Switcher
        variant={variant}
        seatCount={seatCount}
        shownCount={shownCount}
      />
    </div>
  );
}
