import type {
  Card,
  HandEvent,
  TableReplayPosition,
} from "@table-top-poker/protocol";
import { describe, expect, it } from "vitest";
import { beatAt, chaptersOf, toBeats } from "./beats.js";

const noHand = { phase: "no-hand", button: 0 } as const;

/**
 * Positions carry a view the beat model never reads, so every fixture here
 * pairs its events with the same placeholder — what a beat is made of is the
 * question under test.
 */
function positionsFor(
  events: readonly HandEvent[],
): readonly TableReplayPosition[] {
  return [
    { event: null, view: noHand },
    ...events.map((event) => ({ event, view: noHand })),
  ];
}

const card = (rank: Card["rank"]): Card => ({ rank, suit: "clubs" });

/** The engine's own cascade order: close, burn, deal, start. */
function streetCascade(street: "flop" | "turn" | "river"): HandEvent[] {
  const previous = { flop: "preflop", turn: "flop", river: "turn" } as const;
  return [
    { type: "StreetClosed", street: previous[street] },
    { type: "CardBurned", street, card: null },
    { type: "BoardDealt", street, cards: [card("2")] },
    { type: "StreetStarted", street, actor: 1 },
  ];
}

const toTheTurn: readonly HandEvent[] = [
  { type: "HandStarted", seed: "s", button: 0 },
  { type: "HoleCardsDealt", deals: [] },
  { type: "StreetStarted", street: "preflop", actor: 1 },
  { type: "ActionTaken", seatId: 1, action: "call" },
  ...streetCascade("flop"),
  { type: "ActionTaken", seatId: 1, action: "check" },
  ...streetCascade("turn"),
  { type: "ActionTaken", seatId: 1, action: "raise" },
];

describe("toBeats", () => {
  it("gives every event ordinal a beat, and position 0 none", () => {
    const beats = toBeats(positionsFor(toTheTurn));

    expect(beats).toHaveLength(toTheTurn.length);
    expect(beats.map((beat) => beat.position)).toEqual(
      toTheTurn.map((_event, index) => index + 1),
    );
  });

  it("marks each segment's first beat, which the track draws heavier", () => {
    const beats = toBeats(positionsFor(toTheTurn));

    expect(
      beats
        .filter((beat) => beat.isSegmentBoundary)
        .map((beat) => beat.position),
    ).toEqual([3, 6, 11]);
  });

  it("stamps a burn and its board with the street they open, not the one they end", () => {
    const beats = toBeats(positionsFor(toTheTurn));

    // ordinal 5 is `StreetClosed preflop`, 6 the flop's burn, 7 its `BoardDealt`.
    expect(beatAt(beats, 5)?.segment).toBe("preflop");
    expect(beatAt(beats, 6)?.segment).toBe("flop");
    expect(beatAt(beats, 7)?.segment).toBe("flop");
  });

  it("holds the beats that change the felt longer than the bookkeeping", () => {
    const beats = toBeats(positionsFor(toTheTurn));
    const weightOf = (position: number) => beatAt(beats, position)?.weight ?? 0;

    expect(weightOf(7)).toBeGreaterThan(weightOf(5));
  });

  it("has no beat before the hand starts", () => {
    expect(beatAt(toBeats(positionsFor(toTheTurn)), 0)).toBeNull();
  });
});

describe("chaptersOf", () => {
  it("anchors a street on its burn, so the flame plays on a Chapter seek", () => {
    const chapters = chaptersOf(toBeats(positionsFor(toTheTurn)));

    expect(chapters).toEqual([
      { segment: "preflop", label: "Preflop", position: 3 },
      { segment: "flop", label: "Flop", position: 6 },
      { segment: "turn", label: "Turn", position: 11 },
    ]);
  });

  it("offers only the segments the hand reached", () => {
    const walk: HandEvent[] = [
      { type: "HandStarted", seed: "s", button: 0 },
      { type: "StreetStarted", street: "preflop", actor: 1 },
      { type: "ActionTaken", seatId: 1, action: "fold" },
      { type: "HandFoldedOut", winner: 0 },
      { type: "HandComplete" },
    ];

    expect(chaptersOf(toBeats(positionsFor(walk)))).toEqual([
      { segment: "preflop", label: "Preflop", position: 2 },
    ]);
  });

  it("names each segment once, however many beats it holds", () => {
    const chapters = chaptersOf(toBeats(positionsFor(toTheTurn)));

    expect(new Set(chapters.map((chapter) => chapter.segment)).size).toBe(
      chapters.length,
    );
  });

  it("chapters the showdown, which is no street but its own place to seek", () => {
    const toShowdown: HandEvent[] = [
      ...toTheTurn.slice(0, 5),
      ...streetCascade("flop"),
      ...streetCascade("turn"),
      ...streetCascade("river"),
      { type: "StreetClosed", street: "river" },
      { type: "ShowdownReached", contestants: [1, 2] },
      { type: "HandComplete" },
    ];

    const chapters = chaptersOf(toBeats(positionsFor(toShowdown)));

    expect(chapters.at(-1)).toEqual({
      segment: "showdown",
      label: "Showdown",
      position:
        toShowdown.findIndex((event) => event.type === "ShowdownReached") + 1,
    });
  });

  it("seeks each chapter to the beat the track draws heaviest", () => {
    const beats = toBeats(positionsFor(toTheTurn));

    expect(chaptersOf(beats).map((chapter) => chapter.position)).toEqual(
      beats
        .filter((beat) => beat.isSegmentBoundary)
        .map((beat) => beat.position),
    );
  });
});
