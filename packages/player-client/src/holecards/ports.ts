export interface CardActions {
  readonly foldLegal: boolean;
  readonly checkLegal: boolean;
  /** The Showdown showing window is open, whosever turn it is — see ADR-0009. */
  readonly showdownOpen: boolean;
  /** It is this Seat's turn in the showing window. */
  readonly showLegal: boolean;
  /** Its turn, and some hand is already face-up to discharge the compulsion. */
  readonly muckLegal: boolean;
  readonly pending: boolean;
  readonly fold: () => void;
  readonly check: () => void;
  readonly show: () => void;
  readonly muck: () => void;
}
