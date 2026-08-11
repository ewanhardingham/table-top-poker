import type { Card as CardType, Rank, Suit } from "@table-top-poker/protocol";
import { color, fontSize, radius } from "@table-top-poker/ui-shared";
import { motion, useTransform, type MotionValue } from "motion/react";
import type { CSSProperties } from "react";
import { BendableCard } from "./BendableCard.js";
import type { Presentation } from "./cardState.js";
import { CheckStamp } from "./CheckStamp.js";
import {
  selectHint,
  type Hint,
  type HintContext,
  type TeachableGesture,
} from "./coaching.js";
import { DEAL_IN_MS } from "./constants.js";
import type { BendAxis } from "./geometry.js";
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
  // Inert, and there is no undo once the Fold is sent — so the name says what
  // is happening and offers nothing to activate.
  if (presentation === "Leaving") return "Your hole cards, folding";
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
 * The pair is a real focusable `button`: Enter and Space toggle reveal and
 * conceal, so reading your own cards never depends on getting a gesture's
 * timing right (§12). A pointer, by contrast, is answered by the recognizer —
 * bend to peek, tap to conceal, double-tap to Check, and swipe up to Fold.
 */
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
  } = useHoleCards(props);
  // The lifecycle's lock, not the prop: the prop is the *input* the adapter
  // turns into `SHOWDOWN_REVEAL`, and once locked the pair stays locked until
  // the next hand deals it back in. Rendering off the prop would let the two
  // disagree about whether the button does anything — and the gesture
  // recognizer gates on the same field, so pointer and keyboard cannot part
  // company either.
  const { locked } = state;

  // A committed pair outlives the prop that carried it, for exactly as long as
  // its flight to the muck runs: the server usually takes the cards away tens
  // of milliseconds in, and the departure the player was promised must not be a
  // blink (§7, story 20).
  const shown = cards ?? departing;
  if (shown === null) return <Absent />;

  // A render can land between cards arriving and the deal being observed;
  // face-down is the entry state for every hand, so it is also the honest
  // presentation for that gap. A pair still in the air is the mirror case: the
  // lifecycle has resolved past it, and the flight is what is on screen.
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
    // The quiet interval only gates the teaching hints, which arrive with the
    // discovery set they retire against (#147). In-gesture prompts never wait.
    quiet: false,
    checkConfirmed,
  };
  // Both variants of the live hint, because the axis they swap on is a
  // **continuous** value: choosing between them in React would re-render the
  // pair every time a bend wandered across the diagonal (§13).
  const hintDragLeft = selectHint(
    { ...state, presentation, bendAxis: "left" },
    nothingDiscovered,
    hintContext,
  );
  const hintDragUp = selectHint(
    { ...state, presentation, bendAxis: "up" },
    nothingDiscovered,
    hintContext,
  );
  // An announced hint is news, and news does not depend on which way a finger
  // is going: the selector returns the same hint on both axes for it.
  const announced = hintDragLeft?.announce === true ? hintDragLeft : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.55em",
      }}
    >
      {/* The positioning parent for the Check stamp, which is painted over the
       * pair rather than laid out beside it. */}
      <div style={{ position: "relative", display: "flex" }}>
        <button
          type="button"
          data-testid="hole-cards"
          data-presentation={presentation}
          // A locked pair is inert but stays in the tab order and keeps its
          // accessible name: at showdown that name is where a screen-reader user
          // reads their own hand, and `disabled` would take it away.
          onClick={locked ? undefined : activate}
          // Long-press must not raise the OS callout menu over the cards (§16).
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
            // Handling cards must not raise the OS text-selection or callout
            // menu over them, and the browser must not claim the vertical drag
            // as a pan or the second tap as a zoom (§16). The app shell is fixed
            // and non-scrolling, so nothing is lost by taking the whole gesture.
            userSelect: "none",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            touchAction: "none",
            // Android Chrome paints a blue box over any tappable element while
            // it is pressed, and a long-press holds that state long enough to
            // read as a highlight sitting on the cards (#195). The cards do
            // their own press feedback (the bend, the flip); this OS wash on top
            // is noise, so it is turned off.
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <motion.span
            // Keyed on card identity so a new hand replays the deal-in: the cards
            // arrive face-down (§17), replacing `Hand`'s per-card face-up deal
            // animation. The key is on the motion element, not the component, so
            // it restarts an animation without discarding lifecycle state —
            // `DEALT` stays the one thing that resets presentation.
            key={cardKey(shown)}
            initial={{ opacity: 0, y: "-18%" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: DEAL_IN_MS / 1000,
              ease: [0.2, 0.8, 0.2, 1],
            }}
            style={{ display: "flex", fontSize: "2.6em" }}
          >
            {/* A layer of its own, so the fold drag and the muck flight can drive
             * `y` and `opacity` from `MotionValue`s while the deal-in above keeps
             * animating the same two properties declaratively. The two would
             * fight on one element; nested, they simply compose. */}
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
      {/* One value decides where the Check confirmation is painted, so the
       * stamp and the hint below can never both claim it — or both drop it.
       * The selector still returns the confirmation as a hint, because that is
       * what `Announcer` speaks; only its sighted copy moves onto the cards. */}
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

