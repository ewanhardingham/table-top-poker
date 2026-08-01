/**
 * PROTOTYPE ONLY — Option B card gestures are locked; ?variant=A|B|C
 * switches between Check confirmation treatments on one dev-only route.
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
type CoachingGesture = "reveal" | "conceal" | "check" | "fold";
type CoachingProgress = Record<CoachingGesture, boolean>;

const VARIANTS = [
  { key: "A", name: "Check cue · banner" },
  { key: "B", name: "Check cue · card stamp" },
  { key: "C", name: "Check cue · action status" },
] as const;

const MIN_FOLD_DISTANCE = 148;
const FOLD_DISTANCE_RATIO = 0.18;
const CHECK_FEEDBACK_DURATION_MS = 2400;
const MOVE_THRESHOLD = 9;
const DOUBLE_TAP_MS = 280;
const REVEAL_THRESHOLD = 0.9;
const REVEAL_FINISH_MS = 520;
const INITIAL_COACHING_PROGRESS: CoachingProgress = {
  reveal: false,
  conceal: false,
  check: false,
  fold: false,
};

interface ActiveGesture {
  readonly pointerId: number;
  readonly cardIndex: 0 | 1;
  readonly startX: number;
  readonly startY: number;
  readonly fromBendZone: boolean;
  readonly startedRevealed: boolean;
  mode: "pressing" | "bending" | "turning" | "folding" | "ignored";
  thresholdCrossed: boolean;
  interruptTimer: ReturnType<typeof setTimeout> | null;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function foldThreshold() {
  return -Math.max(
    MIN_FOLD_DISTANCE,
    Math.round(window.innerHeight * FOLD_DISTANCE_RATIO),
  );
}

function vibrate(duration: number) {
  const vibration = Reflect.get(navigator, "vibrate") as unknown;
  if (typeof vibration === "function") {
    try {
      Reflect.apply(vibration, navigator, [duration]);
    } catch {
      // Vibration is optional; unsupported or rejected requests are ignored.
    }
  }
}

function initialVariant(): VariantKey {
  const candidate = new URLSearchParams(window.location.search).get("variant");
  return candidate === "A" || candidate === "C" ? candidate : "B";
}

function PokerFace({
  rank,
  suit,
  curlUnderside = false,
}: {
  readonly rank: string;
  readonly suit: string;
  readonly curlUnderside?: boolean;
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
      {curlUnderside && (
        <span className="gesture-card-curl-index">
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
  rank,
  suit,
}: {
  readonly progress: MotionValue<number>;
  readonly revealed: boolean;
  readonly rank: string;
  readonly suit: string;
}) {
  const peelRef = useRef<PeelRef>(null);

  useEffect(() => {
    const position = (value: number) => {
      if (value <= REVEAL_THRESHOLD) {
        const inset = value * 142;
        peelRef.current?.setPeelPosition(164 - inset, 228 - inset);
        return;
      }

      // The drag uses the gentle diagonal curl that tested well. Once armed,
      // carry that same sheet beyond the opposite corner so it completes the
      // turn before the flat face replaces it.
      const finish = clamp((value - REVEAL_THRESHOLD) / (1 - REVEAL_THRESHOLD));
      const thresholdInset = REVEAL_THRESHOLD * 142;
      const thresholdX = 164 - thresholdInset;
      const thresholdY = 228 - thresholdInset;
      peelRef.current?.setPeelPosition(
        thresholdX + (-164 - thresholdX) * finish,
        thresholdY + (-228 - thresholdY) * finish,
      );
    };
    position(progress.get());
    return progress.on("change", position);
  }, [progress]);

  if (revealed) {
    return (
      <div className="gesture-card-surface gesture-card-fully-revealed">
        <PokerFace rank={rank} suit={suit} />
      </div>
    );
  }

  return (
    <div className="gesture-card-surface gesture-card-library-surface">
      <PeelWrapper
        ref={peelRef}
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
          <CardBack />
        </PeelTop>
        <PeelBack>
          <PokerFace rank={rank} suit={suit} curlUnderside />
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
  rank,
  suit,
}: {
  readonly cardIndex: 0 | 1;
  readonly progress: MotionValue<number>;
  readonly revealed: boolean;
  readonly turning: TurnDirection | null;
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
        rank={rank}
        suit={suit}
      />
      {!revealed && !turning && (
        <span
          className="gesture-card-bend-zone"
          data-bend-zone="true"
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
  const [checkFeedback, setCheckFeedback] = useState(false);
  const [coachingProgress, setCoachingProgress] = useState<CoachingProgress>(
    INITIAL_COACHING_PROGRESS,
  );

  const peekLeft = useMotionValue(0);
  const peekRight = useMotionValue(0);
  const pairY = useMotionValue(0);
  const activeRef = useRef<ActiveGesture | null>(null);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastTapRef = useRef(0);
  const revealAnimationsRef = useRef<
    [{ stop: () => void } | null, { stop: () => void } | null]
  >([null, null]);
  const revealTokensRef = useRef<[number, number]>([0, 0]);

  const markCoachingDiscovered = useCallback((gesture: CoachingGesture) => {
    setCoachingProgress((current) =>
      current[gesture] ? current : { ...current, [gesture]: true },
    );
  }, []);

  const setCardsRevealed = useCallback(
    (cardIndices: readonly (0 | 1)[], value: boolean) => {
      setRevealedCards(
        (current) =>
          [
            cardIndices.includes(0) ? value : current[0],
            cardIndices.includes(1) ? value : current[1],
          ] as const,
      );
    },
    [],
  );

  const setCardsTurning = useCallback(
    (cardIndices: readonly (0 | 1)[], value: TurnDirection | null) => {
      setTurningCards(
        (current) =>
          [
            cardIndices.includes(0) ? value : current[0],
            cardIndices.includes(1) ? value : current[1],
          ] as const,
      );
    },
    [],
  );

  const showCheckFeedback = useCallback(() => {
    if (checkFeedbackTimerRef.current) {
      clearTimeout(checkFeedbackTimerRef.current);
    }
    setCheckFeedback(true);
    checkFeedbackTimerRef.current = setTimeout(() => {
      setCheckFeedback(false);
      checkFeedbackTimerRef.current = null;
    }, CHECK_FEEDBACK_DURATION_MS);
  }, []);

  const clearCheckFeedback = useCallback(() => {
    if (checkFeedbackTimerRef.current) {
      clearTimeout(checkFeedbackTimerRef.current);
      checkFeedbackTimerRef.current = null;
    }
    setCheckFeedback(false);
  }, []);

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
      if (source === "gesture") markCoachingDiscovered("fold");
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
    [
      clearGestureTimers,
      legalFold,
      markCoachingDiscovered,
      mucked,
      pairY,
      pendingAction,
      settlePeek,
    ],
  );

  const sendCheck = useCallback(() => {
    if (!legalCheck || pendingAction !== null) {
      setLastEvent("Check ignored: unavailable in this view");
      return;
    }
    setLastEvent("Check sent by double-tap");
    markCoachingDiscovered("check");
    showCheckFeedback();
    setRecognizer("idle");
  }, [legalCheck, markCoachingDiscovered, pendingAction, showCheckFeedback]);

  const resetHand = useCallback(() => {
    cancelInteraction("New hand dealt face-down");
    pairY.set(0);
    setRevealedCards([false, false]);
    resetTurnState();
    clearCheckFeedback();
    setMucked(false);
    setPendingAction(null);
    setServerRevision((revision) => revision + 1);
  }, [cancelInteraction, clearCheckFeedback, pairY, resetTurnState]);

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

  const setGesturePeek = (value: number) => {
    peekLeft.set(value);
    peekRight.set(value);
    setPeekPercent(Math.round(value * 100));
  };

  const finishTurn = (
    cardIndex: 0 | 1,
    direction: TurnDirection,
    turnBothCards = false,
  ) => {
    const willReveal = direction === "revealing";
    const cardIndices: readonly (0 | 1)[] = turnBothCards
      ? [0, 1]
      : [cardIndex];
    const tokens: [number, number] = [...revealTokensRef.current];
    cardIndices.forEach((index) => {
      const token = revealTokensRef.current[index] + 1;
      revealTokensRef.current[index] = token;
      tokens[index] = token;
    });
    setCardsTurning(cardIndices, direction);
    setRecognizer(
      turnBothCards
        ? `turning both cards ${willReveal ? "face-up" : "face-down"}`
        : `turning card ${String(cardIndex + 1)} ${willReveal ? "face-up" : "face-down"}`,
    );

    const animations: [
      { stop: () => void } | null,
      { stop: () => void } | null,
    ] = [null, null];
    const completions: Promise<unknown>[] = [];
    cardIndices.forEach((index) => {
      const progress = index === 0 ? peekLeft : peekRight;
      const animation = animate(progress, 1, {
        duration: REVEAL_FINISH_MS / 1000,
        ease: [0.2, 0.72, 0.18, 1],
      });
      animations[index] = animation;
      completions.push(animation.then(() => undefined));
    });
    revealAnimationsRef.current = animations;
    void Promise.all(completions).then(() => {
      if (
        cardIndices.some(
          (index) => revealTokensRef.current[index] !== tokens[index],
        )
      ) {
        return;
      }
      revealAnimationsRef.current = [null, null];
      cardIndices.forEach((index) => {
        const progress = index === 0 ? peekLeft : peekRight;
        progress.set(0);
      });
      setPeekPercent(0);
      setCardsTurning(cardIndices, null);
      setCardsRevealed(cardIndices, willReveal);
      markCoachingDiscovered(willReveal ? "reveal" : "conceal");
      setRecognizer("idle");
      setLastEvent(
        turnBothCards
          ? `Both cards finished turning and settled ${willReveal ? "face-up" : "face-down"}`
          : `Card ${String(cardIndex + 1)} finished turning and settled ${willReveal ? "face-up" : "face-down"}`,
      );
    });
  };

  const handleTap = () => {
    const now = performance.now();
    const doubleTap = now - lastTapRef.current <= DOUBLE_TAP_MS;
    lastTapRef.current = now;
    if (doubleTap) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = null;
      lastTapRef.current = 0;
      sendCheck();
      return;
    }
    const canConceal = revealedCards[0] || revealedCards[1];
    if (canConceal) {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        setRevealedCards([false, false]);
        markCoachingDiscovered("conceal");
        setLastEvent("Tap concealed both cards");
        singleTapTimerRef.current = null;
      }, DOUBLE_TAP_MS);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pendingAction !== null || mucked || event.button !== 0) return;
    const target = event.target as HTMLElement;
    const cardElement = target.closest<HTMLElement>("[data-card-index]");
    const cardIndex = cardElement?.dataset.cardIndex === "1" ? 1 : 0;
    const bendZone = target.closest<HTMLElement>("[data-bend-zone]");
    const fromBendZone = bendZone !== null;
    event.currentTarget.setPointerCapture(event.pointerId);
    const gesture: ActiveGesture = {
      pointerId: event.pointerId,
      cardIndex,
      startX: event.clientX,
      startY: event.clientY,
      fromBendZone,
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
      if (active.fromBendZone && !active.startedRevealed) {
        active.mode = "bending";
        setRecognizer("bending back to reveal from bottom-right");
      } else if (legalFold && dy < 0 && Math.abs(dy) > Math.abs(dx) * 1.05) {
        active.mode = "folding";
        setRecognizer("fold drag");
      } else {
        active.mode = "ignored";
        setRecognizer("movement ignored");
      }
    }

    if (active.mode === "bending") {
      const inward = Math.max(0, -dx) + Math.max(0, -dy);
      const progress = clamp(inward / 176);
      setGesturePeek(progress);
      if (progress > REVEAL_THRESHOLD) {
        const direction: TurnDirection = "revealing";
        active.mode = "turning";
        finishTurn(active.cardIndex, direction, true);
        vibrate(10);
        setLastEvent(
          "Bottom-right bend crossed 90%; both cards are finishing face-up",
        );
      }
      event.preventDefault();
    } else if (active.mode === "folding") {
      const nextY = Math.min(0, dy);
      pairY.set(nextY);
      const crossed = nextY <= foldThreshold();
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
      handleTap();
    }
    setRecognizer("idle");
  };

  useEffect(() => {
    return () => {
      clearGestureTimers();
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      if (checkFeedbackTimerRef.current) {
        clearTimeout(checkFeedbackTimerRef.current);
      }
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
        setGesturePeek(0.78);
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
    const next: VariantKey = key === "A" || key === "C" ? key : "B";
    const url = new URL(window.location.href);
    url.searchParams.set("variant", next);
    window.history.replaceState(null, "", url);
    cancelInteraction(`Switched to variant ${next}`);
    pairY.set(0);
    setPendingAction(null);
    setMucked(false);
    clearCheckFeedback();
    setRevealedCards([false, false]);
    setVariantKey(next);
  };

  const coachingHint = (() => {
    if (mucked || pendingAction !== null) return null;

    if (recognizer === "fold armed") {
      return {
        gesture: "fold" as const,
        text: "Release to Fold",
        detail: "threshold armed",
      };
    }
    if (recognizer === "fold drag") {
      return {
        gesture: "fold" as const,
        text: "Keep dragging up",
        detail: "release when Fold is armed",
      };
    }
    if (recognizer === "bending back to reveal from bottom-right") {
      return {
        gesture: "reveal" as const,
        text: peekPercent >= 90 ? "Finishing reveal" : "Release to peek",
        detail:
          peekPercent >= 90
            ? "both cards are turning"
            : "keep bending to reveal both cards",
      };
    }
    if (recognizer.startsWith("turning both cards")) return null;

    if (!coachingProgress.reveal) {
      return {
        gesture: "reveal" as const,
        text: "Bend the bottom-right corner",
        detail: "release to peek · keep bending to reveal",
      };
    }
    if (revealedCards[0] || revealedCards[1]) {
      if (!coachingProgress.conceal) {
        return {
          gesture: "conceal" as const,
          text: "Tap the cards to conceal",
          detail: "double-tap instead to Check",
        };
      }
    }
    if (!coachingProgress.check && legalCheck) {
      return {
        gesture: "check" as const,
        text: "Double-tap the cards",
        detail: "sends Check when legal",
      };
    }
    if (!coachingProgress.fold && legalFold) {
      return {
        gesture: "fold" as const,
        text: "Swipe up on the cards",
        detail: "release when Fold is armed",
      };
    }
    return null;
  })();
  const coachingDiscoveredCount =
    Object.values(coachingProgress).filter(Boolean).length;

  return (
    <div className="prototype-shell" data-variant={variantKey}>
      <header className="prototype-header">
        <div>
          <span>ISSUE 108 · THROWAWAY PROTOTYPE</span>
          <strong>Private cards · B gestures locked</strong>
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
          {checkFeedback && variantKey === "A" ? (
            <div
              className="prototype-check-cue prototype-check-cue-banner"
              role="status"
            >
              <span aria-hidden="true">✓</span>
              <strong>Checked</strong>
            </div>
          ) : (
            <output>view {serverRevision}</output>
          )}
        </section>

        <section className="prototype-card-stage">
          {checkFeedback && variantKey === "B" && (
            <div
              className="prototype-check-cue prototype-check-cue-card"
              role="status"
            >
              <span aria-hidden="true">✓</span>
              <strong>CHECKED</strong>
            </div>
          )}
          {mucked ? (
            <div className="prototype-mucked">
              <strong>Cards in the muck</strong>
              <span>Fold acknowledged</span>
            </div>
          ) : (
            <motion.div
              className="prototype-card-pair prototype-layout-overlap"
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
                rank="A"
                suit="♠"
              />
              <GestureCard
                cardIndex={1}
                progress={peekRight}
                revealed={revealedCards[1]}
                turning={turningCards[1]}
                rank="K"
                suit="♥"
              />
            </motion.div>
          )}
          <p
            className={`prototype-coaching${coachingHint ? "" : " is-hidden"}`}
            data-coaching={coachingHint?.gesture}
            aria-live="polite"
          >
            {coachingHint && (
              <>
                <strong>{coachingHint.text}</strong>
                <small>{coachingHint.detail}</small>
              </>
            )}
          </p>
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
            <span>coaching {String(coachingDiscoveredCount)}/4</span>
          </div>
        </section>

        <section className="prototype-actions" aria-label="Poker actions">
          {checkFeedback && variantKey === "C" && (
            <div
              className="prototype-check-cue prototype-check-cue-actions"
              role="status"
            >
              <strong>Check registered</strong>
              <small>double tap</small>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setLastEvent("Call sent by button");
            }}
          >
            Call
          </button>
          <button
            type="button"
            onClick={() => {
              setLastEvent("Raise sent by button");
            }}
          >
            Raise
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
              <dd>bend &gt; 90% (both cards)</dd>
            </div>
            <div>
              <dt>Bend</dt>
              <dd>single-sheet curl</dd>
            </div>
            <div>
              <dt>Conceal</dt>
              <dd>tap pair</dd>
            </div>
            <div>
              <dt>Layout</dt>
              <dd>overlapping</dd>
            </div>
            <div>
              <dt>Check cue</dt>
              <dd>
                {variantKey === "A"
                  ? "banner"
                  : variantKey === "B"
                    ? "card stamp"
                    : "action status"}
              </dd>
            </div>
            <div>
              <dt>Coaching</dt>
              <dd>{String(coachingDiscoveredCount)}/4 discovered</dd>
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
            Desktop fallback: R Reveal · hold P Peek · F Fold · double-tap to
            Check · mouse gestures work too.
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
