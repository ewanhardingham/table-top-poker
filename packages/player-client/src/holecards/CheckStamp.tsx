import {
  color,
  font,
  fontSize,
  radius,
  shadow,
} from "@table-top-poker/ui-shared";
import { motion, useReducedMotion } from "motion/react";

/** Pressed on slightly larger than life, so the mark reads as sitting above. */
const RESTING_SCALE = 1.25;

/**
 * The sighted confirmation for a gesture Check. The surrounding card surface
 * decides when this exists; the stamp itself is deliberately non-interactive
 * so it cannot steal or replay a card gesture, and hidden from assistive
 * technology because `HoleCardPair`'s live region already speaks the same news.
 *
 * Styled from the theme tokens rather than a stylesheet: there is no
 * CSS-variable bridge to them, so a class would have meant re-hardcoding the
 * palette, and #144 asks this surface to align with the app's tokens. The entry
 * animation is Motion's for the same reason every other animation here is —
 * one system driving the surface, with reduced motion answered in one place.
 */
export function CheckStamp() {
  const reducedMotion = useReducedMotion();

  return (
    <motion.span
      data-testid="check-stamp"
      aria-hidden="true"
      // A player who asked for less motion gets the stamp already at rest,
      // rather than the same movement hurried into an imperceptible duration.
      initial={
        reducedMotion === true
          ? false
          : { opacity: 0, scale: RESTING_SCALE * 0.72 }
      }
      animate={{ opacity: 1, scale: RESTING_SCALE }}
      transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      style={{
        position: "absolute",
        zIndex: 1,
        top: "40%",
        left: "50%",
        x: "-50%",
        y: "-50%",
        rotate: -7,
        display: "flex",
        alignItems: "center",
        gap: "0.5em",
        minHeight: "3.2em",
        padding: "0 1em 0 0.55em",
        // The pair below stays reachable: a tap that lands on the stamp is
        // still a tap on the cards.
        pointerEvents: "none",
        whiteSpace: "nowrap",
        color: color.winText,
        border: `2px solid ${color.winBright}`,
        borderRadius: radius.card,
        background: color.winPlate,
        boxShadow: shadow.card,
      }}
    >
      <span
        style={{
          display: "grid",
          width: "1.5em",
          height: "1.5em",
          placeItems: "center",
          borderRadius: radius.pill,
          color: color.background,
          background: color.winBright,
        }}
      >
        ✓
      </span>
      <strong
        style={{
          font: `700 ${fontSize.md} ${font.mono}`,
          letterSpacing: "0.12em",
        }}
      >
        CHECKED
      </strong>
    </motion.span>
  );
}
