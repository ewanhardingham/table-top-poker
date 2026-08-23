export type Suit = "clubs" | "diamonds" | "hearts" | "spades";

export type Rank =
  "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export type SeatId = number;

export type Street = "preflop" | "flop" | "turn" | "river";

export type ActionType =
  "fold" | "check" | "call" | "raise" | "allInCall" | "allInRaise";

export type HandRank = number;

export type Command =
  | { type: "startHand"; seatId: SeatId; seed: string }
  | { type: ActionType; seatId: SeatId }
  | { type: "evict"; seatId: SeatId }
  | { type: "nextHand"; seatId: SeatId; seed: string }
  | { type: "show"; seatId: SeatId }
  | { type: "muck"; seatId: SeatId };

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
  | {
      type: "CardBurned";
      street: "flop" | "turn" | "river";
      /** Null once redacted for a client: a burnt identity never leaves the server (#263). */
      card: Card | null;
    }
  | { type: "HandFoldedOut"; winner: SeatId }
  | { type: "ShowdownReached"; contestants: SeatId[] }
  | { type: "HoleCardsShown"; result: RevealedResult }
  | { type: "HoleCardsMucked"; seatId: SeatId }
  | { type: "WinnersDeclared"; winners: SeatId[] }
  | { type: "HandComplete" };

export type RejectionReason =
  | "not-your-turn"
  | "action-not-legal"
  | "hand-not-in-progress"
  | "hand-already-in-progress"
  | "stale-next-hand"
  | "not-at-showdown"
  | "showdown-unresolved";

export interface Rejection {
  readonly type: "Rejection";
  readonly reason: RejectionReason;
  readonly command: Command;
}

export interface SeatHandState {
  readonly holeCards: readonly [Card, Card] | null;
  readonly folded: boolean;
  readonly allIn: boolean;
}

export interface BettingHandState {
  readonly status: "betting";
  readonly seed: string;
  readonly button: SeatId;
  readonly ring: readonly SeatId[];
  readonly street: Street;
  readonly board: readonly Card[];
  readonly burned: readonly Card[];
  /** How far into the deck the hand has consumed — the one owner of that answer. */
  readonly cardsDealt: number;
  readonly players: ReadonlyMap<SeatId, SeatHandState>;
  readonly toAct: readonly SeatId[];
  readonly raiseOccurred: boolean;
  readonly lastAggressor: SeatId | null;
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

export interface Contestant {
  readonly seatId: SeatId;
  readonly holeCards: readonly [Card, Card];
  readonly allIn: boolean;
}

export interface HandPositions {
  readonly button: SeatId;
  readonly smallBlind: SeatId;
  readonly bigBlind: SeatId;
  readonly dealtSeatCount: number;
  readonly burnedCount: number;
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
  readonly contestants: readonly Contestant[];
  readonly lastAggressor: SeatId | null;
  readonly results: readonly RevealedResult[];
  /** See Showing order in `CONTEXT.md`. */
  readonly queue: readonly SeatId[];
  readonly mucked: readonly SeatId[];
  readonly winners: readonly SeatId[] | null;
}

export type CompleteHandState =
  FoldedOutCompleteHandState | ShowdownCompleteHandState;

export type HandState = BettingHandState | CompleteHandState;

export interface EngineState {
  readonly seats: readonly SeatId[];
  readonly button: SeatId;
  readonly hand: HandState | null;
}
