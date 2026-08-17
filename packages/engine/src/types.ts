export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank =
  "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export type SeatId = number;

export type Street = "preflop" | "flop" | "turn" | "river";

export type ActionType = "fold" | "check" | "call" | "raise";

export type HandRank = number;

export type Command =
  | { type: "startHand"; seatId: SeatId; seed: string }
  | { type: ActionType; seatId: SeatId }
  | { type: "evict"; seatId: SeatId }
  | { type: "nextHand"; seatId: SeatId; seed: string };

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
  readonly ring: readonly SeatId[];
  readonly street: Street;
  readonly board: readonly Card[];
  readonly players: ReadonlyMap<SeatId, SeatHandState>;
  readonly toAct: readonly SeatId[];
  readonly raiseOccurred: boolean;
}

export interface ShowdownResult {
  readonly seatId: SeatId;
  readonly rank: HandRank;
  readonly bestHand: readonly [Card, Card, Card, Card, Card];
  readonly description: string;
}

export interface RevealedResult extends ShowdownResult {
  readonly holeCards: readonly [Card, Card];
}

export interface HandPositions {
  readonly button: SeatId;
  readonly smallBlind: SeatId;
  readonly bigBlind: SeatId;
  readonly dealtSeatCount: number;
}

export interface FoldedOutCompleteHandState extends HandPositions {
  readonly status: "complete";
  readonly reason: "folded-out";
  readonly seed: string;
  readonly winner: SeatId;
}

export interface ShowdownCompleteHandState extends HandPositions {
  readonly status: "complete";
  readonly reason: "showdown";
  readonly seed: string;
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
