import type { Card } from "@table-top-poker/protocol";
import { playRevealFlip } from "@table-top-poker/ui-shared";
import { animate, useMotionValue, type MotionValue } from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  initialCardState,
  reduce,
  revealPublishes,
  type CardEvent,
  type CardState,
} from "./cardState.js";
import {
  discoveredBy,
  nextTeachable,
  type TeachableGesture,
} from "./coaching.js";
import {
  CHECK_CONFIRM_MS,
  CLICK_DISOWN_MS,
  FOLD_FLIGHT_MS,
  HAPTIC_PULSE_MS,
  HINT_QUIET_MS,
  REVEAL_FINISH_MS,
} from "./constants.js";
import {
  foldFlightDistance,
  foldThreshold,
  type BendAxis,
} from "./geometry.js";
import {
  applyCardEvent,
  beginGesture,
  endGesture,
  moveGesture,
  type GestureSession,
} from "./gesture.js";
import { planFinish } from "./finishPlan.js";
import { pulse } from "./haptics.js";
import { loadDiscovered, saveDiscovered } from "./hintStorage.js";
import type { HoleCardPairProps } from "./HoleCardPair.js";
import type { TapWindow } from "./taps.js";
import { eventsForPropChange, eventsForVisibility } from "./viewEvents.js";

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface PairHandlers {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onLostPointerCapture: (
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
}

export interface HoleCards {
  readonly state: CardState;
  readonly activate: () => void;
  readonly handlers: PairHandlers;
  readonly bend: MotionValue<number>;
  readonly bendAxis: MotionValue<BendAxis>;
  readonly foldOffset: MotionValue<number>;
  readonly foldFade: MotionValue<number>;
  readonly leavingFaceUp: boolean;
  readonly departing: readonly [Card, Card] | null;
  readonly checkConfirmed: boolean;
  readonly quiet: boolean;
  readonly coarsePointer: boolean;
  readonly discovered: ReadonlySet<TeachableGesture>;
}

function localStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function coarsePointerQuery(): MediaQueryList | null {
  if (typeof window === "undefined") return null;
  return window.matchMedia("(pointer: coarse)");
}

const RETURN_SPRING = { type: "spring", stiffness: 480, damping: 36 } as const;

export function useHoleCards(props: HoleCardPairProps): HoleCards {
  const [state, dispatch] = useReducer(reduce, props, (initial) =>
    initialCardState({
      hasCards: initial.cards !== null,
      locked: initial.locked,
      sealed: initial.sealed,
    }),
  );

  const bend = useMotionValue(0);
  const bendAxis = useMotionValue<BendAxis>("left");
  const foldOffset = useMotionValue(0);
  const foldFade = useMotionValue(1);
  const session = useRef<GestureSession | null>(null);
  const [leavingFaceUp, setLeavingFaceUp] = useState(false);
  const [departing, setDeparting] = useState<readonly [Card, Card] | null>(
    null,
  );
  const disownClicksUntil = useRef(0);
  const tapWindow = useRef<TapWindow>(null);
  const [checkConfirmedAt, setCheckConfirmedAt] = useState<number | null>(null);
  const [discovered, setDiscovered] = useState<ReadonlySet<TeachableGesture>>(
    () => {
      const storage = localStorageOrNull();
      return storage === null ? new Set() : loadDiscovered(storage);
    },
  );
  const pointersDown = useRef<Set<number>>(new Set());
  const [contact, setContact] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(
    () => coarsePointerQuery()?.matches ?? false,
  );

  const previous = useRef(props);
  useIsomorphicLayoutEffect(() => {
    const events = eventsForPropChange(previous.current, props, state);
    previous.current = props;
    for (const event of events) {
      session.current = applyCardEvent(session.current, event);
      dispatch(event);
    }
  });

  useEffect(() => {
    if (state.presentation !== "Turning") return;
    const peel = animate(bend, 1, {
      duration: REVEAL_FINISH_MS / 1000,
      ease: [0.32, 0.72, 0.3, 1],
    });
    const timer = setTimeout(() => {
      dispatch({ type: "TURN_FINISHED" });
    }, REVEAL_FINISH_MS);
    return () => {
      peel.stop();
      clearTimeout(timer);
    };
  }, [state.presentation, bend]);

  useEffect(() => {
    if (
      state.presentation === "FaceDown" ||
      state.presentation === "Revealed"
    ) {
      bend.set(0);
    }
  }, [state.presentation, bend]);

  const latestActions = useRef(props.actions);
  latestActions.current = props.actions;

  const prevPresentation = useRef(state.presentation);
  useEffect(() => {
    const from = prevPresentation.current;
    const to = state.presentation;
    prevPresentation.current = to;
    if (to === "Turning" || (from === "Revealed" && to === "FaceDown")) {
      playRevealFlip();
    }
    if (revealPublishes(from, to, latestActions.current.showLegal)) {
      latestActions.current.show();
    }
  }, [state.presentation]);

  const inFlight =
    state.presentation === "Leaving" ||
    (departing !== null && state.presentation === "Absent");

  useEffect(() => {
    if (!inFlight) return;
    const seconds = FOLD_FLIGHT_MS / 1000;
    const flight = animate(
      foldOffset,
      -foldFlightDistance(window.innerHeight),
      {
        duration: seconds,
        ease: [0.4, 0, 1, 1],
      },
    );
    const fade = animate(foldFade, 0, { duration: seconds, ease: "linear" });
    return () => {
      flight.stop();
      fade.stop();
    };
  }, [inFlight, foldOffset, foldFade]);

  useEffect(() => {
    if (inFlight) return;

    if (state.presentation === "Absent") {
      foldOffset.set(0);
      foldFade.set(1);
      return;
    }

    if (state.recognizer !== "Idle") return;
    if (foldOffset.get() === 0 && foldFade.get() === 1) return;
    const home = animate(foldOffset, 0, RETURN_SPRING);
    const restore = animate(foldFade, 1, RETURN_SPRING);
    return () => {
      home.stop();
      restore.stop();
    };
  }, [inFlight, state.presentation, state.recognizer, foldOffset, foldFade]);

  useEffect(() => {
    if (departing === null) return;
    const timer = setTimeout(() => {
      setDeparting(null);
    }, FOLD_FLIGHT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [departing]);

  useEffect(() => {
    const onVisibilityChange = () => {
      for (const event of eventsForVisibility(document.visibilityState)) {
        dispatch(event);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (checkConfirmedAt === null) return;
    const timer = setTimeout(() => {
      setCheckConfirmedAt(null);
    }, CHECK_CONFIRM_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [checkConfirmedAt]);

  const teachable = nextTeachable(state, discovered, props.actions);

  useEffect(() => {
    setQuiet(false);
    if (contact) return;
    const timer = setTimeout(() => {
      setQuiet(true);
    }, HINT_QUIET_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [contact, teachable]);

  useEffect(() => {
    const query = coarsePointerQuery();
    if (query === null) return;
    const onChange = (event: MediaQueryListEvent) => {
      setCoarsePointer(event.matches);
    };
    setCoarsePointer(query.matches);
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  const dispatchFromPointer = (event: CardEvent): void => {
    const found = discoveredBy(event, state);
    if (found !== null && !discovered.has(found)) {
      const next = new Set(discovered).add(found);
      const storage = localStorageOrNull();
      if (storage !== null) saveDiscovered(storage, next);
      setDiscovered(next);
    }
    dispatch(event);
  };

  const activate = useCallback(() => {
    if (Date.now() < disownClicksUntil.current) return;
    dispatch({ type: "ACTIVATED" });
  }, []);

  const finish = (
    event: ReactPointerEvent<HTMLElement>,
    cancelled: boolean,
  ): void => {
    const active = session.current;
    if (active?.pointerId !== event.pointerId) return;
    session.current = null;
    disownClicksUntil.current = Date.now() + CLICK_DISOWN_MS;
    if (!active.crossed) bend.set(0);
    const plan = planFinish({
      end: endGesture(active, { cancelled }),
      actions: props.actions,
      presentation: state.presentation,
      tapWindow: tapWindow.current,
      now: performance.now(),
    });
    tapWindow.current = plan.nextTapWindow;
    if (plan.leaving !== null) {
      setLeavingFaceUp(plan.leaving.faceUp);
      setDeparting(props.cards);
    }
    for (const effect of plan.effects) {
      if (effect.kind === "dispatch") {
        dispatchFromPointer(effect.event);
      } else if (effect.action === "check") {
        props.actions.check();
      } else {
        props.actions.fold();
      }
    }
    if (plan.confirmCheck) setCheckConfirmedAt(Date.now());
  };

  const contacted = (event: ReactPointerEvent<HTMLElement>): void => {
    pointersDown.current.add(event.pointerId);
    setContact(true);
    setQuiet(false);
  };

  const released = (event: ReactPointerEvent<HTMLElement>): void => {
    pointersDown.current.delete(event.pointerId);
    if (pointersDown.current.size === 0) setContact(false);
  };

  const handlers: PairHandlers = {
    onPointerDown: (event) => {
      contacted(event);
      if (session.current !== null || event.button !== 0) return;
      if (state.locked) return;
      if (state.presentation === "Absent" || state.presentation === "Leaving") {
        return;
      }
      const target = event.target as HTMLElement;
      event.currentTarget.setPointerCapture(event.pointerId);
      session.current = beginGesture({
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        fromBendZone: target.closest("[data-bend-zone]") !== null,
        startedRevealed: state.presentation === "Revealed",
      });
      dispatch({ type: "PRESSED" });
    },

    onPointerMove: (event) => {
      const active = session.current;
      if (active?.pointerId !== event.pointerId) return;
      const step = moveGesture(
        active,
        { x: event.clientX, y: event.clientY },
        {
          foldLegal: props.actions.foldLegal,
          foldThresholdPx: foldThreshold(window.innerHeight),
        },
      );
      session.current = step.session;
      if (step.bend !== null) {
        bend.set(step.bend.progress);
        bendAxis.set(step.bend.axis);
      }
      if (step.fold !== null) foldOffset.set(step.fold.offset);
      if (step.session.classification !== null) event.preventDefault();
      for (const cardEvent of step.events) {
        if (cardEvent.type === "FOLD_ARMED") pulse(HAPTIC_PULSE_MS);
        dispatchFromPointer(cardEvent);
      }
    },

    onPointerUp: (event) => {
      released(event);
      finish(event, false);
    },
    onPointerCancel: (event) => {
      released(event);
      finish(event, true);
    },
    onLostPointerCapture: (event) => {
      released(event);
      finish(event, true);
    },
  };

  return {
    state,
    activate,
    handlers,
    bend,
    bendAxis,
    foldOffset,
    foldFade,
    leavingFaceUp,
    departing,
    checkConfirmed: checkConfirmedAt !== null,
    quiet,
    coarsePointer,
    discovered,
  };
}
