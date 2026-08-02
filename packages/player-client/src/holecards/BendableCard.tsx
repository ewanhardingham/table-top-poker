import type { Card as CardType } from "@table-top-poker/protocol";
import {
  Card,
  cardIndexStyle,
  cardIndexSuitStyle,
  color,
  isRedSuit,
  suitSymbols,
} from "@table-top-poker/ui-shared";
import { type MotionValue } from "motion/react";
import { useEffect, useRef, type CSSProperties } from "react";
import {
  PeelBack,
  PeelBottom,
  PeelTop,
  PeelWrapper,
  type PeelRef,
} from "react-peel";
import type { Presentation } from "./cardState.js";
import { BEND_CORNER, REVEAL_THRESHOLD } from "./constants.js";

/**
 * The player-side wrapper around the shared `Card` (Phase 3 spec #138 §14).
 * Bend and turn live here, in the player client, so `ui-shared` gains no
 * gesture concepts — including the one piece of ink that exists purely because
 * of the curl, which is a player-client component rather than a `Card` prop.
 *
 * The bend is a real corner curl, not a wipe: `react-peel` lifts the
 * bottom-right corner as a sheet, and what you read is the card's **own face
 * on the underside of that sheet** — which is what makes it feel like lifting
 * a physical card rather than watching one dissolve. `PeelTop` is the flat
 * remainder of the back, `PeelBack` is the lifted flap, and `PeelBottom` is
 * the table showing through where the corner used to be. Which *part* of that
 * flap is visible is not the part you would guess — see `CurlIndex`.
 *
 * Crossing the threshold does not start a *different* animation: the same
 * sheet is carried on past the opposite corner until the card has turned all
 * the way over. That is why the peel is mounted for `Turning` as well as
 * `Peeking`, and why a keyboard reveal — which starts at 0 — produces exactly
 * the same motion as a bend that committed.
 *
 * The peel is driven entirely by a `MotionValue` (§13). This component
 * re-renders when the *presentation* changes and never while a finger moves.
 */
export function BendableCard({
  card,
  presentation,
  bend,
  tiltDegrees,
  leavingFaceUp,
}: {
  readonly card: CardType;
  readonly presentation: Presentation;
  /** Peel progress, 0 → 1, shared by both cards so the pair opens together. */
  readonly bend: MotionValue<number>;
  /** The card's resting angle in the overlapped pair. */
  readonly tiltDegrees: number;
  /**
   * Whether the pair was face-up when the Fold committed. The cards leave with
   * whatever face they had (§7): flipping face-down inside a 280ms departure
   * is illegible motion, and the privacy boundary is the physical table rather
   * than the flight.
   */
  readonly leavingFaceUp: boolean;
}) {
  const peeking = presentation === "Peeking";
  const turning = presentation === "Turning";
  const revealed =
    presentation === "Revealed" ||
    (presentation === "Leaving" && leavingFaceUp);
  // The face is in the document only while it is being looked at. A face-down
  // pair carries no rank or suit at all, and closing a peek removes it again
  // instantly, as concealment does: a glance must leave nothing exposed.
  const curling = peeking || turning;

  return (
    <div
      data-testid="hole-card"
      data-revealed={String(revealed)}
      style={{
        position: "relative",
        width: "3.5em",
        height: "5em",
        transform: `rotate(${String(tiltDegrees)}deg)`,
      }}
    >
      {revealed ? (
        <Card rank={card.rank} suit={card.suit} />
      ) : curling ? (
        <CurlingCard card={card} bend={bend} />
      ) : (
        <Card faceDown />
      )}
      {(presentation === "FaceDown" || peeking) && <BendZone />}
    </div>
  );
}

/**
 * The lifted sheet. `react-peel` measures its own box and takes peel positions
 * in that box's pixel coordinates, so the travel is derived from the measured
 * card rather than from a constant — the pair is sized in `em` and inherits
 * whatever font-size the surface gives it.
 */
