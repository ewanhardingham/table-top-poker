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
  REVEAL_FINISH_MS,
} from "./constants.js";
import type { BendAxis } from "./geometry.js";
import {
  beginGesture,
  endGesture,
  moveGesture,
  type GestureSession,
} from "./gesture.js";
import type { HoleCardPairProps } from "./HoleCardPair.js";
import { confirmsCheck, tapLanded, type TapWindow } from "./taps.js";
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
  /** A gesture Check landed and is still being confirmed (story 31). */
  readonly checkConfirmed: boolean;
}

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
  const session = useRef<GestureSession | null>(null);
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
    for (const event of events) dispatch(event);
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

  /**
   * The double-tap Action (§5, stories 27 and 28). `check` **is**
   * `intent.check`, so the gesture and the ActionBar button reach the Action
   * by the identical route and `canAct` — inside the intent, on the latest
   * view — is the single gate deciding whether it may be sent. An off-turn or
   * illegal double-tap therefore needs no guard here to be a no-op.
   *
   * `checkLegal` and `pending` are read for **rendering only**, exactly as the
   * port promises: they decide whether to claim the Check landed. A stale prop
   * can at worst show a confirmation for an Action the intent then refuses —
   * never send one.
   */
  const sendCheck = (): void => {
    const confirm = confirmsCheck(props.actions);
    props.actions.check();
    if (confirm) setCheckConfirmedAt(Date.now());
  };

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
    let tapped = false;
    for (const cardEvent of endGesture(active, { cancelled })) {
      if (cardEvent.type !== "TAPPED") {
        dispatch(cardEvent);
        continue;
      }
      // A tap is only *provisionally* a tap: whether it is one, or the second
      // half of a Check, is `taps` to decide. The clock is monotonic, because
      // a wall clock stepping backwards mid-hand would turn two unrelated taps
      // into an Action.
      const tap = tapLanded(tapWindow.current, performance.now());
      tapWindow.current = tap.window;
      tapped = true;
      dispatch(tap.event);
      // Dispatched first, so the Action is sent against a pair that has
      // already taken the conceal — the player sees the cards go down, then the
      // confirmation, in that order and with no timer between them.
      if (tap.event.type === "DOUBLE_TAPPED") sendCheck();
    }
    // The two taps of a Check must be *consecutive*. A gesture that ended as
    // anything else — a bend, a cancelled press — closes the window, so
    // tap → quick peek → tap cannot compose an Action out of two taps the
    // player never meant to pair. Sending a Check nobody asked for is the one
    // failure here that costs money, so the window is closed rather than left
    // open on a technicality of what the middle gesture happened to be.
    if (!tapped) tapWindow.current = null;
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
        { foldLegal: props.actions.foldLegal },
      );
      session.current = step.session;
      if (step.bend !== null) {
        bend.set(step.bend.progress);
        bendAxis.set(step.bend.axis);
      }
      // Once the drag belongs to the recognizer, the browser must not also
      // treat it as a pan or a selection.
      if (step.session.classification !== null) event.preventDefault();
      for (const cardEvent of step.events) dispatch(cardEvent);
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
    checkConfirmed: checkConfirmedAt !== null,
  };
}
