import type { CardState } from "./cardState.js";
import type { BendAxis } from "./geometry.js";

/**
 * The gestures the surface teaches, and the keys the discovery set is written
 * with. Bend is Peek *and* Reveal — one gesture at two depths — which is why
 * there are four of these and not five.
 */
export type TeachableGesture = "bend" | "conceal" | "check" | "fold";

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
 * The in-gesture prompts are complete: the bend's two, and the fold drag's
 * armed and unarmed lines. The four *teaching* hints arrive with #147,
 * extending this same function rather than paralleling it — which is when the
 * discovery set starts being read.
 *
 * The `(pointer: coarse)` gate arrives with those teaching hints (#147), and
 * applies to them: it exists so a keyboard player is not told to bend corners.
 * An in-gesture prompt is feedback on a motion already underway, so it belongs
 * to whoever is making it — including the desktop player dragging with a mouse.
 */
export function selectHint(
  state: CardState & { readonly bendAxis: BendAxis },
  _discovered: ReadonlySet<TeachableGesture>,
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

  return null;
}

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
