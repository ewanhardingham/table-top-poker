/**
 * PROTOTYPE ONLY — three Hole-card bend grammars, switchable with
 * ?variant=A|B|C on one dev-only route.
 */
import {
  animate,
  motion,
  type MotionValue,
  useMotionValue,
} from "motion/react";
import {
  PeelBack,
  PeelBottom,
  PeelTop,
  PeelWrapper,
  type PeelRef,
} from "react-peel";
import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeSwitcher } from "./PrototypeSwitcher.js";

type VariantKey = "A" | "B" | "C";
type TurnDirection = "revealing" | "concealing";
type BendCorner = "BOTTOM_RIGHT" | "TOP_LEFT";

const VARIANTS = [
  { key: "A", name: "Bend to reveal" },
  { key: "B", name: "Bend both ways" },
  { key: "C", name: "Two-corner bend" },
] as const;

const FOLD_THRESHOLD = -112;
const MOVE_THRESHOLD = 9;
const DOUBLE_TAP_MS = 280;
const REVEAL_THRESHOLD = 0.9;
const REVEAL_FINISH_MS = 520;
const COACHING: Record<VariantKey, string> = {
  A: "Bend either card past 90% and it will finish turning face-up. Tap a revealed card to conceal it.",
  B: "Bend past 90% to turn a card over. Bend the revealed face again to conceal it.",
  C: "Bend either marked corner past 90% to reveal or conceal each card.",
};

