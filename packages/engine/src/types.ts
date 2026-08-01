export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank =
  "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

/** A card's identity is its rank+suit value — never its position in a hand or deck. */
export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

/**
 * A Seat's stable identity — the seat's fixed position at the table (0-7).
 * Never re-derived from an index into a filtered/live-players array.
 */
export type SeatId = number;

export type Street = "preflop" | "flop" | "turn" | "river";

export type ActionType = "fold" | "check" | "call" | "raise";

/**
 * Placeholder pending the hand evaluator (issue #6). A comparable numeric
 * rank; the evaluator ticket fixes the exact ordering convention.
 */
export type HandRank = number;

export type Command =
  | { type: "startHand"; playerId: SeatId; seed: string }
  | { type: ActionType; playerId: SeatId }
  /** Server-synthesized table action; never accepted from a player client. */
  | { type: "evict"; seatId: SeatId }
  | { type: "nextHand"; playerId: SeatId; seed: string };

export type HandEvent =
  | { type: "HandStarted"; seed: string; button: SeatId }
  | {
      type: "HoleCardsDealt";
      deals: { seatId: SeatId; cards: [Card, Card] }[];
    }
  | { type: "StreetStarted"; street: Street; actor: SeatId }
  | { type: "ActionTaken"; seatId: SeatId; action: ActionType }
  | { type: "StreetClosed"; street: Street }
  | { type: "BoardDealt"; street: "flop" | "turn" | "river"; cards: Card[] }
  | { type: "HandFoldedOut"; winner: SeatId }
  | {
      type: "ShowdownReached";
      results: {
        seatId: SeatId;
        rank: HandRank;
        bestHand: [Card, Card, Card, Card, Card];
        description: string;
      }[];
      winners: SeatId[];
    }
  | { type: "HandComplete" };

export type RejectionReason =
  | "not-your-turn"
  | "action-not-legal"
  | "hand-not-in-progress"
  | "hand-already-in-progress"
  | "stale-next-hand";

export interface Rejection {
  readonly type: "Rejection";
  readonly reason: RejectionReason;
  readonly command: Command;
}

export interface SeatHandState {
  readonly holeCards: readonly [Card, Card] | null;
  readonly folded: boolean;
}

export interface BettingHandState {
  readonly status: "betting";
  readonly seed: string;
  readonly button: SeatId;
  /** Fixed positional ring for the whole hand: button+1, ..., button (button last). */
  readonly ring: readonly SeatId[];
  readonly street: Street;
  readonly board: readonly Card[];
  readonly players: ReadonlyMap<SeatId, SeatHandState>;
  /** Seats still owed a decision this street, in order; `toAct[0]` is the current actor. */
  readonly toAct: readonly SeatId[];
  /**
   * Preflop only, 3+ live players: true until the big blind has had its
   * one-time "option" turn after a no-raise lap all the way to the button.
   */
  readonly bbOptionPending: boolean;
  readonly raiseOccurred: boolean;
}

export interface ShowdownResult {
  readonly seatId: SeatId;
  readonly rank: HandRank;
  readonly bestHand: readonly [Card, Card, Card, Card, Card];
  readonly description: string;
}

/**
 * A live seat's showdown result with its hole cards attached — the only
 * place another seat's hole cards are structurally reachable, and only
 * ever for a seat that actually reached showdown live (see
 * Phase 1 spec #130 §4, Visibility). Built once, in `apply`, from the
 * betting hand's players map; nothing downstream needs that map again.
 */
export interface RevealedResult extends ShowdownResult {
  readonly holeCards: readonly [Card, Card];
}

export interface FoldedOutCompleteHandState {
  readonly status: "complete";
  readonly reason: "folded-out";
  readonly seed: string;
  readonly button: SeatId;
  readonly winner: SeatId;
}

export interface ShowdownCompleteHandState {
  readonly status: "complete";
  readonly reason: "showdown";
  readonly seed: string;
  readonly button: SeatId;
  readonly board: readonly Card[];
  readonly results: readonly RevealedResult[];
  readonly winners: readonly SeatId[];
}

export type CompleteHandState =
  FoldedOutCompleteHandState | ShowdownCompleteHandState;

export type HandState = BettingHandState | CompleteHandState;

export interface EngineState {
  readonly seats: readonly SeatId[];
  readonly button: SeatId;
  readonly hand: HandState | null;
}
