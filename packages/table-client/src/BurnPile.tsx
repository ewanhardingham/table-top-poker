import { cardBackDesigns, useCardBackDesign } from "@table-top-poker/ui-shared";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { BOARD_CARD_EM } from "./boardDeal.js";
import type { AshScene } from "./burnAshScene.js";
import {
  ASH_FLOOR_Y,
  ASH_HALF_W,
  ASH_STAGE,
  burnTransition,
} from "./burnPile.js";

export interface BurnPileProps {
  readonly count: number;
}

/** A backgrounded tab hands back one huge delta; the sim must not teleport. */
const MAX_FRAME_S = 1 / 20;

function cardArtwork(design: string): string {
  return (
    cardBackDesigns.find((candidate) => candidate.id === design)?.artwork ?? ""
  );
}

/**
 * Whether this browser can run the burn at all. Decided before the first paint
 * so the pile picks its rendering up front, rather than swapping a fallback out
 * for a canvas a frame later.
 */
let webglSupport: boolean | null = null;

function supportsWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    webglSupport = probe.getContext("webgl2") !== null;
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/**
 * What the felt shows when the burn cannot be animated — no WebGL, or a viewer
 * who has asked for less motion. It is the picture the burn ends on anyway:
 * ash on the felt, just already there. See `docs/design/burn-pile.md`.
 */
function SettledAsh({ count }: BurnPileProps) {
  if (count <= 0) return null;
  const spread = Math.min(1, count / 3);
  return (
    <div
      data-testid="burn-ash"
      style={{
        position: "absolute",
        left: `${String(ASH_STAGE.restX)}em`,
        top: `${String(ASH_FLOOR_Y)}em`,
        width: `${String(ASH_HALF_W * 2)}em`,
        height: `${String(0.5 + spread * 0.25)}em`,
        transform: "translate(-50%, -60%)",
        borderRadius: "50%",
        background:
          "radial-gradient(ellipse at 50% 60%, rgba(96,92,86,.92) 0%, rgba(58,54,49,.7) 42%, rgba(26,22,20,.35) 68%, rgba(0,0,0,0) 82%)",
        opacity: 0.45 + spread * 0.45,
      }}
    />
  );
}

/**
 * The burn pile: one card per `view.burnedCount`, flown in from the deck, eaten
 * by an ember front, and left on the felt as ash. The count is already carried
 * by the state the table renders, so the pile is decoration and stays out of
 * the accessibility tree.
 */
export function BurnPile({ count }: BurnPileProps) {
  const reducedMotion = useReducedMotion() === true;
  const design = useCardBackDesign();
  /** A scene that cannot be loaded or built is the fallback's third reason. */
  const [sceneFailed, setSceneFailed] = useState(false);
  const animated = !reducedMotion && !sceneFailed && supportsWebGL();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<AshScene | null>(null);
  const countRef = useRef(count);
  countRef.current = count;
  /** Null until a scene is running, so a pile that mounts whole stays settled. */
  const countBefore = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!animated || !canvas) return;

    let disposed = false;
    let scene: AshScene | null = null;
    let observer: ResizeObserver | null = null;
    let frame = 0;

    // `three` is a third of a megabyte gzipped, so it is fetched after the
    // table is on screen rather than bundled into the first paint.
    import("./burnAshScene.js")
      .then(({ createAshScene }) => {
        if (disposed) return;
        scene = createAshScene({
          canvas,
          cardArtwork: cardArtwork(design),
          pixelRatio: Math.min(window.devicePixelRatio, 2),
        });
        if (!scene) {
          setSceneFailed(true);
          return;
        }
        const running = scene;
        sceneRef.current = running;

        observer = new ResizeObserver(([entry]) => {
          const box = entry?.contentRect;
          if (box) running.resize(box.width, box.height);
        });
        observer.observe(canvas);
        running.resize(canvas.clientWidth, canvas.clientHeight);

        // Burns that happened before the scene existed are already over.
        if (countRef.current > 0) running.settleWhole(countRef.current);
        countBefore.current = countRef.current;

        let previous = performance.now();
        const tick = (now: number) => {
          frame = requestAnimationFrame(tick);
          const delta = Math.min((now - previous) / 1000, MAX_FRAME_S);
          previous = now;
          running.advance(delta);
        };
        frame = requestAnimationFrame(tick);
      })
      // A stale chunk hash after a deploy, or a dropped connection: fall back
      // to the settled pile rather than leaving an empty canvas on the felt.
      .catch(() => {
        if (!disposed) setSceneFailed(true);
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      sceneRef.current = null;
      countBefore.current = null;
      scene?.dispose();
    };
  }, [animated, design]);

  /**
   * Only a count that steps by exactly one under a running scene sets a card
   * alight. Anything else is a seek, and rebuilds the pile at the size the
   * count asks for — rather than burning once for a jump of three, or emptying
   * the felt for a step backwards.
   */
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || countBefore.current === null) return;

    const before = countBefore.current;
    countBefore.current = count;

    switch (burnTransition(count, before)) {
      case "none":
        return;
      case "burn":
        scene.burn();
        return;
      case "resettle":
        scene.reset();
        if (count > 0) scene.settleWhole(count);
        return;
    }
  }, [count]);

  return (
    <div
      data-testid="burn-pile"
      data-burned={count}
      aria-hidden="true"
      style={{
        position: "relative",
        fontSize: `${String(BOARD_CARD_EM)}em`,
        width: `${String(ASH_STAGE.width)}em`,
        height: `${String(ASH_STAGE.height)}em`,
      }}
    >
      {animated ? (
        <canvas
          ref={canvasRef}
          data-testid="burn-canvas"
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            // The stage overhangs the community row; embers may drift over the
            // flop, but the canvas must not take its clicks.
            pointerEvents: "none",
          }}
        />
      ) : (
        <SettledAsh count={count} />
      )}
    </div>
  );
}