/**
 * The live region the announced hints speak through — mounted for the pair's
 * lifetime and empty until there is news.
 *
 * It cannot be the visible hint's own element: a live region inserted into the
 * document *together with* its text is not reliably announced, because there
 * was no region there to observe the change. The region has to already exist
 * when the text arrives, which means it outlives every hint that passes
 * through it. The visible copy is hidden from assistive technology, so the
 * news is read once rather than twice.
 */
function Announcer({ hint }: { readonly hint: Hint | null }) {
  return (
    <span role="status" style={visuallyHidden}>
      {hint === null
        ? ""
        : [hint.line1, hint.line2].filter((line) => line !== null).join(", ")}
    </span>
  );
}

/** Present to a screen reader, absent to everything else. */
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

const nothingDiscovered: ReadonlySet<TeachableGesture> = new Set();

function preventDefault(event: { preventDefault: () => void }) {
  event.preventDefault();
}

/**
 * The one hint the selector chose, if any. The pair renders it itself: the
 * selector is module-internal because every in-gesture hint depends on
 * recognizer state nothing outside the module may see (§11).
 *
 * Where the two variants differ, both are in the document at once and the axis
 * `MotionValue` decides which is visible — so a bend that wanders across the
 * diagonal swaps the advice without re-rendering anything. That pair is hidden
 * from assistive technology, because two contradictory instructions are both
 * present and only the sighted player can see which one applies; the pair's own
 * `aria-label` is the non-visual path, and every Action keeps its button.
 */
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

  // One hint, not two: the axis is only a distinction while a bend is live.
  if (dragLeft.id === dragUp.id) return <HintBlock hint={dragLeft} />;

  return (
    <span
      aria-hidden="true"
      // Stacked in one grid cell so the swap costs no layout. Each variant
      // carries both its own lines, so neither depends on the other's copy.
      style={{ display: "grid" }}
    >
      <motion.span style={{ gridArea: "1 / 1", opacity: leftOpacity }}>
        <HintBlock hint={dragLeft} />
      </motion.span>
      <motion.span style={{ gridArea: "1 / 1", opacity: upOpacity }}>
        <HintBlock hint={dragUp} />
      </motion.span>
    </span>
  );
}

function HintBlock({ hint }: { readonly hint: Hint }) {
  return (
    <p
      data-testid="hole-cards-hint"
      data-hint={hint.id}
      // Everything that reaches here is advice about a gesture in progress,
      // never news: the one announced hint is the Check confirmation, and that
      // one is painted as a stamp over the cards instead of passing through
      // this block. So there is nothing here for `Announcer` to double up on.
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
