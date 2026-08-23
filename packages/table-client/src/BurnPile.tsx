import { Card } from "@table-top-poker/ui-shared";
import { motion, useReducedMotion } from "motion/react";
import { Fragment, useEffect, useRef } from "react";
import type { BurnTiming } from "./burnPile.js";
import {
  FLAME,
  flameKeyframes,
  burnTiming,
  flameSpan,
  pileCards,
  tongueFlames,
} from "./burnPile.js";

export interface BurnPileProps {
  readonly count: number;
}

const CARD_WIDTH_EM = 3.5;
const CARD_HEIGHT_EM = 5;

const FLAME_LAYER = {
  position: "absolute",
  left: "50%",
  mixBlendMode: "screen",
  pointerEvents: "none",
} as const;

/** The bloom stays where the card lands; it does not fly in with it. */
function Bloom({
  timing,
  restX,
  restY,
}: {
  readonly timing: BurnTiming;
  readonly restX: number;
  readonly restY: number;
}) {
  const span = flameSpan(timing);
  return (
    <motion.div
      style={{
        ...FLAME_LAYER,
        top: "50%",
        width: `${String(FLAME.bloomSizeEm)}em`,
        height: `${String(FLAME.bloomSizeEm)}em`,
        x: `calc(-50% + ${String(restX)}px)`,
        y: `calc(-50% + ${String(restY)}px)`,
        borderRadius: "50%",
        filter: "blur(6px)",
        background:
          "radial-gradient(circle, rgba(255,244,200,1) 0%, rgba(255,168,40,0.95) 38%, rgba(190,60,10,0.55) 62%, rgba(0,0,0,0) 75%)",
      }}
      initial={{ scale: 0.2, opacity: 0 }}
      animate={{
        scale: [0.2, 1.25, 0.5],
        opacity: [0, FLAME.bloomPeakOpacity, 0],
      }}
      transition={{
        duration: span,
        delay: timing.ignite.delay,
        times: [...flameKeyframes(timing)],
        ease: "easeOut",
      }}
    />
  );
}

function Tongues({ timing }: { readonly timing: BurnTiming }) {
  return (
    <>
      {tongueFlames(timing).map(({ key, offsetEm, delay, duration }) => (
        <motion.div
          key={key}
          style={{
            ...FLAME_LAYER,
            bottom: "0.4em",
            width: "1.1em",
            height: `${String(FLAME.tongueHeightEm)}em`,
            x: `calc(-50% + ${String(offsetEm)}em)`,
            transformOrigin: "50% 100%",
            borderRadius: "50% 50% 40% 40% / 65% 65% 35% 35%",
            filter: "blur(3px)",
            background:
              "linear-gradient(to top, rgba(255,240,190,1), rgba(255,150,30,0.9) 45%, rgba(200,40,0,0) 100%)",
          }}
          initial={{ scaleY: 0.05, opacity: 0 }}
          animate={{ scaleY: [0.05, 1.15, 0.9, 0], opacity: [0, 1, 0.9, 0] }}
          transition={{ duration, delay, ease: "easeOut" }}
        />
      ))}
    </>
  );
}

/** The bloom lifts the card while tongues climb it and it curls — see `docs/design/burn-pile.md`. */
function BurningCard({ timing }: { readonly timing: BurnTiming }) {
  return (
    <motion.div
      data-testid="burn-flame"
      style={{ position: "relative", transformPerspective: 500 }}
      animate={{
        rotateX: [0, FLAME.curlDegrees, 0],
        y: [0, -3, 2],
        filter: [
          "brightness(1)",
          `brightness(${String(FLAME.cardBrightness)})`,
          "brightness(1)",
        ],
      }}
      transition={{
        duration: flameSpan(timing),
        delay: timing.ignite.delay,
        times: [...flameKeyframes(timing)],
      }}
    >
      <Card faceDown />
      <Tongues timing={timing} />
    </motion.div>
  );
}

export function BurnPile({ count }: BurnPileProps) {
  const reducedMotion = useReducedMotion() === true;
  const piledBefore = useRef(count);
  const cards = pileCards(count, piledBefore.current);
  const timing = burnTiming(reducedMotion);
  const { travel } = timing;

  useEffect(() => {
    piledBefore.current = count;
  });

  return (
    <div
      data-testid="burn-pile"
      data-burned={count}
      aria-hidden="true"
      style={{
        position: "relative",
        fontSize: "2em",
        width: `${String(CARD_WIDTH_EM)}em`,
        height: `${String(CARD_HEIGHT_EM)}em`,
      }}
    >
      {cards.map(({ key, x, y, rotate, arriving }) => {
        const burning = arriving && !reducedMotion;
        return (
          <Fragment key={key}>
            {burning && <Bloom timing={timing} restX={x} restY={y} />}
            <motion.div
              style={{ position: "absolute", inset: 0 }}
              initial={
                arriving && travel.duration > 0
                  ? { opacity: 0, x: x + 46, y: y - 30, rotate: rotate + 14 }
                  : { opacity: 1, x, y, rotate }
              }
              animate={{ opacity: 1, x, y, rotate }}
              transition={{
                duration: travel.duration,
                delay: travel.delay,
                ease: [0.2, 0.8, 0.2, 1],
              }}
            >
              {burning ? <BurningCard timing={timing} /> : <Card faceDown />}
            </motion.div>
          </Fragment>
        );
      })}
    </div>
  );
}
