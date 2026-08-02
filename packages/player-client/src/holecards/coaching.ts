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
}

export interface HintContext {
  readonly checkLegal: boolean;
  readonly foldLegal: boolean;
  readonly pending: boolean;
  readonly locked: boolean;
  /** ~2s since the last contact with the pair. */
  readonly quiet: boolean;
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
 * This slice answers the bend gesture. The remaining in-gesture prompts and
 * the four teaching hints arrive with the gestures they describe (#142, #145,
 * #147), extending this same function rather than paralleling it.
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
  // A hint is only ever advice about cards the player is actually holding, in
  // a moment where those cards will listen.
  if (ctx.pending || ctx.locked) return null;
  if (state.presentation === "Absent") return null;

  if (state.recognizer === "Bending") {
    // Deliberately **not** gated on the discovery set. In-gesture prompts are
    // permanent for every player, forever: they say what releasing will do,
    // and for the money-losing gesture that text is the arming signal itself.
    return state.bendAxis === "up" ? bendUpHint : bendLeftHint;
  }

  return null;
}

const bendLeftHint: Hint = {
  id: "bending-left",
  line1: "Release to peek",
  line2: "keep bending to reveal both",
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
};
