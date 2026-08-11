/**
 * Hole-card interaction constants (Phase 3 spec #138 §15). Several are unused
 * until the pointer recognizer lands; they live here from the start so the
 * numbers are stated once, in the module that owns them.
 */

/** Pointer travel before a gesture is classified, in px. */
export const MOVE_SLOP_PX = 9;

/** Fraction of bend travel past which the reveal is committed. */
export const REVEAL_THRESHOLD = 0.9;

/** Full bend travel, in px, over which peel progress runs 0 → 1. */
export const BEND_TRAVEL_PX = 176;

/**
 * The corner the bend affordance is drawn in, named once so the coaching copy
 * follows the rendered zone rather than hard-coding "bottom-right" (§11). The
 * `BendZone` and the `teach-bend` hint both read it, so if the overlapped
 * layout ever mirrors, the words the surface teaches follow it.
 */
export const BEND_CORNER = { vertical: "bottom", horizontal: "right" } as const;

/** Floor of the fold threshold, in px. */
export const MIN_FOLD_DISTANCE_PX = 148;

/** Fraction of viewport height the fold threshold scales with. */
export const FOLD_DISTANCE_RATIO = 0.18;

/**
 * How much more upward than sideways a drag must be to read as a fold rather
 * than as nothing. Ambiguous motion resolves to `Ignored` (§4), so the ratio
 * sits just above 1 rather than at it.
 */
export const FOLD_AXIS_RATIO = 1.05;

/** Window within which a second tap counts as a double-tap, in ms. */
export const DOUBLE_TAP_MS = 280;

/** Duration of the committed flip to face-up, in ms. */
export const REVEAL_FINISH_MS = 520;

/** Duration of the muck flight after a committed Fold, in ms. */
export const FOLD_FLIGHT_MS = 280;

/** Quiet interval a coaching hint waits for before appearing, in ms. */
export const HINT_QUIET_MS = 2000;

/**
 * How long after a classified gesture a synthetic `click` is disowned, in ms.
 * Not a §15 constant — §16 requires the suppression but sets no window.
 *
 * A window rather than a flag, because a gesture does **not** reliably produce
 * a click to consume it: a touch drag usually produces none, a mouse drag
 * does, and a cancelled pointer produces none at all. A flag waiting for a
 * click that never comes would go stale and swallow the next real activation,
 * including the Enter or Space that §12 guarantees.
 */
export const CLICK_DISOWN_MS = 350;

/**
 * How long the confirmation of a gesture Check stays up, in ms. Not a §15
 * constant — chosen to be long enough to be read after the eyes come back off
 * the cards, short enough to be gone before the next Player's Action lands.
 */
export const CHECK_CONFIRM_MS = 2400;

/**
 * Length of the optional threshold pulse, in ms. Not a §15 constant — §16 asks
 * for a pulse and sets no length; this one is short enough to read as a tick
 * against the fingertip rather than as a buzz.
 */
export const HAPTIC_PULSE_MS = 10;

/**
 * Duration of the face-down deal-in, in ms. Not a §15 constant — the deal-in
 * motion is §17, which sets no duration; this matches the per-card deal
 * animation it replaces in `Hand`.
 */
export const DEAL_IN_MS = 420;
