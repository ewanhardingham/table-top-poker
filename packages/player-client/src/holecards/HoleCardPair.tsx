import type { Card as CardType, Rank, Suit } from "@table-top-poker/protocol";
import { color, radius } from "@table-top-poker/ui-shared";
import { motion } from "motion/react";
import { BendableCard } from "./BendableCard.js";
import type { Presentation } from "./cardState.js";
import { DEAL_IN_MS } from "./constants.js";
import type { CardActions } from "./ports.js";
import { useHoleCards } from "./useHoleCards.js";

export interface HoleCardPairProps {
  /** `null` ⇒ `Absent`: not dealt in, folded, or mucked. */
  readonly cards: readonly [CardType, CardType] | null;
  /** Showdown: revealed and inert. */
  readonly locked: boolean;
  readonly actions: CardActions;
}

const rankWords: Record<Rank, string> = {
  "2": "Two",
  "3": "Three",
  "4": "Four",
  "5": "Five",
  "6": "Six",
  "7": "Seven",
  "8": "Eight",
  "9": "Nine",
  "10": "Ten",
  J: "Jack",
  Q: "Queen",
  K: "King",
  A: "Ace",
};

const suitWords: Record<Suit, string> = {
  clubs: "clubs",
  diamonds: "diamonds",
  hearts: "hearts",
  spades: "spades",
};

function cardWords(card: CardType): string {
  return `${rankWords[card.rank]} of ${suitWords[card.suit]}`;
}

/** A pair's identity as a value — a hand's cards, never their position. */
function cardKey(cards: readonly [CardType, CardType]): string {
  return cards.map((card) => `${card.rank}${card.suit}`).join("-");
}

/**
 * The accessible name carries the state and the outcome of activating, and —
 * once revealed — the cards themselves, since a screen-reader user reads them
 * here rather than off the card faces.
 */
function accessibleName(
  cards: readonly [CardType, CardType],
  presentation: Presentation,
  locked: boolean,
): string {
  const faces = `${cardWords(cards[0])} and ${cardWords(cards[1])}`;
  if (locked) return `Your hole cards, ${faces}`;
  if (presentation === "Revealed" || presentation === "Turning") {
    return `Your hole cards, ${faces}. Activate to hide them.`;
  }
  return "Your hole cards, face down. Activate to reveal them.";
}

/**
 * The `Absent` presentation: a seat holding no cards — not dealt in, folded,
 * or mucked. Two empty slots, so the surface never implies the player is
 * holding something. The surrounding copy belongs to `Hand`, which owns every
 * caption on this screen.
 */
function Absent() {
  return (
    <div
      data-testid="no-hole-cards"
      style={{ display: "flex", gap: "0.9em", fontSize: "2.6em" }}
    >
      {[-5, 5].map((tilt) => (
        <span
          key={tilt}
          style={{
            width: "3.5em",
            height: "5em",
            display: "block",
            borderRadius: radius.card,
            border: `1px dashed ${color.border}`,
            background: "rgba(255,255,255,.03)",
            transform: `rotate(${String(tilt)}deg)`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * The player's own hole cards as an object they handle, not a picture they
 * read (Phase 3 spec #138). Cards arrive **face-down** and stay that way until
 * the player asks for them; nothing here touches the server, changes poker
 * visibility, or affects showdown.
 *
 * This is one of the module's two public names. Everything it is built from —
 * the reducer, the hook, the bendable card — is module-internal, so nothing
 * outside can reach a lifecycle state and no consumer learns what a pointer is.
 *
 * The pair is a real focusable `button`: Enter, Space or a click toggles
 * reveal and conceal, so reading your own cards never depends on getting a
 * gesture's timing right (§12). The pointer recognizer layered on top of this
 * — bend to peek, swipe to fold, double-tap to check — arrives in later
 * tickets; this establishes the seam it grows inside.
 */
export function HoleCardPair(props: HoleCardPairProps) {
  const { cards } = props;
  const { state, activate } = useHoleCards(props);
  // The lifecycle's lock, not the prop: the prop is the *input* the adapter
  // turns into `SHOWDOWN_REVEAL`, and once locked the pair stays locked until
  // the next hand deals it back in. Rendering off the prop would let the two
  // disagree about whether the button does anything.
  const { locked } = state;

  if (cards === null) return <Absent />;

  // A render can land between cards arriving and the deal being observed;
  // face-down is the entry state for every hand, so it is also the honest
  // presentation for that gap.
  const presentation =
    state.presentation === "Absent" ? "FaceDown" : state.presentation;

  return (
    <button
      type="button"
      data-testid="hole-cards"
      data-presentation={presentation}
      // A locked pair is inert but stays in the tab order and keeps its
      // accessible name: at showdown that name is where a screen-reader user
      // reads their own hand, and `disabled` would take it away.
      onClick={locked ? undefined : activate}
      aria-disabled={locked}
      aria-label={accessibleName(cards, presentation, locked)}
      style={{
        display: "flex",
        padding: 0,
        border: "none",
        background: "none",
        color: "inherit",
        cursor: locked ? "default" : "pointer",
        // Handling cards must not raise the OS text-selection or callout menu
        // over them (§16).
        userSelect: "none",
        WebkitTouchCallout: "none",
        touchAction: "manipulation",
      }}
    >
      <motion.span
        // Keyed on card identity so a new hand replays the deal-in: the cards
        // arrive face-down (§17), replacing `Hand`'s per-card face-up deal
        // animation. The key is on the motion element, not the component, so
        // it restarts an animation without discarding lifecycle state —
        // `DEALT` stays the one thing that resets presentation.
        key={cardKey(cards)}
        initial={{ opacity: 0, y: "-18%" }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DEAL_IN_MS / 1000, ease: [0.2, 0.8, 0.2, 1] }}
        style={{ display: "flex", gap: "0.5em", fontSize: "2.6em" }}
      >
        {cards.map((card, index) => (
          <BendableCard
            key={index}
            card={card}
            tiltDegrees={index === 0 ? -3 : 3}
            presentation={presentation}
          />
        ))}
      </motion.span>
    </button>
  );
}
