import {
  Card,
  PillButton,
  color,
  font,
  onHandUpdate,
  unlockAudio,
} from "@table-top-poker/ui-shared";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BURN_BUDGET_S, type BurnTiming, burnTiming } from "./burnPile.js";
import "./app-shell.css";

/**
 * Throwaway workbench for choosing the burn animation with a human in the
 * loop (#265). Deleted when the winner ships (#266).
 */

const DECK_OFFSET = { x: 120, y: -70 };

function scaleTiming(timing: BurnTiming, factor: number): BurnTiming {
  const phase = ({ delay, duration }: { delay: number; duration: number }) => ({
    delay: delay * factor,
    duration: duration * factor,
  });
  return {
    travel: phase(timing.travel),
    ignite: phase(timing.ignite),
    fade: phase(timing.fade),
    peakAt: timing.peakAt * factor,
    total: timing.total * factor,
  };
}

interface VariantProps {
  readonly timing: BurnTiming;
  readonly reducedMotion: boolean;
}

function Stage({ children }: { readonly children: ReactNode }) {
  return (
    <div
      style={{
        position: "relative",
        width: "12em",
        height: "11em",
        fontSize: "1.6em",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div style={{ position: "absolute", opacity: 0.55 }}>
        <Card faceDown />
      </div>
      {children}
    </div>
  );
}

function arrival(timing: BurnTiming, reducedMotion: boolean) {
  if (reducedMotion)
    return { initial: false as const, animate: {}, transition: {} };
  return {
    initial: {
      x: DECK_OFFSET.x,
      y: DECK_OFFSET.y,
      rotate: 16,
      opacity: 0,
      scale: 1.05,
    },
    animate: { x: 0, y: 0, rotate: -4, opacity: 1, scale: 1 },
    transition: {
      duration: timing.travel.duration,
      delay: timing.travel.delay,
      ease: [0.2, 0.8, 0.2, 1] as const,
    },
  };
}

/** A: an ember line eats across the card, leaving scorch behind it. */
function EmberEdge({ timing, reducedMotion }: VariantProps) {
  const { ignite, fade, peakAt } = timing;
  return (
    <Stage>
      <motion.div
        style={{ position: "absolute" }}
        {...arrival(timing, reducedMotion)}
      >
        <div style={{ position: "relative" }}>
          <Card faceDown />
          {!reducedMotion && (
            <>
              <motion.div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "0.2em",
                  background:
                    "linear-gradient(200deg, rgba(20,12,6,0.95) 0%, rgba(120,40,8,0.9) 34%, rgba(255,168,48,1) 46%, rgba(255,236,170,1) 50%, rgba(255,255,255,0) 56%)",
                  backgroundSize: "260% 260%",
                  mixBlendMode: "screen",
                }}
                initial={{ backgroundPosition: "0% 0%", opacity: 0 }}
                animate={{
                  backgroundPosition: ["0% 0%", "78% 78%", "130% 130%"],
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: fade.delay + fade.duration - ignite.delay,
                  delay: ignite.delay,
                  times: [
                    0,
                    (peakAt - ignite.delay) / (timing.total - ignite.delay),
                    1,
                  ],
                  ease: "easeIn",
                }}
              />
              <motion.div
                style={{
                  position: "absolute",
                  inset: "-0.3em",
                  borderRadius: "0.5em",
                }}
                initial={{ boxShadow: "0 0 0 rgba(255,150,40,0)" }}
                animate={{
                  boxShadow: [
                    "0 0 0.2em rgba(255,150,40,0)",
                    "0 0 1.6em rgba(255,150,40,0.85)",
                    "0 0 0.4em rgba(120,50,10,0)",
                  ],
                }}
                transition={{
                  duration: timing.total - ignite.delay,
                  delay: ignite.delay,
                }}
              />
            </>
          )}
        </div>
      </motion.div>
    </Stage>
  );
}

