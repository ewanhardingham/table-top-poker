/**
 * PROTOTYPE — throwaway, wayfinder ticket #82.
 *
 * A **beat** is one event ordinal dressed for a human: a caption, the street
 * it belongs to, and — the contested part — a *duration*. The ticket asks
 * whether timing should be uniform or weighted per event type; this module is
 * where that answer is written down, so the two can be compared by flipping
 * one flag rather than by rewriting a variant.
 */
import type { HandEvent, SeatId, Street } from "@table-top-poker/protocol";

export interface Beat {
  /** Event ordinal this beat *arrives at* — the state after applying it. */
  readonly position: number;
  readonly caption: string;
  /** Street this beat belongs to, or null before the first street starts. */
  readonly street: Street | null;
  /** How long autoplay holds here, in ms, at 1x. */
  readonly weight: number;
  /** Structural beats a street-chaptered transport can jump between. */
  readonly isStreetStart: boolean;
  readonly kind: HandEvent["type"];
}

const seatLabel = (seatId: SeatId) => `Seat ${String(seatId + 1)}`;

const streetLabel: Record<Street, string> = {
  preflop: "Preflop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
};

const actionLabel: Record<string, string> = {
  fold: "folds",
  check: "checks",
  call: "calls",
  raise: "raises",
};

/**
 * The weighting under test. The shape of it is the claim: the beats that
 * *change what is on the felt* (a deal, a board, a showdown) are held, and
 * the beats that only advance the bookkeeping (a street closing, a fold) go
 * past quickly. `StreetClosed` is deliberately near-instant — it is a real
 * ordinal that the map insists stays addressable, but it has nothing to show.
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

/** The uniform comparison: every ordinal gets the same hold. */
export const UNIFORM_WEIGHT = 850;

function captionFor(event: HandEvent): string {
  switch (event.type) {
    case "HandStarted":
      return `Hand begins — button on ${seatLabel(event.button)}`;
    case "HoleCardsDealt":
      return `Hole cards dealt to ${String(event.deals.length)} seats`;
    case "StreetStarted":
      return `${streetLabel[event.street]} — ${seatLabel(event.actor)} to act`;
    case "ActionTaken":
      return `${seatLabel(event.seatId)} ${actionLabel[event.action] ?? event.action}`;
    case "StreetClosed":
      return `${streetLabel[event.street]} betting closed`;
    case "BoardDealt":
      return `${streetLabel[event.street]} dealt`;
    case "HandFoldedOut":
      return `${seatLabel(event.winner)} wins — everyone folded`;
    case "ShowdownReached":
      return `Showdown — ${event.winners.map(seatLabel).join(" & ")} ${
        event.winners.length > 1 ? "split" : "wins"
      }`;
    case "HandComplete":
      return "Hand complete";
  }
}

/** Dresses an event log as beats, carrying the street forward across events. */
export function toBeats(events: readonly HandEvent[]): readonly Beat[] {
  let street: Street | null = null;
  return events.map((event, i) => {
    if (event.type === "StreetStarted") street = event.street;
    return {
      position: i + 1,
      caption: captionFor(event),
      street,
      weight: WEIGHTS[event.type],
      isStreetStart: event.type === "StreetStarted",
      kind: event.type,
    };
  });
}

export interface Chapter {
  readonly street: Street;
  readonly label: string;
  /** Position to seek to so the street's first beat is the one just landed. */
  readonly position: number;
}

/**
 * Street chapters, for the transport that offers jumping by street. The
 * ticket asks whether this is even meaningful given streets auto-cascade
 * inside one `decide` call — it is, because the cascade still emits its
 * parts as separate ordinals, so a street boundary is addressable even
 * though no human command sits at it.
 *
 * The anchor is the street's `BoardDealt`, **not** its `StreetStarted`. The
 * engine's cascade emits `StreetClosed → BoardDealt → StreetStarted`, so
 * seeking to the street start lands one beat *after* the cards appeared and
 * a viewer who taps "Turn" never sees the turn card arrive. Preflop has no
 * board, so it falls back to its street start.
 */
export function chaptersOf(beats: readonly Beat[]): readonly Chapter[] {
  const chapters: Chapter[] = [];
  const seen = new Set<Street>();

  for (const beat of beats) {
    if (beat.street === null) continue;
    const isAnchor = beat.kind === "BoardDealt" || beat.isStreetStart;
    if (!isAnchor) continue;

    // A `BoardDealt` carries the street it *opens*, but `toBeats` stamps it
    // with the street still in progress — so read the street it leads into
    // from the start that follows it.
    const street =
      beat.kind === "BoardDealt"
        ? (beats[beat.position]?.street ?? beat.street)
        : beat.street;

    if (seen.has(street)) continue;
    seen.add(street);
    chapters.push({
      street,
      label: streetLabel[street],
      position: beat.position,
    });
  }
  return chapters;
}

export function beatAt(beats: readonly Beat[], position: number): Beat | null {
  if (position <= 0) return null;
  return beats[position - 1] ?? null;
}
