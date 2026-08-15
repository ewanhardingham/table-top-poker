/**
 * PROTOTYPE ONLY — throwaway route `/prototype/seat-orientation`.
 *
 * Question: should the seats along the far edge of the physical table rotate
 * so their players can read them upright from that side?
 *
 * Three variants are deliberately shown against the real seat geometry:
 *   A — current: every seat has one screen orientation;
 *   B — whole pod: the top seat, marker, status and To act pill rotate as one;
 *   C — placard: identity becomes a compact flipped sign and the action pill
 *       stays a separate inward-facing callout.
 *
 * Run: `npm run prototype:seat-orientation`
 */
import type { Card as CardType } from "@table-top-poker/protocol";
import { Card, color, font, radius, shadow } from "@table-top-poker/ui-shared";
import { useCallback, useState } from "react";
import { posFor } from "../table/posFor.js";
import { PrototypeSwitcher } from "./PrototypeSwitcher.js";

type VariantKey = "A" | "B" | "C";
type SeatState = "active" | "waiting" | "folded";
type Marker = "D" | "SB" | "BB";

interface DemoSeat {
  readonly id: number;
  readonly name: string;
  readonly state: SeatState;
  readonly marker?: Marker;
  readonly toAct?: boolean;
}

const VARIANTS: readonly VariantKey[] = ["A", "B", "C"];

const VARIANT_NAMES: Readonly<Record<VariantKey, string>> = {
  A: "Current · one screen orientation",
  B: "Whole pod · 180° top-side flip",
  C: "Placard · identity flip, action callout",
};

const VARIANT_DETAILS: Readonly<
  Record<VariantKey, { readonly summary: string; readonly state: string }>
> = {
  A: {
    summary: "Top-side labels remain upside down to the people sitting there.",
    state: "Top row: unchanged · marker: unchanged · To act: unchanged",
  },
  B: {
    summary:
      "The complete top seat turns half a revolution, including its marker and action label.",
    state: "Top row: flipped · marker: travels with seat · To act: flipped",
  },
  C: {
    summary:
      "The identity sign faces the top player while the action prompt keeps its own inward footprint.",
    state:
      "Top row: placard flipped · marker: on sign · To act: separate callout",
  },
};

const seats: readonly DemoSeat[] = [
  { id: 0, name: "Mara", state: "active", marker: "D" },
  { id: 1, name: "Devin", state: "active" },
  { id: 2, name: "Priya", state: "waiting" },
  { id: 3, name: "Ovi", state: "active" },
  { id: 4, name: "Sam", state: "active", marker: "BB" },
  { id: 5, name: "Lena", state: "folded" },
  { id: 6, name: "Nkechi-Amara", state: "active", marker: "SB", toAct: true },
  { id: 7, name: "Theo", state: "active" },
];

const board: readonly CardType[] = [
  { rank: "10", suit: "hearts" },
  { rank: "10", suit: "clubs" },
  { rank: "2", suit: "spades" },
  { rank: "7", suit: "diamonds" },
  { rank: "3", suit: "clubs" },
];

function isVariant(value: string): value is VariantKey {
  return VARIANTS.includes(value as VariantKey);
}

function readVariant(): VariantKey {
  const value = new URLSearchParams(window.location.search).get("variant");
  return value && isVariant(value) ? value : "A";
}

function Avatar({
  seat,
  marker,
}: {
  readonly seat: DemoSeat;
  readonly marker: Marker | undefined;
}) {
  return (
    <span className={`seat-orientation-avatar state-${seat.state}`}>
      {seat.id + 1}
      {marker && (
        <span className={`seat-orientation-marker marker-${marker}`}>
          {marker}
        </span>
      )}
    </span>
  );
}

function SeatName({ seat }: { readonly seat: DemoSeat }) {
  return (
    <span className="seat-orientation-name" title={seat.name}>
      {seat.name}
    </span>
  );
}

function SeatState({ seat }: { readonly seat: DemoSeat }) {
  if (seat.state === "waiting") {
    return (
      <span className="seat-orientation-state">
        <b>Waiting</b>
        <small>Next hand</small>
      </span>
    );
  }
  if (seat.state === "folded") {
    return (
      <span className="seat-orientation-state">
        <b>Folded</b>
        <small>Out of hand</small>
      </span>
    );
  }
  return (
    <span className="seat-orientation-state">
      <b>In hand</b>
    </span>
  );
}

function StackBlocks({
  seat,
  isTop,
}: {
  readonly seat: DemoSeat;
  readonly isTop: boolean;
}) {
  const blocks = [
    <Avatar key="avatar" seat={seat} marker={seat.marker} />,
    <SeatName key="name" seat={seat} />,
    <SeatState key="state" seat={seat} />,
  ];
  return <>{isTop ? blocks : [...blocks].reverse()}</>;
}

function ToAct({
  seat,
  className = "",
}: {
  readonly seat: DemoSeat;
  readonly className?: string;
}) {
  if (!seat.toAct) return null;
  return <span className={`seat-orientation-to-act ${className}`}>To act</span>;
}

