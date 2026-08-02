/**
 * The Action port the Hole-card module defines for itself (Phase 3 spec #138
 * §2). `fold` and `check` **are** `intent.fold`/`intent.check` — a gesture and
 * a button reach the same Action by the same route, and `canAct` stays the
 * single legality gate.
 *
 * `foldLegal`, `checkLegal` and `pending` are for arming and rendering only.
 * The module never uses them to decide whether an Action is permitted, so a
 * stale prop can at worst arm a gesture that `canAct` then refuses.
 */
export interface CardActions {
  readonly foldLegal: boolean;
  readonly checkLegal: boolean;
  readonly pending: boolean;
  readonly fold: () => void;
  readonly check: () => void;
}
