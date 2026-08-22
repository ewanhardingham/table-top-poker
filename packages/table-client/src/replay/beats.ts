import type {
  HandEvent,
  Street,
  TableReplayPosition,
} from "@table-top-poker/protocol";

/** One Event ordinal, dressed for the transport — see Replay position in `CONTEXT.md`. */
export interface Beat {
  readonly position: number;
  readonly street: Street | null;
  /** How long autoplay holds here, in ms. */
  readonly weight: number;
  /** One flag for the heavier tick and the Chapter seek, so the two cannot drift apart. */
  readonly isStreetBoundary: boolean;
}

export const streetLabel: Record<Street, string> = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
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

/** A beat belongs to the street it *shows* — see Chapter in `CONTEXT.md`. */
export function streetOf(
  event: HandEvent,
  current: Street | null,
): Street | null {
  if (event.type === "StreetStarted" || event.type === "BoardDealt") {
    return event.street;
  }
  return current;
}

export function toBeats(
  positions: readonly TableReplayPosition[],
): readonly Beat[] {
  let street: Street | null = null;
  const beats: Beat[] = [];

  for (const [index, position] of positions.entries()) {
    const event = position.event;
    if (event === null) continue;
    const previous = street;
    street = streetOf(event, street);
    beats.push({
      position: index,
      street,
      weight: WEIGHTS[event.type],
      isStreetBoundary: street !== null && street !== previous,
    });
  }
  return beats;
}

export interface Chapter {
  readonly street: Street;
  readonly label: string;
  /** The ordinal the chip seeks to. */
  readonly position: number;
}

/** The Scrub's street landmarks — see Chapter in `CONTEXT.md`. */
export function chaptersOf(beats: readonly Beat[]): readonly Chapter[] {
  return beats.flatMap((beat) => {
    const street = beat.street;
    if (!beat.isStreetBoundary || street === null) return [];
    return [{ street, label: streetLabel[street], position: beat.position }];
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
