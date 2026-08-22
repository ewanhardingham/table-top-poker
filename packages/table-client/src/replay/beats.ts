import type {
  HandEvent,
  Street,
  TableReplayPosition,
} from "@table-top-poker/protocol";

/** A stretch of a Hand the Scrub can chapter — see Segment in `CONTEXT.md`. */
export type Segment = Street | "showdown";

/** One Event ordinal, dressed for the transport — see Replay position in `CONTEXT.md`. */
export interface Beat {
  readonly position: number;
  readonly segment: Segment | null;
  /** How long autoplay holds here, in ms. */
  readonly weight: number;
  /** One flag for the heavier tick and the Chapter seek, so the two cannot drift apart. */
  readonly isSegmentBoundary: boolean;
}

export const streetLabel: Record<Street, string> = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

export const segmentLabel: Record<Segment, string> = {
  ...streetLabel,
  showdown: "Showdown",
};

/** Autoplay pacing: what changes the felt is held, bookkeeping goes past quickly. */
const WEIGHTS: Record<HandEvent["type"], number> = {
  HandStarted: 900,
  HoleCardsDealt: 1400,
  StreetStarted: 500,
  ActionTaken: 700,
  StreetClosed: 200,
  BoardDealt: 1600,
  HandFoldedOut: 2400,
  ShowdownReached: 3200,
  HoleCardsShown: 1600,
  HoleCardsMucked: 1600,
  WinnersDeclared: 2400,
  HandComplete: 2000,
};

/** A beat belongs to the segment it *shows* — see Chapter in `CONTEXT.md`. */
export function segmentOf(
  event: HandEvent,
  current: Segment | null,
): Segment | null {
  if (event.type === "StreetStarted" || event.type === "BoardDealt") {
    return event.street;
  }
  if (event.type === "ShowdownReached") return "showdown";
  return current;
}

export function toBeats(
  positions: readonly TableReplayPosition[],
): readonly Beat[] {
  let segment: Segment | null = null;
  const beats: Beat[] = [];

  for (const [index, position] of positions.entries()) {
    const event = position.event;
    if (event === null) continue;
    const previous = segment;
    segment = segmentOf(event, segment);
    beats.push({
      position: index,
      segment,
      weight: WEIGHTS[event.type],
      isSegmentBoundary: segment !== null && segment !== previous,
    });
  }
  return beats;
}

export interface Chapter {
  readonly segment: Segment;
  readonly label: string;
  /** The ordinal the chip seeks to. */
  readonly position: number;
}

/** The Scrub's landmarks — see Chapter in `CONTEXT.md`. */
export function chaptersOf(beats: readonly Beat[]): readonly Chapter[] {
  return beats.flatMap((beat) => {
    const segment = beat.segment;
    if (!beat.isSegmentBoundary || segment === null) return [];
    return [{ segment, label: segmentLabel[segment], position: beat.position }];
  });
}

export function beatAt(beats: readonly Beat[], position: number): Beat | null {
  if (position <= 0) return null;
  return beats[position - 1] ?? null;
}

/** A hand opens on an empty felt, where there is nothing to hold on. */
const LEAD_IN = 400;

/** The weight of the Event that put the felt in the state now on screen. */
export function holdAt(beats: readonly Beat[], position: number): number {
  return beatAt(beats, position)?.weight ?? LEAD_IN;
}
