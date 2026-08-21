import type { ActionType, SeatSnapshot } from "@table-top-poker/protocol";

export type AllInAction = "allInCall" | "allInRaise";

export function isAllInAction(
  action: ActionType | null,
): action is AllInAction {
  return action === "allInCall" || action === "allInRaise";
}

export interface AllInChoice {
  readonly action: AllInAction;
  readonly label: string;
}

const SPLIT: readonly AllInChoice[] = [
  { action: "allInCall", label: "All-in call" },
  { action: "allInRaise", label: "All-in raise" },
];

const WHOLE: readonly AllInChoice[] = [
  { action: "allInRaise", label: "All in" },
];

export function otherSeatIsAllIn(
  seats: readonly SeatSnapshot[],
  yourSeatId: number,
): boolean {
  return seats.some((seat) => seat.seatId !== yourSeatId && seat.allIn);
}

/**
 * An all-in call only means something against chips already in front of you,
 * so the split arm needs a live bet as well as a shove to have happened.
 */
function offerable(
  action: AllInAction,
  legalActions: readonly ActionType[],
): boolean {
  if (!legalActions.includes(action)) return false;
  return action === "allInCall" ? legalActions.includes("call") : true;
}

export function allInChoices(
  legalActions: readonly ActionType[],
  facingAllIn: boolean,
): readonly AllInChoice[] {
  const offered = facingAllIn ? SPLIT : WHOLE;
  return offered.filter((choice) => offerable(choice.action, legalActions));
}

export interface AllInPress {
  readonly armed: AllInAction | null;
  readonly send: AllInAction | null;
}

export function pressAllIn(
  armed: AllInAction | null,
  pressed: AllInAction,
): AllInPress {
  return armed === pressed
    ? { armed: null, send: pressed }
    : { armed: pressed, send: null };
}
