/**
 * Prototype-validated constants (Phase 3 spec #138 §15), carried forward as
 * defaults rather than re-derived. Several are unused until the pointer
 * recognizer lands; they live here from the start so the numbers are stated
 * once, in the module that owns them.
 */

/** Pointer travel before a gesture is classified, in px. */
export const MOVE_SLOP_PX = 9;

/** Fraction of bend travel past which the reveal is committed. */
export const REVEAL_THRESHOLD = 0.9;

/** Full bend travel, in px, over which peel progress runs 0 → 1. */
export const BEND_TRAVEL_PX = 176;

/** Floor of the fold threshold, in px. */
export const MIN_FOLD_DISTANCE_PX = 148;

/** Fraction of viewport height the fold threshold scales with. */
export const FOLD_DISTANCE_RATIO = 0.18;

/** Window within which a second tap counts as a double-tap, in ms. */
export const DOUBLE_TAP_MS = 280;

/** Duration of the committed flip to face-up, in ms. */
export const REVEAL_FINISH_MS = 520;

/** Duration of the muck flight after a committed Fold, in ms. */
export const FOLD_FLIGHT_MS = 280;

/** Quiet interval a coaching hint waits for before appearing, in ms. */
export const HINT_QUIET_MS = 2000;

/**
 * Duration of the face-down deal-in, in ms. Not a §15 constant — the deal-in
 * motion is §17 and had no prototype value; this matches the per-card deal
 * animation it replaces in `Hand`.
 */
export const DEAL_IN_MS = 420;