function CurlingCard({
  card,
  bend,
}: {
  readonly card: CardType;
  readonly bend: MotionValue<number>;
}) {
  const peel = useRef<PeelRef>(null);

  useEffect(() => {
    const place = (progress: number) => {
      const current = peel.current;
      if (current === null) return;
      const { width, height } = current;

      if (progress <= REVEAL_THRESHOLD) {
        // The gentle diagonal curl the prototype settled on: the corner
        // travels in towards the middle of the card as the bend deepens.
        const travel = (progress / REVEAL_THRESHOLD) * CURL_TRAVEL;
        current.setPeelPosition(
          width - width * travel,
          height - height * travel,
        );
        return;
      }

      // Committed: carry the same sheet on past the opposite corner so it
      // completes the turn, rather than cutting to a separate flip.
      const finish = (progress - REVEAL_THRESHOLD) / (1 - REVEAL_THRESHOLD);
      const fromX = width - width * CURL_TRAVEL;
      const fromY = height - height * CURL_TRAVEL;
      current.setPeelPosition(
        fromX + (-width - fromX) * finish,
        fromY + (-height - fromY) * finish,
      );
    };

    place(bend.get());
    return bend.on("change", place);
  }, [bend]);

  return (
    <PeelWrapper
      ref={peel}
      width="100%"
      height="100%"
      corner="BOTTOM_RIGHT"
      options={{
        topShadowBlur: 3,
        topShadowAlpha: 0.32,
        backShadowAlpha: 0.18,
        bottomShadowDarkAlpha: 0.38,
        backReflection: true,
      }}
    >
      <PeelTop>
        <Card faceDown />
      </PeelTop>
      {/* Positioned, so the remapped index below anchors to the lifted sheet
       * and travels with it rather than to the card's resting box. */}
      <PeelBack style={{ position: "relative", width: "100%", height: "100%" }}>
        <Card rank={card.rank} suit={card.suit} />
        <CurlIndex rank={card.rank} suit={card.suit} />
      </PeelBack>
      <PeelBottom />
    </PeelWrapper>
  );
}

/**
 * The rank and suit as they appear *on the curl*.
 *
 * `react-peel` pins the back layer by `flipPointHorizontally(corner)`, so for a
 * bottom-right peel it is the back's **bottom-left** corner that is pinned to
 * the fingertip and the bottom-left region that the lifted flap uncovers. The
 * face's own bottom-right index therefore falls outside the visible curl
 * entirely — which is why a bend showed bare white card. This is that index
 * remapped to where the geometry actually puts it, exactly as the prototype
 * resolved the same problem.
 *
 * The face's *own* corner indices are suppressed on this copy — see
 * `.peel-back .card-index` in `app-shell.css`. They are printed for a flat
 * card and land arbitrarily once the sheet is rotated about the fold, so
 * leaving them on showed the rank twice: once here, upright at the lifted
 * tip, and once more sideways-on wherever the rotation happened to put it.
 *
 * Presentational only, and a duplicate of ink the face already carries, so it
 * is hidden from assistive technology: the accessible reveal is `Revealed`,
 * announced by the pair, not this.
 */
function CurlIndex({
  rank,
  suit,
}: {
  readonly rank: CardType["rank"];
  readonly suit: CardType["suit"];
}) {
  return (
    <span
      className="hole-card-curl-index"
      aria-hidden="true"
      style={{
        ...cardIndexStyle,
        left: "0.235em",
        bottom: "0.21em",
        // A half-turn, so the index reads upright once the flap's own rotation
        // is applied on top of it.
        transform: "rotate(180deg)",
        color: isRedSuit(suit) ? color.suitRed : color.suitBlack,
      }}
    >
      {rank}
      {/* Larger than the face's own suit, which is the one place this index
       * deliberately departs from `cardIndexSuitStyle`. The markup is
       * otherwise identical, so this is not correcting a size difference but
       * a legibility one: on the flap the symbol is rotated and sits under
       * the peel's shadow and reflection wash, and at the face's size it
       * reads lighter and smaller than the same symbol lying flat. */}
      <span style={{ ...cardIndexSuitStyle, fontSize: "0.9em" }}>
        {suitSymbols[suit]}
      </span>
    </span>
  );
}

/**
 * How far the corner travels, as a fraction of the card, by the moment the
 * bend commits. Short of the full diagonal on purpose: the corner is still a
 * lifted corner at the threshold, not a card folded in half.
 */
const CURL_TRAVEL = 0.86;

/**
 * The two sides the affordance is pinned to, from the one constant the coaching
 * copy also names its corner from — so the zone and the words that describe it
 * cannot drift apart.
 */
function cornerOffsets(inset: string | number): CSSProperties {
  return { [BEND_CORNER.vertical]: inset, [BEND_CORNER.horizontal]: inset };
}

/**
 * The affordance the whole gesture hangs off: a corner that looks liftable.
 * `data-bend-zone` is what the recognizer hit-tests against, so the classifier
 * never needs to know where the corner is drawn — and the coaching copy can
 * follow the rendered zone rather than hard-coding "bottom-right".
 */
function BendZone() {
  return (
    <span
      data-bend-zone="true"
      aria-hidden="true"
      style={{
        position: "absolute",
        ...cornerOffsets(0),
        width: "1.5em",
        height: "1.5em",
        borderBottomRightRadius: "0.2em",
      }}
    >
      <span
        style={{
          position: "absolute",
          ...cornerOffsets("0.18em"),
          width: "0.5em",
          height: "0.5em",
          borderRight: "2px solid rgba(255,236,226,.72)",
          borderBottom: "2px solid rgba(255,236,226,.72)",
          borderBottomRightRadius: "0.14em",
        }}
      />
    </span>
  );
}
