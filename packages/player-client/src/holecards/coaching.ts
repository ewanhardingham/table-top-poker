import type { CardEvent, CardState } from "./cardState.js";
import { BEND_CORNER } from "./constants.js";
import type { BendAxis } from "./geometry.js";

export const TEACHABLE_GESTURES = ["bend", "conceal", "check", "fold"] as const;

export type TeachableGesture = (typeof TEACHABLE_GESTURES)[number];

export interface Hint {
  readonly id: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly announce: boolean;
}

export interface HintContext {
  readonly checkLegal: boolean;
  readonly foldLegal: boolean;
  readonly pending: boolean;
  readonly locked: boolean;
  readonly coarsePointer: boolean;
  readonly quiet: boolean;
  readonly checkConfirmed: boolean;
}

export function selectHint(
  state: CardState & { readonly bendAxis: BendAxis },
  discovered: ReadonlySet<TeachableGesture>,
  ctx: HintContext,
): Hint | null {
  if (ctx.checkConfirmed) return checkedHint;

  if (ctx.pending || ctx.locked) return null;
  if (state.presentation === "Absent") return null;

  if (state.recognizer === "Bending") {
    return state.bendAxis === "up" ? bendUpHint : bendLeftHint;
  }

  if (state.recognizer === "FoldDragging") {
    return state.armed ? foldArmedHint : foldDraggingHint;
  }

  if (!ctx.coarsePointer) return null;
  if (state.recognizer !== "Idle") return null;
  if (!ctx.quiet) return null;
  if (state.presentation !== "FaceDown" && state.presentation !== "Revealed") {
    return null;
  }

  const teachable = nextTeachable(state, discovered, ctx);
  return teachable === null ? null : TEACHING[teachable].hint;
}

export function nextTeachable(
  state: CardState,
  discovered: ReadonlySet<TeachableGesture>,
  ctx: Pick<HintContext, "checkLegal" | "foldLegal">,
): TeachableGesture | null {
  const teaching = TEACHABLE_GESTURES.find(
    (gesture) =>
      !discovered.has(gesture) && TEACHING[gesture].eligible(state, ctx),
  );
  return teaching ?? null;
}

export function discoveredBy(
  event: CardEvent,
  state: CardState,
): TeachableGesture | null {
  switch (event.type) {
    case "CLASSIFIED":
      if (event.as === "Bending") return "bend";
      if (event.as === "FoldDragging") return "fold";
      return null;
    case "TAPPED":
      return state.presentation === "Revealed" ? "conceal" : null;
    case "DOUBLE_TAPPED":
      return "check";
    default:
      return null;
  }
}

const TEACHING: Record<
  TeachableGesture,
  {
    readonly hint: Hint;
    readonly eligible: (
      state: CardState,
      ctx: Pick<HintContext, "checkLegal" | "foldLegal">,
    ) => boolean;
  }
> = {
  bend: {
    hint: {
      id: "teach-bend",
      line1: `Bend the ${BEND_CORNER.vertical}-${BEND_CORNER.horizontal} corner`,
      line2: "release to peek · keep bending to reveal",
      announce: false,
    },
    eligible: () => true,
  },
  conceal: {
    hint: {
      id: "teach-conceal",
      line1: "Tap to hide your cards",
      line2: "one tap is enough",
      announce: false,
    },
    eligible: (state) => state.presentation === "Revealed",
  },
  check: {
    hint: {
      id: "teach-check",
      line1: "Double-tap to Check",
      line2: "passes your turn to the next player",
      announce: false,
    },
    eligible: (_state, ctx) => ctx.checkLegal,
  },
  fold: {
    hint: {
      id: "teach-fold",
      line1: "Swipe your cards up to Fold",
      line2: "release once they lift away",
      announce: false,
    },
    eligible: (_state, ctx) => ctx.foldLegal,
  },
};

const checkedHint: Hint = {
  id: "checked",
  line1: "Checked",
  line2: "your turn passed on",
  announce: true,
};

const bendLeftHint: Hint = {
  id: "bending-left",
  line1: "Release to peek",
  line2: "keep bending to reveal both",
  announce: false,
};

const bendUpHint: Hint = {
  id: "bending-up",
  line1: "Release to peek",
  line2: "drag left to keep your finger clear",
  announce: false,
};

const foldDraggingHint: Hint = {
  id: "folding",
  line1: "Keep dragging up",
  line2: null,
  announce: false,
};

const foldArmedHint: Hint = {
  id: "folding-armed",
  line1: "Release to Fold",
  line2: null,
  announce: false,
};