function VariantASeat({
  seat,
  isTop,
}: {
  readonly seat: DemoSeat;
  readonly isTop: boolean;
}) {
  return (
    <div className="seat-orientation-seat-group seat-orientation-seat-group--stack">
      <div className="seat-orientation-surface">
        <StackBlocks seat={seat} isTop={isTop} />
      </div>
      <ToAct seat={seat} />
    </div>
  );
}

function VariantBSeat({
  seat,
  isTop,
}: {
  readonly seat: DemoSeat;
  readonly isTop: boolean;
}) {
  return (
    <div
      className={`seat-orientation-seat-group seat-orientation-seat-group--stack ${isTop ? "seat-orientation-seat-group--whole-flip" : ""}`}
    >
      <div className="seat-orientation-surface">
        <StackBlocks seat={seat} isTop={isTop} />
      </div>
      <ToAct seat={seat} />
    </div>
  );
}

function VariantCSeat({
  seat,
  isTop,
}: {
  readonly seat: DemoSeat;
  readonly isTop: boolean;
}) {
  return (
    <div className="seat-orientation-seat-group seat-orientation-seat-group--placard">
      <div
        className={`seat-orientation-placard ${isTop ? "seat-orientation-flip" : ""}`}
      >
        <Avatar seat={seat} marker={seat.marker} />
        <span className="seat-orientation-placard-copy">
          <SeatName seat={seat} />
          <SeatState seat={seat} />
        </span>
      </div>
      <ToAct seat={seat} className={isTop ? "seat-orientation-flip" : ""} />
    </div>
  );
}

function SeatSpot({
  seat,
  variant,
}: {
  readonly seat: DemoSeat;
  readonly variant: VariantKey;
}) {
  const position = posFor(seat.id, seats.length);
  const isTop = position.top < 50;
  return (
    <div
      className={`seat-orientation-spot ${isTop ? "seat-orientation-spot--top" : "seat-orientation-spot--bottom"}`}
      data-seat-id={seat.id}
      data-top-row={isTop}
      style={{
        left: `${String(position.left)}%`,
        top: `${String(position.top)}%`,
      }}
    >
      {variant === "A" && <VariantASeat seat={seat} isTop={isTop} />}
      {variant === "B" && <VariantBSeat seat={seat} isTop={isTop} />}
      {variant === "C" && <VariantCSeat seat={seat} isTop={isTop} />}
    </div>
  );
}

function Board() {
  return (
    <div className="seat-orientation-board" aria-label="Example hand board">
      <span className="seat-orientation-board-kicker">Hand 128 · Flop</span>
      <div className="seat-orientation-board-cards">
        {board.map((card, index) => (
          <Card key={index} rank={card.rank} suit={card.suit} />
        ))}
      </div>
      <span className="seat-orientation-pot">Pot · 240</span>
    </div>
  );
}

function Rail() {
  return (
    <div className="seat-orientation-rail">
      <button type="button">Deal hand</button>
      <button type="button" className="secondary">
        End session
      </button>
    </div>
  );
}

export function SeatOrientationPrototype() {
  const [variant, setVariant] = useState<VariantKey>(readVariant);

  const choose = useCallback((next: string) => {
    const value = isVariant(next) ? next : "A";
    const url = new URL(window.location.href);
    url.searchParams.set("variant", value);
    window.history.replaceState(null, "", url);
    setVariant(value);
  }, []);

  const detail = VARIANT_DETAILS[variant];

  return (
    <div
      className="seat-orientation-proto-shell"
      style={{
        background: color.background,
        color: color.text,
        fontFamily: font.body,
      }}
    >
      <header className="seat-orientation-proto-header">
        <div>
          <span className="seat-orientation-proto-kicker">
            Prototype · seat orientation
          </span>
          <h1 style={{ fontFamily: font.display }}>
            Make the far-side seats readable
          </h1>
        </div>
        <p>
          Compare the top edge from the players’ point of view. The upside-down
          top row in A is the current table; B and C are the candidates.
        </p>
        <span
          className="seat-orientation-proto-hint"
          style={{ fontFamily: font.mono }}
        >
          ← / → switch variants
        </span>
      </header>

      <main
        className="seat-orientation-proto-stage"
        style={{ background: color.felt, borderRadius: radius.panel }}
      >
        <div className="seat-orientation-edge-label seat-orientation-edge-label--top">
          ↑ top-side players
        </div>
        <div className="seat-orientation-edge-label seat-orientation-edge-label--bottom">
          ↓ table-side players
        </div>
        <div className="seat-orientation-rail-outline" />
        <Board />
        {seats.map((seat) => (
          <SeatSpot key={seat.id} seat={seat} variant={variant} />
        ))}
        <Rail />
      </main>

      <aside
        className="seat-orientation-readout"
        aria-live="polite"
        style={{ boxShadow: shadow.card }}
      >
        <span className="seat-orientation-readout-key">
          {variant} · {VARIANT_NAMES[variant]}
        </span>
        <strong>{detail.summary}</strong>
        <span>{detail.state}</span>
      </aside>

      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        names={VARIANT_NAMES}
        onChange={choose}
      />
    </div>
  );
}
