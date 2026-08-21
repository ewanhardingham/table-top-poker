import type { Card as CardType, Rank, Suit } from "@table-top-poker/protocol";
import { color, fontSize, radius } from "@table-top-poker/ui-shared";
import { motion, useTransform, type MotionValue } from "motion/react";
import type { CSSProperties } from "react";
import { BendableCard } from "./BendableCard.js";
import type { Presentation } from "./cardState.js";
import { CheckStamp } from "./CheckStamp.js";
import { selectHint, type Hint, type HintContext } from "./coaching.js";
import { DEAL_IN_MS } from "./constants.js";
import type { BendAxis } from "./geometry.js";
import type { CardActions } from "./ports.js";
import { useHoleCards } from "./useHoleCards.js";

export interface HoleCardPairProps {
  readonly cards: readonly [CardType, CardType] | null;
  readonly locked: boolean;
  /** All-in: inert, but still face-down until the table's Reveal. */
  readonly sealed: boolean;
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

const HOLE_CARD_UNIT = "var(--hole-card-unit, 2.6em)";

function cardWords(card: CardType): string {
  return `${rankWords[card.rank]} of ${suitWords[card.suit]}`;
}

function cardKey(cards: readonly [CardType, CardType]): string {
  return cards.map((card) => `${card.rank}${card.suit}`).join("-");
}

function accessibleName(
  cards: readonly [CardType, CardType],
  presentation: Presentation,
  locked: boolean,
): string {
  const faces = `${cardWords(cards[0])} and ${cardWords(cards[1])}`;
  if (presentation === "Leaving") return "Your hole cards, folding";
  if (locked) return `Your hole cards, ${faces}`;
  if (presentation === "Revealed" || presentation === "Turning") {
    return `Your hole cards, ${faces}. Activate to hide them.`;
  }
  return "Your hole cards, face down. Activate to reveal them.";
}

function Absent() {
  return (
    <div
      data-testid="no-hole-cards"
      style={{ display: "flex", gap: "0.9em", fontSize: HOLE_CARD_UNIT }}
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

export function HoleCardPair(props: HoleCardPairProps) {
  const { cards, actions } = props;
  const {
    state,
    activate,
    handlers,
    bend,
    bendAxis,
    foldOffset,
    foldFade,
    leavingFaceUp,
    departing,
    checkConfirmed,
    quiet,
    coarsePointer,
    discovered,
  } = useHoleCards(props);
  const { locked } = state;

  const shown = cards ?? departing;
  if (shown === null) return <Absent />;

  const presentation =
    cards === null
      ? "Leaving"
      : state.presentation === "Absent"
        ? "FaceDown"
        : state.presentation;

  const hintContext: HintContext = {
    checkLegal: actions.checkLegal,
    foldLegal: actions.foldLegal,
    pending: actions.pending,
    locked,
    coarsePointer,
    quiet,
    checkConfirmed,
  };
  const hintDragLeft = selectHint(
    { ...state, presentation, bendAxis: "left" },
    discovered,
    hintContext,
  );
  const hintDragUp = selectHint(
    { ...state, presentation, bendAxis: "up" },
    discovered,
    hintContext,
  );
  const announced = hintDragLeft?.announce === true ? hintDragLeft : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flex: 1,
        minHeight: 0,
        gap: "1.1em",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          margin: "auto 0",
        }}
      >
        <button
          type="button"
          data-testid="hole-cards"
          data-presentation={presentation}
          onClick={locked ? undefined : activate}
          onContextMenu={preventDefault}
          {...(locked ? {} : handlers)}
          aria-disabled={locked}
          aria-label={accessibleName(shown, presentation, locked)}
          style={{
            display: "flex",
            padding: 0,
            border: "none",
            background: "none",
            color: "inherit",
            cursor: locked ? "default" : "pointer",
            userSelect: "none",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            touchAction: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <motion.span
            key={cardKey(shown)}
            initial={{ opacity: 0, y: "-18%" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: DEAL_IN_MS / 1000,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            style={{ display: "flex", fontSize: HOLE_CARD_UNIT }}
          >
            <motion.span
              style={{
                display: "flex",
                gap: "0.5em",
                y: foldOffset,
                opacity: foldFade,
              }}
            >
              {shown.map((card, index) => (
                <BendableCard
                  key={index}
                  card={card}
                  tiltDegrees={index === 0 ? -3 : 3}
                  presentation={presentation}
                  bend={bend}
                  leavingFaceUp={leavingFaceUp}
                />
              ))}
            </motion.span>
          </motion.span>
        </button>
        {checkConfirmed && <CheckStamp />}
      </div>
      {!checkConfirmed && (
        <GestureHint
          dragLeft={hintDragLeft}
          dragUp={hintDragUp}
          axis={bendAxis}
        />
      )}
      <Announcer hint={announced} />
    </div>
  );
}

function Announcer({ hint }: { readonly hint: Hint | null }) {
  return (
    <span role="status" style={visuallyHidden}>
      {hint === null
        ? ""
        : [hint.line1, hint.line2].filter((line) => line !== null).join(", ")}
    </span>
  );
}

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
};

function preventDefault(event: { preventDefault: () => void }) {
  event.preventDefault();
}

function GestureHint({
  dragLeft,
  dragUp,
  axis,
}: {
  readonly dragLeft: Hint | null;
  readonly dragUp: Hint | null;
  readonly axis: MotionValue<BendAxis>;
}) {
  const leftOpacity = useTransform(axis, (value) => (value === "left" ? 1 : 0));
  const upOpacity = useTransform(axis, (value) => (value === "up" ? 1 : 0));

  if (dragLeft === null || dragUp === null) return null;

  if (dragLeft.id === dragUp.id) return <HintBlock hint={dragLeft} />;

  return (
    <span aria-hidden="true" style={{ display: "grid" }}>
      <motion.span style={{ gridArea: "1 / 1", opacity: leftOpacity }}>
        <HintBlock hint={dragLeft} />
      </motion.span>
      <motion.span style={{ gridArea: "1 / 1", opacity: upOpacity }}>
        <HintBlock hint={dragUp} />
      </motion.span>
    </span>
  );
}

export function HintBlock({ hint }: { readonly hint: Hint }) {
  return (
    <p
      data-testid="hole-cards-hint"
      data-hint={hint.id}
      style={{
        margin: 0,
        display: "grid",
        justifyItems: "center",
        gap: "0.15em",
        fontSize: fontSize.caption,
        lineHeight: 1.25,
        color: color.textMuted,
      }}
    >
      <span style={{ color: color.text }}>{hint.line1}</span>
      {hint.line2 !== null && <span>{hint.line2}</span>}
    </p>
  );
}
