/**
 * PROTOTYPE — throwaway, wayfinder ticket #81 (extended by #87).
 *
 * A fixture session chosen to be *hostile* to the picker: several fold-outs
 * that a naive "Hand N — Seat 3 won" summary would render indistinguishable,
 * plus preflop walks with no board at all, plus a hand still in progress.
 *
 * `startedAt` is computed relative to module-load time, not hardcoded, so
 * whenever the prototype is opened the freshest completed hand (13) reads as
 * "just now" and drifts to "1m ago" within the session — the exact staleness
 * ticket #87 asks about. The oldest hand (1) sits past the one-hour mark, to
 * exercise the relative formatter's hour-scale branch, not just minutes.
 */
import type { Card, Rank, SeatId, Suit } from "@table-top-poker/protocol";
import type { HandSummary, SummaryAction } from "./summary.js";

function c(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

const loadedAt = Date.now();
const secondsAgo = (s: number) => new Date(loadedAt - s * 1000).toISOString();

const fold = (seatId: SeatId): SummaryAction => ({ seatId, action: "fold" });
const call = (seatId: SeatId): SummaryAction => ({ seatId, action: "call" });
const check = (seatId: SeatId): SummaryAction => ({ seatId, action: "check" });
const raise = (seatId: SeatId): SummaryAction => ({ seatId, action: "raise" });

export const fixtureSeatIds: readonly SeatId[] = [0, 1, 2, 3, 4, 5];

export const fixtureHands: readonly HandSummary[] = [
  {
    handNumber: 1,
    startedAt: secondsAgo(5700),
    button: 0,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [],
    lastStreet: "preflop",
    actions: [fold(3), fold(4), fold(5), fold(0), fold(1)],
    outcome: { kind: "folded-out", winner: 2 },
  },
  {
    handNumber: 2,
    startedAt: secondsAgo(5400),
    button: 1,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [c("9", "hearts"), c("4", "clubs"), c("K", "spades")],
    lastStreet: "flop",
    actions: [
      fold(4),
      call(5),
      call(0),
      fold(1),
      call(2),
      check(3),
      check(5),
      raise(0),
      fold(2),
      fold(3),
      fold(5),
    ],
    outcome: { kind: "folded-out", winner: 0 },
  },
  {
    handNumber: 3,
    startedAt: secondsAgo(5100),
    button: 2,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [
      c("A", "diamonds"),
      c("7", "diamonds"),
      c("2", "spades"),
      c("Q", "diamonds"),
      c("J", "clubs"),
    ],
    lastStreet: "river",
    actions: [
      call(5),
      fold(0),
      fold(1),
      call(3),
      call(4),
      check(2),
      check(3),
      check(4),
      check(5),
      check(2),
      raise(3),
      call(4),
      fold(5),
      fold(2),
      check(3),
      check(4),
    ],
    outcome: {
      kind: "showdown",
      winners: [3],
      reveals: [
        {
          seatId: 3,
          holeCards: [c("A", "clubs"), c("Q", "hearts")],
          description: "Two pair, aces and queens",
        },
        {
          seatId: 4,
          holeCards: [c("K", "diamonds"), c("10", "diamonds")],
          description: "Flush, ace high",
        },
      ],
    },
  },
  {
    handNumber: 4,
    startedAt: secondsAgo(4800),
    button: 3,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [],
    lastStreet: "preflop",
    actions: [fold(5), fold(0), fold(1), fold(3), fold(4)],
    outcome: { kind: "folded-out", winner: 2 },
  },
  {
    handNumber: 5,
    startedAt: secondsAgo(4440),
    button: 4,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [c("6", "spades"), c("6", "hearts"), c("10", "clubs"), c("3", "spades")],
    lastStreet: "turn",
    actions: [
      raise(1),
      call(2),
      fold(3),
      fold(4),
      fold(5),
      fold(0),
      raise(2),
      raise(1),
      raise(2),
      call(1),
      raise(1),
      fold(2),
    ],
    outcome: { kind: "folded-out", winner: 1 },
  },
  {
    handNumber: 6,
    startedAt: secondsAgo(4080),
    button: 5,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [c("J", "hearts"), c("J", "spades"), c("5", "diamonds")],
    lastStreet: "flop",
    actions: [call(1), fold(2), fold(3), call(4), fold(5), check(0), check(1), raise(4), fold(0), fold(1)],
    outcome: { kind: "folded-out", winner: 4 },
  },
  {
    handNumber: 7,
    startedAt: secondsAgo(3600),
    button: 0,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [
      c("8", "clubs"),
      c("8", "diamonds"),
      c("8", "hearts"),
      c("2", "clubs"),
      c("A", "spades"),
    ],
    lastStreet: "river",
    actions: [
      call(3),
      call(4),
      fold(5),
      fold(0),
      call(1),
      fold(2),
      check(1),
      check(3),
      check(4),
      check(1),
      check(3),
      check(4),
      check(1),
      check(3),
      check(4),
    ],
    outcome: {
      kind: "showdown",
      winners: [1, 3, 4],
      reveals: [
        {
          seatId: 1,
          holeCards: [c("K", "hearts"), c("Q", "clubs")],
          description: "Three of a kind, eights",
        },
        {
          seatId: 3,
          holeCards: [c("9", "spades"), c("7", "clubs")],
          description: "Three of a kind, eights",
        },
        {
          seatId: 4,
          holeCards: [c("6", "clubs"), c("4", "hearts")],
          description: "Three of a kind, eights",
        },
      ],
    },
  },
  {
    handNumber: 8,
    startedAt: secondsAgo(3000),
    button: 1,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [],
    lastStreet: "preflop",
    actions: [raise(4), fold(5), fold(0), fold(1), fold(2), fold(3)],
    outcome: { kind: "folded-out", winner: 4 },
  },
  {
    handNumber: 9,
    startedAt: secondsAgo(2520),
    button: 2,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [c("Q", "spades"), c("3", "hearts"), c("7", "spades")],
    lastStreet: "flop",
    actions: [call(5), call(0), fold(1), fold(2), fold(3), call(4), check(4), raise(5), fold(0), fold(4)],
    outcome: { kind: "folded-out", winner: 5 },
  },
  {
    handNumber: 10,
    startedAt: secondsAgo(1980),
    button: 3,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [
      c("10", "hearts"),
      c("9", "hearts"),
      c("8", "hearts"),
      c("K", "clubs"),
      c("2", "diamonds"),
    ],
    lastStreet: "river",
    actions: [
      raise(0),
      call(1),
      fold(2),
      fold(3),
      fold(4),
      call(5),
      check(5),
      raise(0),
      call(1),
      fold(5),
      check(1),
      raise(0),
      call(1),
      check(1),
      check(0),
    ],
    outcome: {
      kind: "showdown",
      winners: [0],
      reveals: [
        {
          seatId: 0,
          holeCards: [c("J", "hearts"), c("7", "hearts")],
          description: "Straight flush, jack high",
        },
        {
          seatId: 1,
          holeCards: [c("K", "spades"), c("K", "diamonds")],
          description: "Three of a kind, kings",
        },
      ],
    },
  },
  {
    handNumber: 11,
    startedAt: secondsAgo(1200),
    button: 4,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [c("5", "clubs"), c("5", "spades"), c("A", "hearts"), c("4", "diamonds")],
    lastStreet: "turn",
    actions: [fold(0), call(1), call(2), fold(3), fold(4), call(5), check(1), check(2), check(5), raise(2), fold(5), fold(1)],
    outcome: { kind: "folded-out", winner: 2 },
  },
  {
    handNumber: 12,
    startedAt: secondsAgo(480),
    button: 5,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [],
    lastStreet: "preflop",
    actions: [fold(2), fold(3), fold(4), fold(5), fold(0)],
    outcome: { kind: "folded-out", winner: 1 },
  },
  {
    handNumber: 13,
    startedAt: secondsAgo(95),
    button: 0,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [c("2", "hearts"), c("7", "clubs"), c("K", "hearts"), c("K", "spades")],
    lastStreet: "turn",
    actions: [call(3), fold(4), fold(5), call(0), fold(1), fold(2), check(0), check(3), raise(3), fold(0)],
    outcome: { kind: "folded-out", winner: 3 },
  },
  {
    handNumber: 14,
    startedAt: secondsAgo(20),
    button: 1,
    dealtIn: [0, 1, 2, 3, 4, 5],
    board: [c("A", "clubs"), c("K", "clubs"), c("4", "hearts")],
    lastStreet: "flop",
    actions: [call(4), call(5), fold(0), fold(1), call(2), fold(3), check(2)],
    outcome: { kind: "in-progress" },
  },
];
