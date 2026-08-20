import type {
  HandEvent,
  Street,
  TableReplayPosition,
} from "@table-top-poker/protocol";

/**
 * One Event ordinal, dressed for the transport. Position is the Event ordinal
 * throughout (Phase 2 spec #129 §2) — beat *n* is the state after applying
 * *n* Events, so position 0 has no beat.
 */
export interface Beat {
  readonly position: number;
  readonly street: Street | null;
  /** How long autoplay holds here, in ms. */
  readonly weight: number;
  /**
   * The first beat of its street: the track draws it heavier and a Chapter
   * seeks to it. One flag for both, so a chip can never land beside the tick
   * marking the boundary it names.
   */
  readonly isStreetBoundary: boolean;
}

const streetLabel: Record<Street, string> = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

/**
 * Autoplay's per-event pacing: beats that *change what is on the felt* are
 * held, and beats that only advance the bookkeeping go past quickly (§6).
 */
const WEIGHTS: Record<HandEvent["type"], number> = {
  HandStarted: 900,
  HoleCardsDealt: 1400,
  StreetStarted: 500,
  ActionTaken: 700,
  StreetClosed: 200,
  BoardDealt: 1600,
  HandFoldedOut: 2400,
  ShowdownReached: 3200,
  HandComplete: 2000,
};

/** A beat belongs to the street it *shows* — see Chapter in `CONTEXT.md`. */
function streetOf(event: HandEvent, current: Street | null): Street | null {
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

/**
 * How long autoplay stays at `position`: the weight of the Event that put the
 * felt in the state now on screen, so a board deal is held and a
 * `StreetClosed` is passed straight through.
 */
export function holdAt(beats: readonly Beat[], position: number): number {
  return beatAt(beats, position)?.weight ?? LEAD_IN;
}
