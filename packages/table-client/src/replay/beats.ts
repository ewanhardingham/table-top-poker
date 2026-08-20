import type {
  HandEvent,
  Street,
  TableReplayPosition,
} from "@table-top-poker/protocol";

/**
 * One Event ordinal, dressed for the transport: the street it belongs to, how
 * long autoplay holds on it, and whether it opens a street.
 *
 * Position is the Event ordinal throughout (Phase 2 spec #129 §2) — beat *n*
 * is the state after applying *n* Events, so position 0 has no beat.
 */
export interface Beat {
  readonly position: number;
  readonly street: Street | null;
  /** How long autoplay holds here, in ms. */
  readonly weight: number;
  readonly isStreetStart: boolean;
}

const streetLabel: Record<Street, string> = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

/**
 * Autoplay's per-event pacing. The shape is the claim: beats that *change
 * what is on the felt* (a deal, a board, a showdown) are held, and beats that
 * only advance the bookkeeping go past quickly — `StreetClosed` is
 * near-instant, being a real ordinal with nothing to show.
 *
 * Weighting redistributes attention rather than saving time: measured against
 * a 33-event fixture it ran 27.7s to uniform's 28.1s, which is why autoplay
 * is the secondary control and the scrub is the primary one (§6).
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

/**
 * A beat belongs to the street it *shows*, which for a `BoardDealt` is the
 * street it opens rather than the one still in progress when it lands. That
 * stamping is what puts each street's first beat on its `BoardDealt`, and
 * `chaptersOf` needs no special case for the cascade.
 */
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
    street = streetOf(event, street);
    beats.push({
      position: index,
      street,
      weight: WEIGHTS[event.type],
      isStreetStart: event.type === "StreetStarted",
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

/**
 * The named landmarks people navigate by — "on the turn, when Seat 4 raised".
 * Each street's first beat is its anchor, which for every street after
 * preflop is its `BoardDealt`: the engine's cascade emits `StreetClosed →
 * BoardDealt → StreetStarted`, so anchoring on the street start would land
 * *after* the cards appeared and a viewer tapping "Turn" would never see the
 * turn card arrive (§6).
 */
export function chaptersOf(beats: readonly Beat[]): readonly Chapter[] {
  const chapters: Chapter[] = [];
  const seen = new Set<Street>();

  for (const beat of beats) {
    if (beat.street === null || seen.has(beat.street)) continue;
    seen.add(beat.street);
    chapters.push({
      street: beat.street,
      label: streetLabel[beat.street],
      position: beat.position,
    });
  }
  return chapters;
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
