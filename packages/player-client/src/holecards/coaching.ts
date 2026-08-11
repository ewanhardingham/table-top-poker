import type { CardEvent, CardState } from "./cardState.js";
import { BEND_CORNER } from "./constants.js";
import type { BendAxis } from "./geometry.js";

/**
 * The gestures the surface teaches, **in teaching order** (§11). Bend is Peek
 * *and* Reveal — one gesture at two depths — which is why there are four of
 * these and not five.
 *
 * The order is the list: the selector offers the first gesture the player has
 * not found yet, so "at most one hint" and "Bend before Conceal before Check
 * before Fold" are the same fact rather than two rules that could disagree.
 */
export const TEACHABLE_GESTURES = ["bend", "conceal", "check", "fold"] as const;

export type TeachableGesture = (typeof TEACHABLE_GESTURES)[number];

/**
 * Line 1 is an imperative; line 2 is the consequence (Phase 3 spec #138 §11).
 * `id` identifies the hint for rendering and for tests; it is not the gesture,
 * because the in-gesture prompts are feedback on a motion rather than
 * instruction about one.
 */
export interface Hint {
  readonly id: string;
  readonly line1: string;
  readonly line2: string | null;
  /**
   * Whether the hint is news rather than advice, and should therefore reach a
   * screen reader when it appears. Only the Check confirmation is: every
   * teaching hint and in-gesture prompt describes what the player *could* do,
   * and announcing those over a live gesture would be noise.
   */
  readonly announce: boolean;
}

export interface HintContext {
  readonly checkLegal: boolean;
  readonly foldLegal: boolean;
  readonly pending: boolean;
  readonly locked: boolean;
  /**
   * Whether the *primary* pointer is coarse — a finger rather than a mouse.
   * Gates the teaching hints only: instruction about bending corners is noise
   * to a player who cannot act on it.
   */
  readonly coarsePointer: boolean;
  /** ~2s since the last contact with the pair. */
  readonly quiet: boolean;
  /** A gesture Check landed moments ago and is still being confirmed (§5). */
  readonly checkConfirmed: boolean;
}

/**
 * The one hint to show, or none (§11). At most one is ever visible, and
 * in-gesture feedback outranks every teaching hint: it describes a motion the
 * player's finger is making right now, and must never be outranked by
 * instruction about a different gesture.
 *
 * The selector is **module-internal**. #111 put hint discovery outside the
 * card module; #135 then made every in-gesture hint depend on recognizer state
 * that nothing outside may see. Keeping the selector in here — and letting
 * only the persisted discovery set cross the seam — is what holds the module's
 * public surface at two names.
 *
 * The `(pointer: coarse)` gate applies to the teaching hints alone: it exists
 * so a keyboard player is not told to bend corners. An in-gesture prompt is
 * feedback on a motion already underway, so it belongs to whoever is making it
 * — including the desktop player dragging with a mouse.
 */
export function selectHint(
  state: CardState & { readonly bendAxis: BendAxis },
  discovered: ReadonlySet<TeachableGesture>,
  ctx: HintContext,
): Hint | null {
  // Outranks every gate below, including the pending one it necessarily trips:
  // this is not advice about a gesture, it is the answer to one the player just
  // made (story 31). Without it the only sign a double-tap landed is the
  // ActionBar the gesture exists to stop them watching.
  if (ctx.checkConfirmed) return checkedHint;

  // A hint is only ever advice about cards the player is actually holding, in
  // a moment where those cards will listen.
  if (ctx.pending || ctx.locked) return null;
  if (state.presentation === "Absent") return null;

  // Deliberately **not** gated on the discovery set, either of them. In-gesture
  // prompts are permanent for every player, forever: they say what releasing
  // will do, and for the money-losing gesture that text is the arming signal
  // itself.
  if (state.recognizer === "Bending") {
    return state.bendAxis === "up" ? bendUpHint : bendLeftHint;
  }

  // There is no rendered fold-threshold marker and browser vibration is
  // Blink-only, so on iPhone/Safari this line — with the card motion — is the
  // *whole* arming signal (§11). It has to be able to say both things.
  if (state.recognizer === "FoldDragging") {
    return state.armed ? foldArmedHint : foldDraggingHint;
  }

  // Everything below is instruction rather than feedback, and every gate on it
  // is the same gate: teach only where the advice can be taken.
  if (!ctx.coarsePointer) return null;
  // A finger is already on the glass — pressing, or dragging something the
  // recognizer ignored. Instruction yields to whatever it is doing, even before
  // the quiet interval has a chance to say so.
  if (state.recognizer !== "Idle") return null;
  if (!ctx.quiet) return null;
  // The two presentations a player is *holding* the pair in. A peek is held
  // open by a finger, a turn is a flip mid-flight, and a departing pair is on
  // its way to the muck: none of them is a moment to start teaching in.
  if (state.presentation !== "FaceDown" && state.presentation !== "Revealed") {
    return null;
  }

  const teachable = nextTeachable(state, discovered, ctx);
  return teachable === null ? null : TEACHING[teachable].hint;
}