interface ActiveGesture {
  readonly pointerId: number;
  readonly cardIndex: 0 | 1;
  readonly startX: number;
  readonly startY: number;
  readonly fromBendZone: boolean;
  readonly bendCorner: BendCorner;
  readonly startedRevealed: boolean;
  mode: "pressing" | "bending" | "turning" | "folding" | "ignored";
  thresholdCrossed: boolean;
  interruptTimer: ReturnType<typeof setTimeout> | null;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function vibrate(duration: number) {
  const vibration = Reflect.get(navigator, "vibrate") as unknown;
  if (typeof vibration === "function") {
    Reflect.apply(vibration, navigator, [duration]);
  }
}

function initialVariant(): VariantKey {
  const candidate = new URLSearchParams(window.location.search).get("variant");
  return candidate === "B" || candidate === "C" ? candidate : "A";
}

function PokerFace({
  rank,
  suit,
  curlCorner = null,
}: {
  readonly rank: string;
  readonly suit: string;
  readonly curlCorner?: BendCorner | null;
}) {
  return (
    <div
      className={`gesture-card-face ${suit === "♥" || suit === "♦" ? "is-red" : ""}`}
      aria-hidden="true"
    >
      <span className="gesture-card-index">
        <strong>{rank}</strong>
        <span>{suit}</span>
      </span>
      <span className="gesture-card-pip">{suit}</span>
      <span className="gesture-card-index gesture-card-index-bottom">
        <strong>{rank}</strong>
        <span>{suit}</span>
      </span>
      {curlCorner === "BOTTOM_RIGHT" && (
        <span className="gesture-card-curl-index">
          <strong>{rank}</strong>
          <span>{suit}</span>
        </span>
      )}
      {curlCorner === "TOP_LEFT" && (
        <span className="gesture-card-curl-index gesture-card-curl-index-top-left">
          <strong>{rank}</strong>
          <span>{suit}</span>
        </span>
      )}
    </div>
  );
}

function CardBack() {
  return (
    <div className="gesture-card-back" aria-hidden="true">
      <span className="gesture-card-back-inner" />
    </div>
  );
}

function ReactPeelCard({
  progress,
  revealed,
  bendToConceal,
  bendCorner,
  rank,
  suit,
}: {
  readonly progress: MotionValue<number>;
  readonly revealed: boolean;
  readonly bendToConceal: boolean;
  readonly bendCorner: BendCorner;
  readonly rank: string;
  readonly suit: string;
}) {
  const peelRef = useRef<PeelRef>(null);

  useEffect(() => {
    const position = (value: number) => {
      const fromBottomRight = bendCorner === "BOTTOM_RIGHT";
      if (value <= REVEAL_THRESHOLD) {
        const inset = value * 142;
        peelRef.current?.setPeelPosition(
          fromBottomRight ? 164 - inset : inset,
          fromBottomRight ? 228 - inset : inset,
        );
        return;
      }

      // The drag uses the gentle diagonal curl that tested well. Once armed,
      // carry that same sheet beyond the opposite corner so it completes the
      // turn before the flat face replaces it.
      const finish = clamp((value - REVEAL_THRESHOLD) / (1 - REVEAL_THRESHOLD));
      const thresholdInset = REVEAL_THRESHOLD * 142;
      const thresholdX = fromBottomRight
        ? 164 - thresholdInset
        : thresholdInset;
      const thresholdY = fromBottomRight
        ? 228 - thresholdInset
        : thresholdInset;
      peelRef.current?.setPeelPosition(
        thresholdX + ((fromBottomRight ? -164 : 328) - thresholdX) * finish,
        thresholdY + ((fromBottomRight ? -228 : 456) - thresholdY) * finish,
      );
    };
    position(progress.get());
    return progress.on("change", position);
  }, [bendCorner, progress]);

  if (revealed && !bendToConceal) {
    return (
      <div className="gesture-card-surface gesture-card-fully-revealed">
        <PokerFace rank={rank} suit={suit} />
      </div>
    );
  }

  return (
    <div
      className={`gesture-card-surface gesture-card-library-surface${revealed ? " gesture-card-fully-revealed" : ""}`}
    >
      <PeelWrapper
        ref={peelRef}
        width="100%"
        height="100%"
        corner={bendCorner}
        options={{
          topShadowBlur: 3,
          topShadowAlpha: 0.32,
          backShadowAlpha: 0.18,
          bottomShadowDarkAlpha: 0.38,
          backReflection: true,
        }}
      >
        <PeelTop>
          {revealed ? <PokerFace rank={rank} suit={suit} /> : <CardBack />}
        </PeelTop>
        <PeelBack>
          {revealed ? (
            <CardBack />
          ) : (
            <PokerFace rank={rank} suit={suit} curlCorner={bendCorner} />
          )}
        </PeelBack>
        <PeelBottom className="gesture-card-table-underlay" />
      </PeelWrapper>
    </div>
  );
}

function GestureCard({
  cardIndex,
  progress,
  revealed,
  turning,
  bendToConceal,
  bendCorner,
  bothCorners,
  rank,
  suit,
}: {
  readonly cardIndex: 0 | 1;
  readonly progress: MotionValue<number>;
  readonly revealed: boolean;
  readonly turning: TurnDirection | null;
  readonly bendToConceal: boolean;
  readonly bendCorner: BendCorner;
  readonly bothCorners: boolean;
  readonly rank: string;
  readonly suit: string;
}) {
  return (
    <div
      className={`gesture-card${turning ? " is-finishing-turn" : ""}`}
      data-card-index={cardIndex}
    >
      <ReactPeelCard
        progress={progress}
        revealed={revealed}
        bendToConceal={bendToConceal}
        bendCorner={bendCorner}
        rank={rank}
        suit={suit}
      />
      {(!revealed || bendToConceal) && !turning && bothCorners && (
        <span
          className="gesture-card-bend-zone gesture-card-bend-zone-top-left"
          data-bend-corner="TOP_LEFT"
          aria-hidden="true"
        >
          <span />
        </span>
      )}
      {(!revealed || bendToConceal) && !turning && (
        <span
          className="gesture-card-bend-zone"
          data-bend-corner="BOTTOM_RIGHT"
          aria-hidden="true"
        >
          <span />
        </span>
      )}
    </div>
  );
}

export function HoleCardsPrototype() {
  const [variantKey, setVariantKey] = useState<VariantKey>(initialVariant);
  const [revealedCards, setRevealedCards] = useState<
    readonly [boolean, boolean]
  >([false, false]);
  const [turningCards, setTurningCards] = useState<
    readonly [TurnDirection | null, TurnDirection | null]
  >([null, null]);
  const [bendCorners, setBendCorners] = useState<
    readonly [BendCorner, BendCorner]
  >(["BOTTOM_RIGHT", "BOTTOM_RIGHT"]);
  const [mucked, setMucked] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [recognizer, setRecognizer] = useState("idle");
  const [peekPercent, setPeekPercent] = useState(0);
  const [lastEvent, setLastEvent] = useState("Fresh hand dealt face-down");
  const [legalFold, setLegalFold] = useState(true);
  const [legalCheck, setLegalCheck] = useState(true);
  const [interruptNext, setInterruptNext] = useState(false);
  const [serverRevision, setServerRevision] = useState(1);
  const [labOpen, setLabOpen] = useState(false);

  const peekLeft = useMotionValue(0);
  const peekRight = useMotionValue(0);
  const pairY = useMotionValue(0);
  const activeRef = useRef<ActiveGesture | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const revealAnimationsRef = useRef<
    [{ stop: () => void } | null, { stop: () => void } | null]
  >([null, null]);
  const revealTokensRef = useRef<[number, number]>([0, 0]);

  const setCardRevealed = useCallback((cardIndex: 0 | 1, value: boolean) => {
    setRevealedCards((current) =>
      cardIndex === 0 ? [value, current[1]] : [current[0], value],
    );
  }, []);

  const setCardTurning = useCallback(
    (cardIndex: 0 | 1, value: TurnDirection | null) => {
      setTurningCards((current) =>
        cardIndex === 0 ? [value, current[1]] : [current[0], value],
      );
    },
    [],
  );

  const bendToConceal = variantKey === "B" || variantKey === "C";
  const bothCorners = variantKey === "C";

  const setCardBendCorner = useCallback(
    (cardIndex: 0 | 1, value: BendCorner) => {
      setBendCorners((current) =>
        cardIndex === 0 ? [value, current[1]] : [current[0], value],
      );
    },
    [],
  );

  const resetTurnState = useCallback(() => {
    setTurningCards([null, null]);
  }, []);

  const cancelRevealAnimations = useCallback(() => {
    revealAnimationsRef.current.forEach((animation) => {
      animation?.stop();
    });
    revealAnimationsRef.current = [null, null];
    revealTokensRef.current[0] += 1;
    revealTokensRef.current[1] += 1;
    resetTurnState();
  }, [resetTurnState]);

  const clearGestureTimers = useCallback(() => {
    if (activeRef.current?.interruptTimer) {
      clearTimeout(activeRef.current.interruptTimer);
      activeRef.current.interruptTimer = null;
    }
  }, []);

  const settlePeek = useCallback(() => {
    animate(peekLeft, 0, { type: "spring", stiffness: 520, damping: 38 });
    animate(peekRight, 0, { type: "spring", stiffness: 520, damping: 38 });
    setPeekPercent(0);
  }, [peekLeft, peekRight]);

  const cancelInteraction = useCallback(
    (reason: string) => {
      clearGestureTimers();
      cancelRevealAnimations();
      activeRef.current = null;
      settlePeek();
      animate(pairY, 0, { type: "spring", stiffness: 480, damping: 36 });
      setRecognizer("idle");
      setLastEvent(reason);
    },
    [cancelRevealAnimations, clearGestureTimers, pairY, settlePeek],
  );

  const commitFold = useCallback(
    (source: "button" | "gesture") => {
      if (!legalFold || pendingAction !== null || mucked) {
        setLastEvent("Fold ignored: unavailable in this view");
        return;
      }
      clearGestureTimers();
      activeRef.current = null;
      settlePeek();
      setPendingAction("fold");
      setRecognizer("pending fold");
      setLastEvent(
        source === "gesture"
          ? "Fold sent on release; cards are temporarily in the muck"
          : "Fold button sent; cards are temporarily in the muck",
      );
      animate(pairY, -Math.max(window.innerHeight, 720), {
        duration: 0.28,
        ease: [0.2, 0.85, 0.25, 1],
      });
    },
    [clearGestureTimers, legalFold, mucked, pairY, pendingAction, settlePeek],
  );

  const sendCheck = useCallback(
    (source: "button" | "double-tap") => {
      if (!legalCheck || pendingAction !== null) {
        setLastEvent("Check ignored: unavailable in this view");
        return;
      }
      setLastEvent(
        source === "double-tap"
          ? "Check sent by double-tap"
          : "Check sent by button",
      );
      setRecognizer("idle");
    },
    [legalCheck, pendingAction],
  );

  const resetHand = useCallback(() => {
    cancelInteraction("New hand dealt face-down");
    pairY.set(0);
    setRevealedCards([false, false]);
    resetTurnState();
    setMucked(false);
    setPendingAction(null);
    setServerRevision((revision) => revision + 1);
  }, [cancelInteraction, pairY, resetTurnState]);

  const resolveFold = (resolution: "acknowledge" | "reject") => {
    if (pendingAction !== "fold") return;
    setPendingAction(null);
    setRecognizer("idle");
    if (resolution === "acknowledge") {
      setMucked(true);
      setLastEvent("Server acknowledged Fold; cards removed");
      return;
    }
    setMucked(false);
    setRevealedCards([false, false]);
    pairY.set(-Math.max(window.innerHeight, 720));
    animate(pairY, 0, { type: "spring", stiffness: 360, damping: 32 });
    setLastEvent("Server rejected Fold; cards returned face-down");
  };

  const setPeek = (cardIndex: 0 | 1, value: number) => {
    if (cardIndex === 0) {
      peekLeft.set(value);
    } else {
      peekRight.set(value);
    }
    setPeekPercent(Math.round(value * 100));
  };

  const finishTurn = (cardIndex: 0 | 1, direction: TurnDirection) => {
    const willReveal = direction === "revealing";
    const progress = cardIndex === 0 ? peekLeft : peekRight;
    const token = revealTokensRef.current[cardIndex] + 1;
    revealTokensRef.current[cardIndex] = token;
    setCardTurning(cardIndex, direction);
    setRecognizer(
      `turning card ${String(cardIndex + 1)} ${willReveal ? "face-up" : "face-down"}`,
    );

    const animation = animate(progress, 1, {
      duration: REVEAL_FINISH_MS / 1000,
      ease: [0.2, 0.72, 0.18, 1],
    });
    revealAnimationsRef.current[cardIndex] = animation;
    void animation.then(() => {
      if (revealTokensRef.current[cardIndex] !== token) return;
      revealAnimationsRef.current[cardIndex] = null;
      progress.set(0);
      setPeekPercent(0);
      setCardTurning(cardIndex, null);
      setCardRevealed(cardIndex, willReveal);
      setRecognizer("idle");
      setLastEvent(
        `Card ${String(cardIndex + 1)} finished turning and settled ${willReveal ? "face-up" : "face-down"}`,
      );
    });
  };

  const handleTap = (cardIndex: 0 | 1) => {
    const now = performance.now();
    const doubleTap = now - lastTapRef.current <= DOUBLE_TAP_MS;
    lastTapRef.current = now;
    if (doubleTap) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
      lastTapRef.current = 0;
      sendCheck("double-tap");
      return;
    }
    if (!bendToConceal && revealedCards[cardIndex]) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        setCardRevealed(cardIndex, false);
        setLastEvent(`Tap concealed card ${String(cardIndex + 1)}`);
        singleTapTimerRef.current = null;
      }, DOUBLE_TAP_MS);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pendingAction !== null || mucked || event.button !== 0) return;
    const target = event.target as HTMLElement;
    const cardElement = target.closest<HTMLElement>("[data-card-index]");
    const cardIndex = cardElement?.dataset.cardIndex === "1" ? 1 : 0;
    const bendZone = target.closest<HTMLElement>("[data-bend-corner]");
    const fromBendZone = bendZone !== null;
    const bendCorner: BendCorner =
      bendZone?.dataset.bendCorner === "TOP_LEFT" ? "TOP_LEFT" : "BOTTOM_RIGHT";
    if (fromBendZone) setCardBendCorner(cardIndex, bendCorner);
    event.currentTarget.setPointerCapture(event.pointerId);
    const gesture: ActiveGesture = {
      pointerId: event.pointerId,
      cardIndex,
      startX: event.clientX,
      startY: event.clientY,
      fromBendZone,
      bendCorner,
      startedRevealed: revealedCards[cardIndex],
      mode: "pressing",
      thresholdCrossed: false,
      interruptTimer: null,
    };
    activeRef.current = gesture;
    setRecognizer("pressing");

    if (interruptNext) {
      setInterruptNext(false);
      gesture.interruptTimer = setTimeout(() => {
        setServerRevision((revision) => revision + 1);
        cancelInteraction("Incoming server view cancelled the active gesture");
      }, 360);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = activeRef.current;
    if (active?.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    const distance = Math.hypot(dx, dy);

    if (active.mode === "pressing" && distance > MOVE_THRESHOLD) {
      if (active.fromBendZone && (!active.startedRevealed || bendToConceal)) {
        active.mode = "bending";
        const cornerLabel =
          active.bendCorner === "TOP_LEFT" ? "top-left" : "bottom-right";
        setRecognizer(
          `${active.startedRevealed ? "bending face to conceal" : "bending back to reveal"} from ${cornerLabel}`,
        );
      } else if (legalFold && dy < 0 && Math.abs(dy) > Math.abs(dx) * 1.05) {
        active.mode = "folding";
        setRecognizer("fold drag");
      } else {
        active.mode = "ignored";
        setRecognizer("movement ignored");
      }
    }

    if (active.mode === "bending") {
      const inward =
        active.bendCorner === "TOP_LEFT"
          ? Math.max(0, dx) + Math.max(0, dy)
          : Math.max(0, -dx) + Math.max(0, -dy);
      const progress = clamp(inward / 176);
      setPeek(active.cardIndex, progress);
      if (progress > REVEAL_THRESHOLD) {
        const direction: TurnDirection = active.startedRevealed
          ? "concealing"
          : "revealing";
        active.mode = "turning";
        finishTurn(active.cardIndex, direction);
        vibrate(10);
        setLastEvent(
          `${active.bendCorner === "TOP_LEFT" ? "Top-left" : "Bottom-right"} bend crossed 90%; card ${String(active.cardIndex + 1)} is finishing ${direction === "revealing" ? "face-up" : "face-down"}`,
        );
      }
      event.preventDefault();
    } else if (active.mode === "folding") {
      const nextY = Math.min(0, dy);
      pairY.set(nextY);
      const crossed = nextY <= FOLD_THRESHOLD;
      if (crossed && !active.thresholdCrossed) {
        vibrate(10);
        setLastEvent("Fold threshold crossed; release would commit");
      }
      active.thresholdCrossed = crossed;
      setRecognizer(crossed ? "fold armed" : "fold drag");
      event.preventDefault();
    }
  };

  const finishPointer = (
    event: React.PointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const active = activeRef.current;
    if (active?.pointerId !== event.pointerId) return;
    clearGestureTimers();
    activeRef.current = null;
    if (active.mode === "turning") return;
    if (cancelled) {
      settlePeek();
      animate(pairY, 0, { type: "spring", stiffness: 480, damping: 36 });
      setRecognizer("idle");
      setLastEvent("Pointer cancellation returned the cards safely");
      return;
    }
    if (active.mode === "bending") {
      settlePeek();
      setRecognizer("idle");
      setLastEvent("Temporary bend closed on release");
      return;
    }
    if (active.mode === "folding") {
      if (active.thresholdCrossed) {
        commitFold("gesture");
      } else {
        animate(pairY, 0, { type: "spring", stiffness: 480, damping: 36 });
        setRecognizer("idle");
        setLastEvent("Below-threshold Fold returned safely");
      }
      return;
    }
    if (active.mode === "pressing") {
      handleTap(active.cardIndex);
    }
    setRecognizer("idle");
  };

  useEffect(() => {
    return () => {
      clearGestureTimers();
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    };
  }, [clearGestureTimers]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey)
        return;
      if (event.key.toLowerCase() === "r") {
        setRevealedCards((current) => {
          const next = !(current[0] && current[1]);
          return [next, next];
        });
        setLastEvent("Keyboard R toggled persistent Reveal");
      }
      if (event.key.toLowerCase() === "p" && !revealedCards[0]) {
        setPeek(0, 0.78);
        setRecognizer("keyboard Peek");
      }
      if (event.key.toLowerCase() === "f") commitFold("button");
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "p") {
        settlePeek();
        setRecognizer("idle");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  });

  const chooseVariant = (key: string) => {
    const next: VariantKey = key === "C" ? "C" : key === "B" ? "B" : "A";
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
    cancelInteraction(`Switched to variant ${next}`);
    pairY.set(0);
    setPendingAction(null);
    setMucked(false);
    setRevealedCards([false, false]);
    setBendCorners(["BOTTOM_RIGHT", "BOTTOM_RIGHT"]);
    setVariantKey(next);
  };

  return (
    <div className="prototype-shell" data-variant={variantKey}>
      <header className="prototype-header">
        <div>
          <span>ISSUE 108 · THROWAWAY PROTOTYPE</span>
          <strong>Private cards</strong>
        </div>
        <button
          type="button"
          onClick={() => {
            setLabOpen((open) => !open);
          }}
        >
          {labOpen ? "Close lab" : "Test lab"}
        </button>
      </header>

      <main className="prototype-main">
        <section className="prototype-turn-banner">
          <span />
          <div>
            <small>Your turn</small>
            <strong>Choose your Action</strong>
          </div>
          <output>view {serverRevision}</output>
        </section>

        <section className="prototype-card-stage">
          <div className="prototype-threshold" aria-hidden="true">
            <span>release to fold</span>
          </div>
          {mucked ? (
            <div className="prototype-mucked">
              <strong>Cards in the muck</strong>
              <span>Fold acknowledged</span>
            </div>
          ) : (
            <motion.div
              className="prototype-card-pair prototype-layout-side-by-side"
              style={{ y: pairY }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(event) => {
                finishPointer(event, false);
              }}
              onPointerCancel={(event) => {
                finishPointer(event, true);
              }}
              onLostPointerCapture={(event) => {
                if (activeRef.current?.pointerId === event.pointerId) {
                  finishPointer(event, true);
                }
              }}
            >
              <GestureCard
                cardIndex={0}
                progress={peekLeft}
                revealed={revealedCards[0]}
                turning={turningCards[0]}
                bendToConceal={bendToConceal}
                bendCorner={bendCorners[0]}
                bothCorners={bothCorners}
                rank="A"
                suit="♠"
              />
              <GestureCard
                cardIndex={1}
                progress={peekRight}
                revealed={revealedCards[1]}
                turning={turningCards[1]}
                bendToConceal={bendToConceal}
                bendCorner={bendCorners[1]}
                bothCorners={bothCorners}
                rank="K"
                suit="♥"
              />
            </motion.div>
          )}
          <p className="prototype-coaching">{COACHING[variantKey]}</p>
          <div className="prototype-readout" aria-live="polite">
            <span>{recognizer}</span>
            <span>
              {turningCards[0] || turningCards[1]
                ? `${String(turningCards[0] ?? turningCards[1])} ${turningCards[0] ? "A" : ""}${turningCards[1] ? "K" : ""}`
                : revealedCards[0] || revealedCards[1]
                  ? `revealed ${revealedCards[0] ? "A" : ""}${revealedCards[1] ? "K" : ""}`
                  : `peek ${String(peekPercent)}%`}
            </span>
            <span>
              {pendingAction ? `${pendingAction} pending` : "no Action pending"}
            </span>
          </div>
        </section>

        <section className="prototype-actions" aria-label="Poker actions">
          <button
            type="button"
            className="action-fold"
            disabled={!legalFold || pendingAction !== null}
            onClick={() => {
              commitFold("button");
            }}
          >
            <strong>Fold</strong>
            <span>muck</span>
          </button>
          <button
            type="button"
            disabled={!legalCheck || pendingAction !== null}
            onClick={() => {
              sendCheck("button");
            }}
          >
            <strong>Check</strong>
            <span>no bet</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLastEvent("Call sent by button");
            }}
          >
            <strong>Call</strong>
            <span>match</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLastEvent("Raise sent by button");
            }}
          >
            <strong>Raise</strong>
            <span>put in more</span>
          </button>
        </section>
      </main>

      {labOpen && (
        <aside className="prototype-lab" aria-label="Prototype test controls">
          <div className="prototype-lab-heading">
            <div>
              <small>Full relevant state</small>
              <strong>{lastEvent}</strong>
            </div>
            <button type="button" onClick={resetHand}>
              New hand
            </button>
          </div>
          <dl>
            <div>
              <dt>Reveal</dt>
              <dd>bend &gt; 90%</dd>
            </div>
            <div>
              <dt>Bend</dt>
              <dd>single-sheet curl</dd>
            </div>
            <div>
              <dt>Corners</dt>
              <dd>
                {bothCorners ? "top-left + bottom-right" : "bottom-right"}
              </dd>
            </div>
            <div>
              <dt>Conceal</dt>
              <dd>{bendToConceal ? "bend > 90%" : "tap"}</dd>
            </div>
            <div>
              <dt>Layout</dt>
              <dd>side-by-side</dd>
            </div>
          </dl>
          <label>
            <input
              type="checkbox"
              checked={legalFold}
              onChange={(event) => {
                setLegalFold(event.target.checked);
              }}
            />
            Fold legal
          </label>
          <label>
            <input
              type="checkbox"
              checked={legalCheck}
              onChange={(event) => {
                setLegalCheck(event.target.checked);
              }}
            />
            Check legal
          </label>
          <label>
            <input
              type="checkbox"
              checked={interruptNext}
              onChange={(event) => {
                setInterruptNext(event.target.checked);
              }}
            />
            Server view interrupts next gesture
          </label>
          <div className="prototype-lab-buttons">
            <button
              type="button"
              onClick={() => {
                cancelInteraction(
                  "Manual pointer cancellation returned the cards",
                );
              }}
            >
              Cancel now
            </button>
            <button
              type="button"
              disabled={pendingAction !== "fold"}
              onClick={() => {
                resolveFold("acknowledge");
              }}
            >
              Ack Fold
            </button>
            <button
              type="button"
              disabled={pendingAction !== "fold"}
              onClick={() => {
                resolveFold("reject");
              }}
            >
              Reject Fold
            </button>
          </div>
          <p>
            Desktop fallback: R Reveal · hold P Peek · F Fold · mouse gestures
            work too.
          </p>
        </aside>
      )}

      {import.meta.env.DEV && (
        <PrototypeSwitcher
          variants={VARIANTS}
          current={variantKey}
          onChange={chooseVariant}
        />
      )}
    </div>
  );
}
