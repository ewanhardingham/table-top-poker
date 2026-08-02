import { useCallback, useEffect, useReducer, useRef } from "react";
import { initialCardState, reduce, type CardState } from "./cardState.js";
import { REVEAL_FINISH_MS } from "./constants.js";
import type { HoleCardPairProps } from "./HoleCardPair.js";
import { eventsForPropChange } from "./viewEvents.js";

/**
 * Binds the pure lifecycle to React: prop changes in, discrete state out.
 * Every decision it makes is delegated — `eventsForPropChange` decides what a
 * changed prop means, `reduce` decides what that means for the pair — so the
 * hook itself holds no rules worth testing through a renderer.
 */
export function useHoleCards(props: HoleCardPairProps): {
  readonly state: CardState;
  readonly activate: () => void;
} {
  const [state, dispatch] = useReducer(reduce, props, (initial) =>
    initialCardState({
      hasCards: initial.cards !== null,
      locked: initial.locked,
    }),
  );

  const previous = useRef(props);
  // Deliberately un-keyed: the adapter compares the props itself and returns
  // nothing for the overwhelming majority of renders, which is exactly the
  // "inert by default" guarantee. A dependency list here would be a second,
  // weaker copy of that comparison.
  useEffect(() => {
    const events = eventsForPropChange(previous.current, props, state);
    previous.current = props;
    for (const event of events) dispatch(event);
  });

  // `Turning` is a point of no return: once the flip is committed it finishes
  // on its own schedule, whatever the pointer does.
  useEffect(() => {
    if (state.presentation !== "Turning") return;
    const timer = setTimeout(() => {
      dispatch({ type: "TURN_FINISHED" });
    }, REVEAL_FINISH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [state.presentation]);

  const activate = useCallback(() => {
    dispatch({ type: "ACTIVATED" });
  }, []);

  return { state, activate };
}
