export interface CardActions {
  readonly foldLegal: boolean;
  readonly checkLegal: boolean;
  /** The Showdown showing window is open and this Seat has not shown yet. */
  readonly showLegal: boolean;
  readonly pending: boolean;
  readonly fold: () => void;
  readonly check: () => void;
  readonly show: () => void;
}
