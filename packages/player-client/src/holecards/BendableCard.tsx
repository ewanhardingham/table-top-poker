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
import { useEffect, useRef } from "react";
import {
  PeelBack,
  PeelBottom,
  PeelTop,
  PeelWrapper,
  type PeelRef,
} from "react-peel";
import type { Presentation } from "./cardState.js";
import { REVEAL_THRESHOLD } from "./constants.js";

export function BendableCard({
  card,
  presentation,
  bend,
  tiltDegrees,
  leavingFaceUp,
}: {
  readonly card: CardType;
  readonly presentation: Presentation;
  readonly bend: MotionValue<number>;
  readonly tiltDegrees: number;
  readonly leavingFaceUp: boolean;
}) {
  const peeking = presentation === "Peeking";
  const turning = presentation === "Turning";
  const revealed =
    presentation === "Revealed" ||
    (presentation === "Leaving" && leavingFaceUp);
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
        const travel = (progress / REVEAL_THRESHOLD) * CURL_TRAVEL;
        current.setPeelPosition(
          width - width * travel,
          height - height * travel,
        );
        return;
      }

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
      <PeelBack style={{ position: "relative", width: "100%", height: "100%" }}>
        <Card rank={card.rank} suit={card.suit} />
        <CurlIndex rank={card.rank} suit={card.suit} />
      </PeelBack>
      <PeelBottom />
    </PeelWrapper>
  );
}

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
        transform: "rotate(180deg)",
        color: isRedSuit(suit) ? color.suitRed : color.suitBlack,
      }}
    >
      {rank}
      <span style={{ ...cardIndexSuitStyle, fontSize: "0.9em" }}>
        {suitSymbols[suit]}
      </span>
    </span>
  );
}

const CURL_TRAVEL = 0.86;

function BendZone() {
  return (
    <span
      data-bend-zone="true"
      aria-hidden="true"
      style={{
        position: "absolute",
        right: 0,
        bottom: 0,
        width: "1.5em",
        height: "1.5em",
        borderBottomRightRadius: "0.2em",
      }}
    >
      <span
        style={{
          position: "absolute",
          right: "0.18em",
          bottom: "0.18em",
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
