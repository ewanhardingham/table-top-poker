import { Card } from "@table-top-poker/ui-shared";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { burnTiming, pileCards } from "./burnPile.js";

export interface BurnPileProps {
  readonly count: number;
}

const CARD_WIDTH_EM = 3.5;
const CARD_HEIGHT_EM = 5;

export function BurnPile({ count }: BurnPileProps) {
  const reducedMotion = useReducedMotion();
  const piledBefore = useRef(count);
  const cards = pileCards(count, piledBefore.current);
  const { travel } = burnTiming(reducedMotion === true);

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
      {cards.map(({ key, x, y, rotate, arriving }) => (
        <motion.div
          key={key}
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
          <Card faceDown />
        </motion.div>
      ))}
    </div>
  );
}
