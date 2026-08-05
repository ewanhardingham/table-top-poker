/**
 * PROTOTYPE ONLY — throwaway, dev-only route `/prototype/showdown-reveal`.
 *
 * Question it answers: at showdown, how should a seat reveal its hole cards so
 * that the avatar never moves from its `posFor` anchor, the reveal grows
 * *inward* toward the felt centre instead of spilling past the rail, and the
 * winner is emphasised without a footprint-inflating box?
 *
 * Three variants, switchable via `?variant=` and the floating bar / arrow keys.
 *
 * Per-seat reveals (avatar pinned, cards grow inward, no full-pod box):
 *   A — Tuck: cards peek out from *behind* the avatar toward centre.
 *   C — Tab: a compact rounded callout hanging inward off the avatar's edge.
 *
 * Showdown overlay:
 *   E — A large panel over a dimmed table showing the board plus every still-
 *       in-hand player's name + cards; winner(s) featured big and glowing. Its
 *       "Next hand" button closes the overlay and deals a fresh hand.
 *
 * Everything below is real table geometry: it imports the shipping `posFor`,
 * `Card`, and design tokens so the variants butt up against the real rail.
 */
import type { Card as CardType } from "@table-top-poker/protocol";
import { Card, color, font } from "@table-top-poker/ui-shared";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { posFor } from "../table/posFor.js";
import { PrototypeSwitcher } from "./PrototypeSwitcher.js";

type VariantKey = "A" | "C" | "E";

const VARIANTS = [
  { key: "A", name: "Per-seat · Tuck — cards behind avatar" },
  { key: "C", name: "Per-seat · Tab — callout hanging inward" },
  { key: "E", name: "Overlay · Featured winner" },
] as const;

function isVariant(key: string): key is VariantKey {
  return key === "A" || key === "C" || key === "E";
}

interface DemoSeat {
  readonly id: number;
  readonly name: string;
  readonly holeCards: readonly [CardType, CardType] | null;
  /** Only the curated opening hand carries these; re-deals leave them null. */
  readonly handDescription: string | null;
  readonly isWinner: boolean;
  readonly folded: boolean;
}

interface Hand {
  readonly board: readonly CardType[];
  readonly seats: readonly DemoSeat[];
}

const c = (rank: CardType["rank"], suit: CardType["suit"]): CardType => ({
  rank,
  suit,
});

/**
 * The curated opening hand: winners on BOTH rows, a folded seat, and a long
 * name parked at the left extreme. "Next hand" replaces it with random deals.
 */
const OPENING_SEATS: readonly DemoSeat[] = [
  {
    id: 0,
    name: "Mara",
    holeCards: [c("K", "spades"), c("K", "diamonds")],
    handDescription: "Full House, Kings full of Tens",
    isWinner: true,
    folded: false,
  },
  {
    id: 1,
    name: "Devin",
    holeCards: [c("A", "clubs"), c("9", "hearts")],
    handDescription: "Two Pair, Aces and Nines",
    isWinner: false,
    folded: false,
  },
  {
    id: 2,
    name: "Priya",
    holeCards: null,
    handDescription: null,
    isWinner: false,
    folded: true,
  },
  {
    id: 3,
    name: "Ovi",
    holeCards: [c("Q", "diamonds"), c("7", "diamonds")],
    handDescription: "Flush, Queen high",
    isWinner: false,
    folded: false,
  },
  {
    id: 4,
    name: "Sam",
    holeCards: [c("9", "clubs"), c("8", "spades")],
    handDescription: "Straight, Nine high",
    isWinner: false,
    folded: false,
  },
  {
    id: 5,
    name: "Lena",
    holeCards: [c("J", "hearts"), c("J", "spades")],
    handDescription: "Pair of Jacks",
    isWinner: false,
    folded: false,
  },
  {
    id: 6,
    name: "Theo",
    holeCards: [c("K", "clubs"), c("K", "hearts")],
    handDescription: "Full House, Kings full of Tens",
    isWinner: true,
    folded: false,
  },
  {
    id: 7,
    name: "Nkechi-Amara",
    holeCards: [c("A", "spades"), c("4", "clubs")],
    handDescription: "High Card, Ace",
    isWinner: false,
    folded: false,
  },
];

const TOTAL = OPENING_SEATS.length;