/**
 * The gesture the surface would teach next, ignoring the timing gates — the
 * first one in the teaching order the player has not found and *could* act on.
 *
 * Separate from `selectHint` because the quiet interval is measured **from the
 * moment eligibility becomes true** (§11): the caller has to know which gesture
 * is up before deciding whether it has waited long enough to say so. Without
 * that, only the first hint of a session would ever observe the interval, and
 * Fold would appear the instant a turn made it legal.
 */
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

/**
 * Which gesture, if any, a card event proves the player has found (§11).
 *
 * Discovery is **on-pair, never on a button**: every event this answers comes
 * from the recognizer, and pressing Fold or Check in the `ActionBar` reaches
 * this module only as a prop change. That is the whole point — the hint exists
 * to move the player off the button, so the button must not retire it.
 *
 * A pure function rather than a line in the pointer handlers, so what counts as
 * having found a gesture is a tested rule rather than four scattered ones.
 */
export function discoveredBy(
  event: CardEvent,
  state: CardState,
): TeachableGesture | null {
  switch (event.type) {
    case "CLASSIFIED":
      // The classification, not the release: the player has made the motion,
      // whether or not they carried it far enough to commit anything. An
      // `Ignored` drag is not a gesture at all and teaches them nothing.
      if (event.as === "Bending") return "bend";
      if (event.as === "FoldDragging") return "fold";
      return null;
    case "TAPPED":
      // Only where the tap actually hides something. A tap on a face-down pair
      // does nothing by design (§5, which is what makes the first tap of a
      // Check free), and retiring the hint for it would retire advice the
      // player has never seen take effect.
      return state.presentation === "Revealed" ? "conceal" : null;
    case "DOUBLE_TAPPED":
      return "check";
    default:
      // `ACTIVATED` included: Enter, Space or a mouse click is the semantic
      // path (§12), not the tap gesture the conceal hint teaches.
      return null;
  }
}

/**
 * The four teaching hints: what each one says, and when it is worth saying.
 * Touch only, and each retires permanently the first time its gesture is used.
 *
 * Copy and eligibility live in the same entry so a gesture is defined once —
 * `TEACHABLE_GESTURES` supplies the order, and this supplies everything else.
 *
 * Bend and Conceal are local presentation and eligible **off-turn**, which is
 * most of the time a player is holding cards. Check and Fold are advice about
 * an Action, and advice you cannot take is worse than silence. Check sits above
 * Fold in the overlap, which is quieter than it looks: a legal Check means no
 * bet to face, and teaching someone to fold for free is bad advice. Where a bet
 * *is* faced, Check is illegal and Fold is the only eligible hint left — so the
 * irreversible, money-losing Action is never the one pushed at a player two
 * hands into their first session.
 *
 * The bend's corner is **derived from the rendered affordance** rather than
 * written into the copy, so if the overlapped layout ever mirrors, the words
 * follow it.
 */
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
      // Both outcomes on one line, because they are one gesture at two depths.
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
    // Nothing to hide from a pair that is already face-down.
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

/**
 * The visible confirmation a gesture Check lands with (story 31). It says the
 * Action, not the gesture, because that is what the player needs to trust: the
 * cards are already back face-down by the time it appears, so nothing else on
 * this surface has changed to say the double-tap was heard.
 */
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

/**
 * The upward variant swaps its second line for the one genuinely Peek-specific
 * fact worth teaching: dragging *left* peels at the same rate (§15) without
 * putting a finger over the rank and suit you are trying to read.
 */
const bendUpHint: Hint = {
  id: "bending-up",
  line1: "Release to peek",
  line2: "drag left to keep your finger clear",
  announce: false,
};

/**
 * One line each, and no consequence line: a fold drag has the player's eyes on
 * the cards moving under their finger, and the only thing they need from the
 * text is whether letting go now costs them the hand.
 *
 * Not announced, for the same reason the bend prompts are not: a live region
 * flipping between these two as a finger wandered across the threshold would
 * talk over the player rather than tell them anything. The `Fold` button
 * remains the non-gesture path (§12).
 */
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
