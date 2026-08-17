export interface CardActions {
  readonly foldLegal: boolean;
  readonly checkLegal: boolean;
  readonly pending: boolean;
  readonly fold: () => void;
  readonly check: () => void;
}