/** B: a flame blooms from under the card and collapses back. */
function FlareUp({ timing, reducedMotion }: VariantProps) {
  const { ignite, fade } = timing;
  return (
    <Stage>
      {!reducedMotion && (
        <motion.div
          style={{
            position: "absolute",
            width: "5em",
            height: "5em",
            borderRadius: "50%",
            filter: "blur(6px)",
            background:
              "radial-gradient(circle, rgba(255,244,200,1) 0%, rgba(255,168,40,0.95) 38%, rgba(190,60,10,0.55) 62%, rgba(0,0,0,0) 75%)",
            mixBlendMode: "screen",
          }}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{ scale: [0.2, 1.25, 0.5], opacity: [0, 1, 0] }}
          transition={{
            duration: ignite.duration + fade.duration,
            delay: ignite.delay,
            times: [0, ignite.duration / (ignite.duration + fade.duration), 1],
            ease: "easeOut",
          }}
        />
      )}
      <motion.div
        style={{ position: "absolute" }}
        {...arrival(timing, reducedMotion)}
      >
        <motion.div
          style={{ position: "relative" }}
          animate={
            reducedMotion
              ? {}
              : {
                  filter: [
                    "brightness(1)",
                    "brightness(2.4)",
                    "brightness(0.75)",
                  ],
                }
          }
          transition={{
            duration: ignite.duration + fade.duration,
            delay: ignite.delay,
          }}
        >
          <Card faceDown />
        </motion.div>
      </motion.div>
    </Stage>
  );
}

/** C: tongues of flame climb the card's edge, then it curls flat. */
function CurlAndLick({ timing, reducedMotion }: VariantProps) {
  const { ignite, fade } = timing;
  const tongues = [-0.9, 0, 0.9];
  return (
    <Stage>
      <motion.div
        style={{ position: "absolute" }}
        {...arrival(timing, reducedMotion)}
      >
        <motion.div
          style={{ position: "relative", transformPerspective: 500 }}
          animate={reducedMotion ? {} : { rotateX: [0, -22, 0], y: [0, -4, 2] }}
          transition={{
            duration: ignite.duration + fade.duration,
            delay: ignite.delay,
          }}
        >
          <Card faceDown />
          {!reducedMotion &&
            tongues.map((offset, index) => (
              <motion.div
                key={offset}
                style={{
                  position: "absolute",
                  bottom: "0.4em",
                  left: "50%",
                  width: "1.1em",
                  height: "2.6em",
                  x: `calc(-50% + ${String(offset)}em)`,
                  transformOrigin: "50% 100%",
                  borderRadius: "50% 50% 40% 40% / 65% 65% 35% 35%",
                  filter: "blur(3px)",
                  background:
                    "linear-gradient(to top, rgba(255,240,190,1), rgba(255,150,30,0.9) 45%, rgba(200,40,0,0) 100%)",
                  mixBlendMode: "screen",
                }}
                initial={{ scaleY: 0.05, opacity: 0 }}
                animate={{
                  scaleY: [0.05, 1.15, 0.9, 0],
                  opacity: [0, 1, 0.9, 0],
                }}
                transition={{
                  duration: ignite.duration + fade.duration,
                  delay: ignite.delay + index * 0.04,
                  ease: "easeOut",
                }}
              />
            ))}
        </motion.div>
      </motion.div>
    </Stage>
  );
}

/** D: no flame shape — the card itself heats through and cools to ash. */
function Smoulder({ timing, reducedMotion }: VariantProps) {
  const { ignite, fade } = timing;
  const specks = [-1.1, -0.4, 0.5, 1.2];
  return (
    <Stage>
      <motion.div
        style={{ position: "absolute" }}
        {...arrival(timing, reducedMotion)}
      >
        <div style={{ position: "relative" }}>
          <Card faceDown />
          {!reducedMotion && (
            <>
              <motion.div
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: "0.2em",
                  background:
                    "radial-gradient(ellipse at 50% 70%, rgba(255,190,90,1) 0%, rgba(210,70,10,0.8) 45%, rgba(40,16,4,0.6) 100%)",
                  mixBlendMode: "screen",
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.95, 0.1] }}
                transition={{
                  duration: ignite.duration + fade.duration,
                  delay: ignite.delay,
                  times: [
                    0,
                    ignite.duration / (ignite.duration + fade.duration),
                    1,
                  ],
                }}
              />
              {specks.map((offset, index) => (
                <motion.div
                  key={offset}
                  style={{
                    position: "absolute",
                    bottom: "1em",
                    left: "50%",
                    width: "0.16em",
                    height: "0.16em",
                    borderRadius: "50%",
                    background: "rgba(255,206,120,1)",
                    filter: "blur(1px)",
                  }}
                  initial={{ x: `${String(offset)}em`, y: 0, opacity: 0 }}
                  animate={{ y: [-0, -34, -70], opacity: [0, 1, 0] }}
                  transition={{
                    duration: ignite.duration + fade.duration,
                    delay: ignite.delay + index * 0.06,
                    ease: "easeOut",
                  }}
                />
              ))}
            </>
          )}
        </div>
      </motion.div>
    </Stage>
  );
}

