import type { Card } from "@table-top-poker/protocol";
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
import { initialCardState, reduce, type CardState } from "./cardState.js";
import {
  CHECK_CONFIRM_MS,
  CLICK_DISOWN_MS,
  FOLD_FLIGHT_MS,
  HAPTIC_PULSE_MS,
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
// PROTOTYPE (#181): tactile sound layer, throwaway. Remove with the branch.
import { playRevealFlip } from "../prototype-sound/prototypeAudio.js";
import type { HoleCardPairProps } from "./HoleCardPair.js";
import type { TapWindow } from "./taps.js";
import { eventsForPropChange, eventsForVisibility } from "./viewEvents.js";

/**
 * `useLayoutEffect` warns when it is called during server rendering, and the
 * component tests render to static markup — where no effect runs either way.
 */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The pointer handlers the pair binds. */
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
  /** Keyboard and mouse activation: Enter, Space or a click (§12). */
  readonly activate: () => void;
  readonly handlers: PairHandlers;
  /** Peel progress, 0 → 1. Never React state (§13). */
  readonly bend: MotionValue<number>;
  /** Which way the live bend is going, for the §11 second-line swap. */
  readonly bendAxis: MotionValue<BendAxis>;
  /** How far the pair has been carried towards the muck, in px. Never state. */
  readonly foldOffset: MotionValue<number>;
  /** The pair fading out on its way to the muck, 1 → 0. */
  readonly foldFade: MotionValue<number>;
  /**
   * Whether the pair was face-up at the moment the Fold committed. Only
   * meaningful while it is departing: the cards leave with whatever face they
   * had (§7), and once the reducer is in `Leaving` the presentation they left
   * from is no longer recoverable from the state.
   */
  readonly leavingFaceUp: boolean;
  /**
   * The committed pair for as long as its flight is still running, or `null`.
   *
   * The flight is **fire-and-forget, on its own ~280ms schedule and not gated
   * on the round trip** (§7) — which cuts *both* ways. On a LAN the
   * acknowledgement lands tens of milliseconds in and takes `cards` away with
   * it, so without this the departure the player was promised would be a blink
   * (story 20). The pair renders from here once the props no longer carry it.
   */
  readonly departing: readonly [Card, Card] | null;
  /** A gesture Check landed and is still being confirmed (story 31). */
  readonly checkConfirmed: boolean;
}

/**
 * A spring rather than a duration: the cards were being *carried*, and letting
 * go of something you are carrying has weight and a little overshoot.
 */
const RETURN_SPRING = { type: "spring", stiffness: 480, damping: 36 } as const;

/**
 * Binds the pure lifecycle to React: prop changes and pointer events in,
 * discrete state out. Every decision it makes is delegated —
 * `eventsForPropChange` decides what a changed prop means, `moveGesture`
 * decides what a finger is doing, `reduce` decides what either means for the
 * pair — so the hook itself holds no rules worth testing through a renderer.
 *
 * The split it exists to enforce is §13's: discrete states go through
 * `useReducer`, a handful of times per hand; continuous values are
 * `MotionValue`s written straight from the pointer handlers. Between threshold
 * crossings a drag dispatches nothing, so it re-renders nothing — not this
 * component, and not `Hand`, `ActionBar` or the turn banner above it.
 */
