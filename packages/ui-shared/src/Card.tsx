import type { Rank, Suit } from "@table-top-poker/protocol";
import type { CSSProperties } from "react";
import { color, font, shadow } from "./theme.js";

export type CardProps =
  | { readonly faceDown: true }
  | { readonly faceDown?: false; readonly rank: Rank; readonly suit: Suit };

/**
 * Exported so consumers that draw their own card-shaped surfaces — a curling
 * corner, a chip label — spell a suit the same way this component does, rather
 * than keeping a second copy of the mapping that can drift from it.
 */
export const suitSymbols: Record<Suit, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

const redSuits: ReadonlySet<Suit> = new Set(["diamonds", "hearts"]);

/** Which of the two ink colours a suit is printed in. */
export function isRedSuit(suit: Suit): boolean {
  return redSuits.has(suit);
}

const baseStyle: CSSProperties = {
  width: "3.5em",
  height: "5em",
  // Self-relative, not `radius.card` (a fixed px token): consumers shrink
  // this component's whole box by wrapping it in a smaller font-size
  // context (seat-pod and multi-way showdown reveals go well under 1em),
  // and a fixed px radius doesn't shrink with them — past a certain point
  // it swallows the rank/suit entirely. `em` here resolves against this
  // card's own font-size, the same one `width`/`height` scale from, so
  // the corner stays the same small, rectangular-not-round proportion of
  // the card (~6% of its width) at every size.
  borderRadius: "0.2em",
  boxSizing: "border-box",
  fontFamily: font.body,
  userSelect: "none",
};

/**
 * Renders a card as DOM elements, branching on `faceDown` rather than
 * swapping an `<img>` src — required so Phase 3's flip animation can
 * cross-fade between the two branches instead of a network image swap.
 *
 * Face styling matches the prototype's hole card (the larger of its two
 * card treatments); the board card differs slightly (radius, border,
 * shadow) but the two aren't different enough to justify a second component.
 */
export function Card(props: CardProps) {
  if (props.faceDown) {
    return (
      <div
        className="card card-back"
        data-face-down="true"
        style={{ ...baseStyle, background: color.cardBack }}
      />
    );
  }

  const { rank, suit } = props;
  return (
    <div
      className="card card-face"
      data-face-down="false"
      data-rank={rank}
      data-suit={suit}
      style={{
        ...baseStyle,
        position: "relative",
        background: color.cardFace,
        border: `1px solid ${color.cardBorder}`,
        boxShadow: shadow.card,
        color: isRedSuit(suit) ? color.suitRed : color.suitBlack,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Index rank={rank} suit={suit} />
      <span
        className="card-suit"
        style={{ fontSize: "1.9em", lineHeight: 1, opacity: 0.86 }}
      >
        {suitSymbols[suit]}
      </span>
      {/* Rotated a half-turn in the opposite corner, as a real card is
       * printed — so the card reads the same way up whichever end you are
       * looking at, and lifting either corner uncovers a legible index. */}
      <Index rank={rank} suit={suit} mirrored />
    </div>
  );
}

/**
 * The shared look of a corner index, exported so that a consumer drawing an
 * index of its own — the player client's curling corner draws one where the
 * fold uncovers it — matches this one instead of guessing at it.
 *
 * Sized against the card, never in px, so it holds at every scale the card is
 * used at — seat pods and multi-way reveals shrink the whole box well under
 * `1em`. The prototype's ratio is `0.51em` (24px on its 164px card), which
 * read as too small on a real screen; this sits between that and the `1.1em`
 * it replaced.
 *
 * There is an upper bound worth knowing about: much past `1.1em` the index
 * stops being a corner mark and reaches into the middle of the card, far
 * enough that the player client's fold drags it onto the lifted flap.
 */
export const cardIndexStyle: CSSProperties = {
  position: "absolute",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  fontWeight: 700,
  fontSize: "0.8em",
  lineHeight: 0.78,
};

/** The suit symbol sitting under the rank, sized against the index. */
export const cardIndexSuitStyle: CSSProperties = {
  marginTop: "0.2em",
  fontSize: "0.75em",
  fontWeight: 400,
};

/**
 * The corner index: rank above its suit. Printed twice per face, the second
 * copy rotated, which is what lets a card be read from a lifted corner rather
 * than only from a fully exposed face.
 */
function Index({
  rank,
  suit,
  mirrored = false,
}: {
  readonly rank: Rank;
  readonly suit: Suit;
  readonly mirrored?: boolean;
}) {
  return (
    <span
      className={mirrored ? "card-index card-index-mirrored" : "card-index"}
      style={{
        ...cardIndexStyle,
        ...(mirrored
          ? { right: "0.235em", bottom: "0.21em", transform: "rotate(180deg)" }
          : { left: "0.235em", top: "0.21em" }),
      }}
    >
      {rank}
      <span style={cardIndexSuitStyle}>{suitSymbols[suit]}</span>
    </span>
  );
}