const OPENING_HAND: Hand = {
  board: [
    c("10", "hearts"),
    c("10", "clubs"),
    c("2", "spades"),
    c("7", "clubs"),
    c("3", "diamonds"),
  ],
  seats: OPENING_SEATS,
};

// --- Dealer: a real 52-card shuffle so "Next hand" produces fresh, unique
// cards. Decorative only — no hand is evaluated, winners are picked at random.
const RANKS: readonly CardType["rank"][] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];
const SUITS: readonly CardType["suit"][] = [
  "clubs",
  "diamonds",
  "hearts",
  "spades",
];

function shuffledDeck(): CardType[] {
  const deck: CardType[] = [];
  for (const rank of RANKS) for (const suit of SUITS) deck.push({ rank, suit });
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = deck[i];
    const b = deck[j];
    if (a && b) {
      deck[i] = b;
      deck[j] = a;
    }
  }
  return deck;
}

// Decorative hand labels for re-deals. The real client uses the engine's
// `RevealedResult.description`; here we just pick a plausible one so the
// overlay has text to lay out. Winners draw from the stronger end.
const LOSER_LABELS: readonly string[] = [
  "High Card, Ace",
  "Pair of Nines",
  "Pair of Jacks",
  "Two Pair, Kings and Fives",
  "Two Pair, Aces and Nines",
  "Straight, Nine high",
  "Flush, Queen high",
];
const WINNER_LABELS: readonly string[] = [
  "Straight, Ten high",
  "Flush, King high",
  "Full House, Kings full of Tens",
  "Four of a Kind, Sixes",
  "Straight Flush, Nine high",
];

function pick<T>(pool: readonly T[]): T {
  const value = pool[Math.floor(Math.random() * pool.length)];
  if (value === undefined) throw new Error("empty pool");
  return value;
}

/** Deals cards off the top of a deck, narrowing away `undefined`. */
function dealer(deck: readonly CardType[]) {
  let index = 0;
  return function deal(): CardType {
    const card = deck[index];
    index += 1;
    if (!card) throw new Error("deck exhausted");
    return card;
  };
}

function dealHand(): Hand {
  const deal = dealer(shuffledDeck());
  const board = [deal(), deal(), deal(), deal(), deal()];

  const foldCount = Math.random() < 0.5 ? 1 : 2;
  const foldIds = new Set<number>();
  while (foldIds.size < foldCount) {
    foldIds.add(Math.floor(Math.random() * TOTAL));
  }

  const seats: DemoSeat[] = OPENING_SEATS.map(({ id, name }) => {
    const folded = foldIds.has(id);
    return {
      id,
      name,
      holeCards: folded ? null : [deal(), deal()],
      handDescription: folded ? null : pick(LOSER_LABELS),
      isWinner: false,
      folded,
    };
  });

  const contenders = seats.filter((seat) => !seat.folded);
  const winnerCount = Math.random() < 0.22 ? 2 : 1;
  const winnerIds = new Set(
    [...contenders]
      .sort(() => Math.random() - 0.5)
      .slice(0, winnerCount)
      .map((seat) => seat.id),
  );
  const winnerLabel = pick(WINNER_LABELS);

  return {
    board,
    seats: seats.map((seat) =>
      winnerIds.has(seat.id)
        ? { ...seat, isWinner: true, handDescription: winnerLabel }
        : seat,
    ),
  };
}

function initialVariant(): VariantKey {
  const v = new URLSearchParams(window.location.search).get("variant");
  return isVariant(v ?? "") ? (v as VariantKey) : "A";
}

/** Two hole cards, shrunk against the pod's em base. `overlap` fans them. */
function MiniCards({
  cards,
  overlap = false,
  scale = "0.5em",
}: {
  readonly cards: readonly [CardType, CardType];
  readonly overlap?: boolean;
  readonly scale?: string;
}) {
  return (
    <div style={{ display: "flex", fontSize: scale }}>
      {cards.map((card, i) => (
        <div
          key={i}
          style={{
            marginLeft: i > 0 ? (overlap ? "-1.6em" : "0.24em") : 0,
            transform: overlap
              ? `rotate(${i === 0 ? "-7deg" : "7deg"})`
              : undefined,
          }}
        >
          <Card rank={card.rank} suit={card.suit} />
        </div>
      ))}
    </div>
  );
}