export function useHoleCards(props: HoleCardPairProps): HoleCards {
  const [state, dispatch] = useReducer(reduce, props, (initial) =>
    initialCardState({
      hasCards: initial.cards !== null,
      locked: initial.locked,
    }),
  );

  const bend = useMotionValue(0);
  const bendAxis = useMotionValue<BendAxis>("left");
  const foldOffset = useMotionValue(0);
  const foldFade = useMotionValue(1);
  const session = useRef<GestureSession | null>(null);
  /**
   * React state rather than refs, because both are read during render — but
   * both are only ever written in the same event as the commit, so they land in
   * the same render as `Leaving` and no frame shows the wrong face or an empty
   * seat where the departure should be.
   */
  const [leavingFaceUp, setLeavingFaceUp] = useState(false);
  const [departing, setDeparting] = useState<readonly [Card, Card] | null>(
    null,
  );
  /**
   * §16: `preventDefault` at a lower level does not suppress the later `click`
   * consistently across browsers, so suppression is handled here, at the
   * recognizer. A gesture that classified has already been answered, and the
   * click the browser synthesises after it must not toggle the reveal on top.
   *
   * A deadline rather than a flag: the click is not guaranteed to arrive — a
   * touch drag usually produces none and a cancelled pointer never does — and
   * a flag left waiting would swallow the next real activation instead.
   */
  const disownClicksUntil = useRef(0);
  /**
   * When the last tap landed, for the double-tap Check (§5). A ref, not state:
   * a tap that opens the window changes nothing on screen, so re-rendering for
   * it would be a render per touch with nothing to paint.
   */
  const tapWindow = useRef<TapWindow>(null);
  /**
   * When the last gesture Check was confirmed, or `null`. A timestamp rather
   * than a flag, so two Checks in a row restart the cue instead of the second
   * one landing silently inside the first one's window.
   */
  const [checkConfirmedAt, setCheckConfirmedAt] = useState<number | null>(null);

  const previous = useRef(props);
  // Deliberately un-keyed: the adapter compares the props itself and returns
  // nothing for the overwhelming majority of renders, which is exactly the
  // "inert by default" guarantee. A dependency list here would be a second,
  // weaker copy of that comparison.
  //
  // A **layout** effect, so a new hand's cards can never be painted under the
  // previous hand's presentation: `DEALT` lands between commit and paint, and
  // no face-up frame survives from one hand into the next.
  useIsomorphicLayoutEffect(() => {
    const events = eventsForPropChange(previous.current, props, state);
    previous.current = props;
    for (const event of events) {
      session.current = applyCardEvent(session.current, event);
      dispatch(event);
    }
  });

  // `Turning` is a point of no return: once the flip is committed it finishes
  // on its own schedule, whatever the pointer does.
  //
  // The turn is the *same sheet* the finger was bending, carried on past the
  // opposite corner rather than a separate flip animation — so the peel runs
  // from wherever the player let go to 1 and the face lands flat. A keyboard
  // reveal starts from 0 and gets the identical motion, which is what makes
  // Enter and a bend produce the same object behaving.
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

  // Face-down and face-up are both flat: the peel only exists in between, so
  // it is reset once the pair settles rather than left at wherever it landed.
  useEffect(() => {
    if (
      state.presentation === "FaceDown" ||
      state.presentation === "Revealed"
    ) {
      bend.set(0);
    }
  }, [state.presentation, bend]);

  // PROTOTYPE (#181): a card-flip sound on reveal/conceal. Entering `Turning`
  // is every reveal (keyboard, bend-peel, showdown); `Revealed → FaceDown` is
  // a conceal. A fresh deal reaches `FaceDown` from elsewhere and keeps its own
  // deal sound. Remove this effect (and the import) with the branch.
  const prevPresentation = useRef(state.presentation);
  useEffect(() => {
    const from = prevPresentation.current;
    const to = state.presentation;
    prevPresentation.current = to;
    if (to === "Turning" || (from === "Revealed" && to === "FaceDown")) {
      playRevealFlip();
    }
  }, [state.presentation]);

  /**
   * Whether the pair is on its way to the muck **right now**.
   *
   * `Leaving` alone is not enough: an acknowledgement resolves the reducer to
   * `Absent` within milliseconds on a LAN, and the flight is explicitly not
   * gated on that round trip. A rejection is the opposite — it takes the pair
   * out of the air immediately, from wherever it has got to.
   */
  const inFlight =
    state.presentation === "Leaving" ||
    (departing !== null && state.presentation === "Absent");

  // The flight itself. Deliberately depends on nothing but `inFlight`, so the
  // acknowledgement arriving mid-departure neither restarts the animation nor
  // interrupts it — it simply does not reach this effect at all.
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
    // Stopping on cleanup is what makes a rejection **interrupt** the departure
    // rather than complete it first (§7). The flight is a *prediction* of
    // server truth; when the server contradicts it, finishing the animation
    // would actively lie to the player.
    return () => {
      flight.stop();
      fade.stop();
    };
  }, [inFlight, foldOffset, foldFade]);

  // Coming to rest: the counterpart, and the only thing that puts the pair back
  // where it belongs. Keyed on the discrete facts that decide where that is —
  // whether the pair is in the air, and whether a finger is still carrying it.
  useEffect(() => {
    if (inFlight) return;

    if (state.presentation === "Absent") {
      // Nothing is rendered to see the snap, and the next hand must deal in
      // from rest rather than sliding down from wherever the flight got to.
      foldOffset.set(0);
      foldFade.set(1);
      return;
    }

    // A finger still on the glass owns the offset; this effect must not fight
    // it. Every way a drag can end — release, cancellation, a §9 reset out from
    // under it — clears the recognizer, which is what brings the pair home.
    if (state.recognizer !== "Idle") return;
    if (foldOffset.get() === 0 && foldFade.get() === 1) return;
    const home = animate(foldOffset, 0, RETURN_SPRING);
    const restore = animate(foldFade, 1, RETURN_SPRING);
    return () => {
      home.stop();
      restore.stop();
    };
  }, [inFlight, state.presentation, state.recognizer, foldOffset, foldFade]);

  // The departure outlives the cards prop by exactly one flight, and no longer:
  // a pair the player is holding again after a rejection renders from `cards`,
  // and this only has to stop standing in for one that is genuinely gone.
  useEffect(() => {
    if (departing === null) return;
    const timer = setTimeout(() => {
      setDeparting(null);
    }, FOLD_FLIGHT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [departing]);

  // The one disturbance that is not a prop change (§8): the app leaving the
  // foreground resets the pair face-down, cancelling any gesture in flight.
  // Subscribed once for the pair's lifetime — `dispatch` is stable, and what
  // "hidden" means is `eventsForVisibility`'s decision, not this effect's.
  //
  // §9's other two resets need no subscription: a new hand arrives as `DEALT`,
  // and a reload mounts through `initialCardState`. A socket reconnect while
  // the page stays in the foreground is the gap — the pair stays mounted with
  // unchanged props, and §2 fixes those props to `cards`, `locked` and
  // `actions`, so no signal for it exists inside the seam. Backgrounding, the
  // way a phone actually loses its socket, is covered here.
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

  // The confirmation is transient by construction: nothing has to remember to
  // take it down, and a re-check simply replaces the timestamp and the timer.
  useEffect(() => {
    if (checkConfirmedAt === null) return;
    const timer = setTimeout(() => {
      setCheckConfirmedAt(null);
    }, CHECK_CONFIRM_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [checkConfirmedAt]);

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
    // Every completed gesture disowns its click, a tap included: the tap is
    // answered here, by the recognizer, and the click the browser synthesises
    // afterwards would answer it a second time — re-revealing the pair the tap
    // just concealed, or revealing on the first tap of a Check that §5 requires
    // to cost nothing. §12's non-gesture path is unaffected: Enter and Space
    // raise a click with no pointer sequence in front of it.
    disownClicksUntil.current = Date.now() + CLICK_DISOWN_MS;
    // The peel closes the instant the finger lifts — a glance costs nothing
    // and leaves nothing exposed, so there is no wind-down to watch. A bend
    // that already crossed the threshold is exempt: it committed on crossing,
    // and the turn is mid-flight with the peel under its control.
    if (!active.crossed) bend.set(0);
    // Everything a pointer lift decides — which events fire, which Actions
    // leave the module, what the tap window becomes — is `planFinish`'s to
    // answer (§156). Decided off the session, which is a ref and therefore
    // exactly as current as the events the reducer has been given: the state
    // this hook renders with can lag a threshold crossed one pointer event ago,
    // and a fast flick is the commonest way to fold, not an edge case.
    const plan = planFinish({
      end: endGesture(active, { cancelled }),
      actions: props.actions,
      presentation: state.presentation,
      tapWindow: tapWindow.current,
      // The clock is monotonic, because a wall clock stepping backwards
      // mid-hand would turn two unrelated taps into a Check (§5).
      now: performance.now(),
    });
    tapWindow.current = plan.nextTapWindow;
    // The pair leaves with whatever face it had (§7). Set here, before the
    // effects replay, so it lands in the same commit as the `RELEASED` that
    // moves the reducer into `Leaving`.
    if (plan.leaving !== null) {
      setLeavingFaceUp(plan.leaving.faceUp);
      setDeparting(props.cards);
    }
    // The hook owns only the imperative replay: the plan already fixed the
    // order, and the two orderings that cost money — conceal before Check, and
    // depart before Fold — are carried by the effect list, not by this loop.
    // `fold`/`check` **are** `intent.fold`/`intent.check`, so gesture and
    // button enter the identical function and `canAct` on the latest view stays
    // the single legality gate: an armed release the server would refuse sends
    // nothing here that the intent does not then drop.
    for (const effect of plan.effects) {
      if (effect.kind === "dispatch") {
        dispatch(effect.event);
      } else if (effect.action === "check") {
        props.actions.check();
      } else {
        props.actions.fold();
      }
    }
    if (plan.confirmCheck) setCheckConfirmedAt(Date.now());
  };

  const handlers: PairHandlers = {
    onPointerDown: (event) => {
      // A second finger landing mid-gesture is ignored until the first one
      // releases or cancels: a stray thumb must not silently retarget a drag.
      if (session.current !== null || event.button !== 0) return;
      // The lifecycle's lock rather than the prop, so a decided hand is inert
      // to a finger for exactly as long as it is inert to the keyboard.
      if (state.locked) return;
      // Inertness while a Fold is in flight rides on `Leaving`, not on
      // `pending`: a pending Call or Raise leaves the cards entirely alone.
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
          // Measured per move rather than once: the threshold scales with the
          // viewport, and a phone keyboard or a rotation changes it under a
          // gesture that is already running.
          foldThresholdPx: foldThreshold(window.innerHeight),
        },
      );
      session.current = step.session;
      if (step.bend !== null) {
        bend.set(step.bend.progress);
        bendAxis.set(step.bend.axis);
      }
      // The cards track the finger, so the player can feel how far they are
      // from committing — continuous, and therefore never React state (§13).
      if (step.fold !== null) foldOffset.set(step.fold.offset);
      // Once the drag belongs to the recognizer, the browser must not also
      // treat it as a pan or a selection.
      if (step.session.classification !== null) event.preventDefault();
      for (const cardEvent of step.events) {
        // Optional, best-effort polish and **never** semantic feedback: the
        // arming signal proper is the card motion and the in-gesture text, both
        // of which the iPhone/Safari path has and this pulse it does not (§16).
        if (cardEvent.type === "FOLD_ARMED") pulse(HAPTIC_PULSE_MS);
        dispatch(cardEvent);
      }
    },

    onPointerUp: (event) => {
      finish(event, false);
    },
    onPointerCancel: (event) => {
      finish(event, true);
    },
    onLostPointerCapture: (event) => {
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
  };
}
