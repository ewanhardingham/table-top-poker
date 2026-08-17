import {
  color,
  font,
  fontSize,
  radius,
  shadow,
} from "@table-top-poker/ui-shared";
import { motion, useReducedMotion } from "motion/react";

const RESTING_SCALE = 1.25;

export function CheckStamp() {
  const reducedMotion = useReducedMotion();

  return (
    <motion.span
      data-testid="check-stamp"
      aria-hidden="true"
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
