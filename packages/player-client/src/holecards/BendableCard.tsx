import type { Card as CardType } from "@table-top-poker/protocol";
import { Card } from "@table-top-poker/ui-shared";
import { motion } from "motion/react";
import type { Presentation } from "./cardState.js";
import { REVEAL_FINISH_MS } from "./constants.js";

/**
 * The player-side wrapper around the untouched shared `Card` (Phase 3 spec
 * #138 §14). Bend and flip live here, in the player client; `ui-shared` gains
 * no gesture or poker concepts and the table client is unaffected.
 *
 * The turn cross-fades `Card`'s two branches — its documented `faceDown`
 * branch and its face branch — rather than swapping an image, which is the
 * reason `Card` renders DOM either way.
 *
 * The face branch is mounted only while the card is turning or revealed, so a
 * face-down pair carries no rank or suit in the document at all. Concealment
 * unmounts it again, instantly: `Revealed → FaceDown` is a privacy act and is
 * never animated.
 */
export function BendableCard({
  card,
  presentation,
  tiltDegrees,
}: {
  readonly card: CardType;
  readonly presentation: Presentation;
  /** The card's resting angle in the overlapped pair. */
  readonly tiltDegrees: number;
}) {
  const turning = presentation === "Turning";
  const revealed = presentation === "Revealed";
  const showFace = turning || revealed;
  const showBack = !revealed;
  const duration = turning ? REVEAL_FINISH_MS / 1000 : 0;

  return (
    <motion.div
      data-testid="hole-card"
      data-revealed={String(revealed)}
      // The half-turn: the card narrows to its edge and comes back, with the
      // two branches crossing over while it is edge-on.
      animate={{ scaleX: turning ? [1, 0.04, 1] : 1 }}
      transition={{ duration, times: [0, 0.5, 1], ease: "easeInOut" }}
      style={{
        position: "relative",
        display: "grid",
        transform: `rotate(${String(tiltDegrees)}deg)`,
      }}
    >
      {showBack && (
        <motion.div
          style={{ gridArea: "1 / 1" }}
          animate={{ opacity: turning ? 0 : 1 }}
          transition={{ duration, ease: "easeInOut" }}
        >
          <Card faceDown />
        </motion.div>
      )}
      {showFace && (
        <motion.div
          style={{ gridArea: "1 / 1" }}
          initial={{ opacity: turning ? 0 : 1 }}
          animate={{ opacity: 1 }}
          transition={{ duration, ease: "easeInOut" }}
        >
          <Card rank={card.rank} suit={card.suit} />
        </motion.div>
      )}
    </motion.div>
  );
}