const VARIANTS = [
  {
    key: "A",
    name: "Ember edge",
    blurb: "A burn line eats across the card, scorch trailing it.",
    Render: EmberEdge,
  },
  {
    key: "B",
    name: "Flare-up",
    blurb: "A flame blooms from beneath the card and collapses.",
    Render: FlareUp,
  },
  {
    key: "C",
    name: "Curl and lick",
    blurb: "Tongues climb the edge; the card curls and drops flat.",
    Render: CurlAndLick,
  },
  {
    key: "D",
    name: "Smoulder",
    blurb: "No flame shape — the card heats through and cools to ash.",
    Render: Smoulder,
  },
] as const;

function playBurnCue(): void {
  onHandUpdate({
    surface: "table",
    event: { type: "CardBurned", street: "flop", card: null },
    view: { phase: "no-hand", button: 0 },
  });
}

function Harness() {
  const [run, setRun] = useState(0);
  const [slow, setSlow] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [sound, setSound] = useState(false);

  const timing = scaleTiming(burnTiming(), slow ? 3 : 1);

  const burn = () => {
    setRun((n) => n + 1);
    if (sound) playBurnCue();
  };

  const enableSound = () => {
    void unlockAudio().then(() => {
      setSound(true);
    });
  };

  return (
    <div style={{ padding: "2rem", fontFamily: font.body, color: color.text }}>
      <h1 style={{ font: `600 1.4rem ${font.mono}`, letterSpacing: "0.06em" }}>
        Burn animation — four variants
      </h1>
      <p style={{ maxWidth: "48rem", opacity: 0.8 }}>
        Budget {BURN_BUDGET_S * 1000}ms, gating the board deal. The cue is a
        swell with no attack: it peaks {timing.peakAt * 1000}ms in, so the flame
        should build to its brightest late rather than igniting on frame one.
      </p>
      <div
        style={{
          display: "flex",
          gap: "0.6rem",
          alignItems: "center",
          margin: "1.2rem 0",
        }}
      >
        <PillButton onClick={burn}>Burn</PillButton>
        <label>
          <input
            type="checkbox"
            checked={slow}
            onChange={(e) => {
              setSlow(e.target.checked);
            }}
          />{" "}
          slow motion (3×)
        </label>
        <label>
          <input
            type="checkbox"
            checked={reducedMotion}
            onChange={(e) => {
              setReducedMotion(e.target.checked);
            }}
          />{" "}
          reduced motion
        </label>
        {sound ? (
          <span style={{ opacity: 0.7 }}>sound on</span>
        ) : (
          <PillButton onClick={enableSound}>Enable sound</PillButton>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "2rem" }}>
        {VARIANTS.map(({ key, name, blurb, Render }) => (
          <section key={key} style={{ width: "16rem" }}>
            <h2 style={{ font: `600 1rem ${font.mono}` }}>
              {key} — {name}
            </h2>
            <p
              style={{ minHeight: "3rem", fontSize: "0.85rem", opacity: 0.75 }}
            >
              {blurb}
            </p>
            <Render key={run} timing={timing} reducedMotion={reducedMotion} />
          </section>
        ))}
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Harness />
  </React.StrictMode>,
);