function NameChip({
  seat,
  bright = false,
}: {
  readonly seat: DemoSeat;
  readonly bright?: boolean;
}) {
  return (
    <div
      style={{
        maxWidth: "7em",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontSize: "0.62em",
        fontWeight: 600,
        color: bright ? color.textBright : color.textMuted,
      }}
    >
      {seat.name}
    </div>
  );
}

function Caption({
  seat,
  bright,
}: {
  readonly seat: DemoSeat;
  readonly bright: boolean;
}) {
  if (!seat.handDescription) return null;
  return (
    <div
      style={{
        fontFamily: font.mono,
        fontSize: "0.5em",
        letterSpacing: "0.02em",
        textAlign: "center",
        lineHeight: 1.25,
        maxWidth: "9em",
        color: bright ? color.winBright : color.textDim,
      }}
    >
      {seat.handDescription}
    </div>
  );
}

/** The avatar disc itself. `shadow` carries the winner emphasis for the
 *  anchored variants, so it never changes the disc's box. */
function Avatar({
  seat,
  shadow,
}: {
  readonly seat: DemoSeat;
  readonly shadow?: string | undefined;
}) {
  return (
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
        background: seat.folded ? color.seatAvatarFolded : color.text,
        color: seat.folded ? color.seatAvatarFoldedText : color.pillInk,
        boxShadow: shadow ?? "0 0 0 1px rgba(255,255,255,.1)",
        opacity: seat.folded ? 0.5 : 1,
        position: "relative",
        zIndex: 2,
      }}
    >
      {seat.id + 1}
    </div>
  );
}

// Shared anchor for the fixed-avatar variants: the avatar box is the ONLY
// thing centred on posFor, so appendages hung off it (absolute) can never
// move it. `inner` is the felt-facing edge, `outer` the rail-facing one.
function edges(isTopRow: boolean) {
  return {
    inner: isTopRow ? { top: "100%" as const } : { bottom: "100%" as const },
    outer: isTopRow ? { bottom: "100%" as const } : { top: "100%" as const },
    innerGap: isTopRow ? { marginTop: "0.4em" } : { marginBottom: "0.4em" },
    outerGap: isTopRow ? { marginBottom: "0.3em" } : { marginTop: "0.3em" },
  };
}

const centreX = {
  left: "50%",
  transform: "translateX(-50%)",
} as const;

// ---------------------------------------------------------------------------
// Variant A — Tuck. Cards peek out from behind the avatar toward centre; the
// name sits on the rail side. Winner = a solid green rim on the avatar. Barely
// larger than the avatar's own footprint.
// ---------------------------------------------------------------------------
function PodTuck({ seat, isTopRow }: { seat: DemoSeat; isTopRow: boolean }) {
  const e = edges(isTopRow);
  return (
    <>
      {seat.holeCards && (
        <div
          style={{
            position: "absolute",
            ...centreX,
            ...(isTopRow ? { top: "1.5em" } : { bottom: "1.5em" }),
            zIndex: 1,
          }}
        >
          <MiniCards cards={seat.holeCards} overlap scale="0.5em" />
        </div>
      )}
      <Avatar
        seat={seat}
        shadow={
          seat.isWinner
            ? `0 0 0 2.5px ${color.winBright}, 0 0 0 1px rgba(0,0,0,.4) inset`
            : undefined
        }
      />
      {/* Rail side: name */}
      <div
        style={{
          position: "absolute",
          ...centreX,
          ...e.outer,
          ...e.outerGap,
          textAlign: "center",
        }}
      >
        <NameChip seat={seat} bright={seat.isWinner} />
      </div>
      {/* Felt side: hand name, clear of the peeking cards */}
      {seat.handDescription && (
        <div
          style={{
            position: "absolute",
            ...centreX,
            ...(isTopRow ? { top: "4.1em" } : { bottom: "4.1em" }),
          }}
        >
          <Caption seat={seat} bright={seat.isWinner} />
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Variant C — Tab. A compact rounded callout hangs inward off the avatar's
// felt-facing edge, holding the cards inline with the hand name beside them.
// Winner tints the tab with the win plate. The box exists but only wraps the
// cards, anchored and inward — never the whole pod.
// ---------------------------------------------------------------------------
function PodTab({ seat, isTopRow }: { seat: DemoSeat; isTopRow: boolean }) {
  const e = edges(isTopRow);
  return (
    <>
      <Avatar seat={seat} />
      <div
        style={{
          position: "absolute",
          ...centreX,
          ...e.outer,
          ...e.outerGap,
        }}
      >
        <NameChip seat={seat} bright={seat.isWinner} />
      </div>
      {seat.holeCards && (
        <div
          style={{
            position: "absolute",
            ...centreX,
            ...e.inner,
            ...e.innerGap,
            display: "flex",
            alignItems: "center",
            gap: "0.4em",
            padding: "0.35em 0.5em",
            borderRadius: "0.7em",
            whiteSpace: "nowrap",
            background: seat.isWinner ? color.winPlate : color.surface,
            border: `1px solid ${
              seat.isWinner ? color.winBorder : color.border
            }`,
            boxShadow: "0 10px 22px -12px rgba(0,0,0,.85)",
          }}
        >
          <MiniCards cards={seat.holeCards} scale="0.46em" />
          {seat.handDescription && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: "0.5em",
                lineHeight: 1.2,
                maxWidth: "8em",
                whiteSpace: "normal",
                color: seat.isWinner ? color.winText : color.textDim,
              }}
            >
              {seat.handDescription}
            </span>
          )}
        </div>
      )}
    </>
  );
}

function PerSeatPod({
  seat,
  variant,
}: {
  readonly seat: DemoSeat;
  readonly variant: "A" | "C";
}) {
  const pos = posFor(seat.id, TOTAL);
  const isTopRow = pos.top < 50;
  return (
    <div
      data-testid={`proto-seat-${String(seat.id)}`}
      style={{
        position: "absolute",
        left: `${String(pos.left)}%`,
        top: `${String(pos.top)}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Only the avatar box is centred on posFor; the reveal hangs off it. */}
      <div
        style={{
          position: "relative",
          width: "3em",
          height: "3em",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {variant === "A" && <PodTuck seat={seat} isTopRow={isTopRow} />}
        {variant === "C" && <PodTab seat={seat} isTopRow={isTopRow} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overlay (E). A dimmed table behind (avatars only, at their real posFor spots)
// and a large centred panel carrying the board plus every player still in the
// hand. Winners are featured big and glow; there are no hand-rank labels — just
// name + cards.
// ---------------------------------------------------------------------------

/** A single seat reduced to its avatar, for the table behind/beside an overlay.
 *  Dimmed while the overlay covers the felt; full strength when peeking. */
function GhostAvatar({
  seat,
  dimmed,
}: {
  readonly seat: DemoSeat;
  readonly dimmed: boolean;
}) {
  const pos = posFor(seat.id, TOTAL);
  return (
    <div
      style={{
        position: "absolute",
        left: `${String(pos.left)}%`,
        top: `${String(pos.top)}%`,
        transform: "translate(-50%, -50%)",
        opacity: dimmed ? 0.4 : 1,
        transition: "opacity 0.25s ease",
      }}
    >
      <Avatar seat={seat} />
    </div>
  );
}

/** A row of face-up cards at a given em scale. */
function CardRow({
  cards,
  scale,
  gap = "0.2em",
}: {
  readonly cards: readonly CardType[];
  readonly scale: string;
  readonly gap?: string;
}) {
  return (
    <div style={{ display: "flex", gap, fontSize: scale }}>
      {cards.map((card, i) => (
        <Card key={i} rank={card.rank} suit={card.suit} />
      ))}
    </div>
  );
}

/** One player inside the overlay: cards + name + hand description. Winners
 *  glow (a gentle CSS pulse) and, when featured, render their cards larger. */
function OverlayPlayer({
  seat,
  cardScale,
  featured = false,
}: {
  readonly seat: DemoSeat;
  readonly cardScale: string;
  readonly featured?: boolean;
}) {
  if (!seat.holeCards) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "clamp(0.35rem, 1vh, 0.7rem)",
      }}
    >
      <div
        className={seat.isWinner ? "proto-win-glow" : undefined}
        style={{
          padding: featured ? "0.5rem" : "0.4rem",
          borderRadius: "0.6rem",
          border: `1px solid ${seat.isWinner ? color.winBorder : "transparent"}`,
          background: seat.isWinner ? color.winPlate : undefined,
        }}
      >
        <CardRow cards={seat.holeCards} scale={cardScale} gap="0.28em" />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.2rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "0.5em",
            fontSize: featured ? "1.3rem" : "1rem",
            fontWeight: 700,
            color: seat.isWinner ? color.winText : color.text,
          }}
        >
          {seat.name}
          {seat.isWinner && (
            <span
              style={{
                fontFamily: font.mono,
                fontSize: "0.6em",
                letterSpacing: "0.16em",
                color: color.winBright,
              }}
            >
              WINS
            </span>
          )}
        </div>
        {seat.handDescription && (
          <div
            style={{
              fontFamily: font.mono,
              fontSize: featured ? "0.85rem" : "0.72rem",
              letterSpacing: "0.02em",
              color: seat.isWinner ? color.winBright : color.textDim,
            }}
          >
            {seat.handDescription}
          </div>
        )}
      </div>
    </div>
  );
}

function BoardStrip({ board }: { readonly board: readonly CardType[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.6rem",
      }}
    >
      <span
        style={{
          fontFamily: font.mono,
          fontSize: "0.75rem",
          letterSpacing: "0.28em",
          color: color.textMuted,
        }}
      >
        BOARD
      </span>
      <CardRow cards={board} scale="min(1.5rem, 2.2vh)" gap="0.4em" />
    </div>
  );
}

function OverlayButtons({
  onNextHand,
  onViewTable,
}: {
  readonly onNextHand: () => void;
  readonly onViewTable: () => void;
}) {
  return (
    <div
      style={{
        marginTop: "0.4rem",
        display: "flex",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <button
        type="button"
        onClick={onViewTable}
        style={{
          padding: "0.7rem 2.2rem",
          borderRadius: "999px",
          border: `1px solid ${color.borderStrong}`,
          cursor: "pointer",
          background: "transparent",
          color: color.textMuted,
          fontFamily: font.display,
          fontSize: "1rem",
          fontWeight: 800,
          letterSpacing: "0.04em",
        }}
      >
        View table
      </button>
      <button
        type="button"
        onClick={onNextHand}
        style={{
          padding: "0.7rem 2.2rem",
          borderRadius: "999px",
          border: "none",
          cursor: "pointer",
          background: color.pillGradient,
          color: color.pillInk,
          fontFamily: font.display,
          fontSize: "1rem",
          fontWeight: 800,
          letterSpacing: "0.04em",
          boxShadow:
            "0 16px 40px -14px rgba(229,68,60,.6), inset 0 1px 0 rgba(255,255,255,.5)",
        }}
      >
        Next hand →
      </button>
    </div>
  );
}

/** The chip that reopens a collapsed overlay while still at showdown. */
function ShowdownChip({ onClick }: { readonly onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      style={{
        position: "absolute",
        top: "0.9em",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: "0.5em",
        padding: "0.5rem 1.1rem",
        borderRadius: "999px",
        border: `1px solid ${color.winBorder}`,
        cursor: "pointer",
        background: color.surface,
        color: color.text,
        fontFamily: font.mono,
        fontSize: "0.75rem",
        letterSpacing: "0.16em",
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          width: "0.55em",
          height: "0.55em",
          borderRadius: "50%",
          background: color.winBright,
        }}
      />
      Showdown
    </motion.button>
  );
}

// Variant E — Featured. Winner(s) blown up under the board; the rest sit in a
// wrapping row beneath a divider. The panel takes most of the screen so the
// cards can be large.
function OverlayFeatured({
  hand,
  onNextHand,
  onViewTable,
}: {
  readonly hand: Hand;
  readonly onNextHand: () => void;
  readonly onViewTable: () => void;
}) {
  const inHand = hand.seats.filter((seat) => !seat.folded);
  const winners = inHand.filter((seat) => seat.isWinner);
  const rest = inHand.filter((seat) => !seat.isWinner);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(5,4,4,.6)",
        backdropFilter: "blur(2px)",
        padding: "1.5rem",
      }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{
          width: "min(97%, 92rem)",
          maxHeight: "100%",
          overflow: "hidden",
          padding: "clamp(1rem, 2.4vh, 1.8rem)",
          borderRadius: "1.2rem",
          background: color.surfaceGradient,
          border: `1px solid ${color.borderStrong}`,
          boxShadow: "0 44px 90px -30px rgba(0,0,0,.95)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "clamp(0.6rem, 1.6vh, 1.4rem)",
        }}
      >
        <span
          style={{
            fontFamily: font.display,
            fontSize: "clamp(1rem, 2.2vh, 1.3rem)",
            fontWeight: 800,
            letterSpacing: "0.06em",
            color: color.text,
          }}
        >
          Showdown
        </span>

        <BoardStrip board={hand.board} />

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "clamp(1rem, 3vw, 2.4rem)",
          }}
        >
          {winners.map((seat) => (
            <OverlayPlayer
              key={seat.id}
              seat={seat}
              cardScale="min(2.1rem, 3vh)"
              featured
            />
          ))}
        </div>

        <div style={{ width: "100%", height: 1, background: color.border }} />

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "clamp(0.8rem, 2vw, 1.8rem)",
          }}
        >
          {rest.map((seat) => (
            <OverlayPlayer
              key={seat.id}
              seat={seat}
              cardScale="min(1.2rem, 1.8vh)"
            />
          ))}
        </div>

        <OverlayButtons onNextHand={onNextHand} onViewTable={onViewTable} />
      </motion.div>
    </motion.div>
  );
}

function DealingPill() {
  return (
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
      <div
        style={{
          padding: "0.7rem 1.6rem",
          borderRadius: "999px",
          background: color.surface,
          border: `1px solid ${color.border}`,
          fontFamily: font.mono,
          fontSize: "0.85rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: color.textMuted,
        }}
      >
        Dealing next hand…
      </div>
    </div>
  );
}

const DEAL_DELAY_MS = 1200;

export function ShowdownRevealPrototype() {
  const [variant, setVariant] = useState<VariantKey>(initialVariant);
  const [hand, setHand] = useState<Hand>(OPENING_HAND);
  const [dealing, setDealing] = useState(false);
  // "View table" collapses the overlay without leaving showdown, so the felt
  // and its controls are reachable; the Showdown chip reopens it. Reset every
  // new deal so each hand opens fresh.
  const [dismissed, setDismissed] = useState(false);
  const dealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDealTimer = () => {
    if (dealTimer.current) {
      clearTimeout(dealTimer.current);
      dealTimer.current = null;
    }
  };

  useEffect(() => clearDealTimer, []);

  const choose = (key: string) => {
    const next: VariantKey = isVariant(key) ? key : "A";
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
    // Reset to the curated opening hand so A/C always show their captions.
    clearDealTimer();
    setDealing(false);
    setDismissed(false);
    setHand(OPENING_HAND);
    setVariant(next);
  };

  // "Next hand": close the overlay, play a beat, then deal a fresh showdown.
  const nextHand = () => {
    clearDealTimer();
    setDealing(true);
    setDismissed(false);
    dealTimer.current = setTimeout(() => {
      setHand(dealHand());
      setDealing(false);
      dealTimer.current = null;
    }, DEAL_DELAY_MS);
  };

  const isOverlay = variant === "E";
  const overlayCoveringFelt = isOverlay && (dealing || !dismissed);

  return (
    <div className="showdown-proto-shell">
      <header className="showdown-proto-header">
        <b>ISSUE — showdown reveal</b>
        <span>
          {isOverlay
            ? "overlay · board + every player · winner featured · Next hand"
            : "avatar pinned · cards grow inward · no full-pod box"}
        </span>
        <em>throwaway prototype · ← / → to switch</em>
      </header>
      <div className="showdown-proto-stage">
        <div className="showdown-proto-rail" />
        {isOverlay
          ? hand.seats.map((seat) => (
              <GhostAvatar
                key={seat.id}
                seat={seat}
                dimmed={overlayCoveringFelt}
              />
            ))
          : hand.seats.map((seat) => (
              <PerSeatPod
                key={seat.id}
                seat={seat}
                variant={variant === "C" ? "C" : "A"}
              />
            ))}
        {isOverlay && dealing && <DealingPill />}
        <AnimatePresence>
          {isOverlay && !dealing && !dismissed && (
            <OverlayFeatured
              key="overlay"
              hand={hand}
              onNextHand={nextHand}
              onViewTable={() => {
                setDismissed(true);
              }}
            />
          )}
          {isOverlay && !dealing && dismissed && (
            <ShowdownChip
              key="chip"
              onClick={() => {
                setDismissed(false);
              }}
            />
          )}
        </AnimatePresence>
      </div>
      <PrototypeSwitcher
        variants={VARIANTS}
        current={variant}
        onChange={choose}
      />
    </div>
  );
}
