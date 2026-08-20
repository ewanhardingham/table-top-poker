import type { HandEvent, SeatId } from "@table-top-poker/protocol";

/**
 * The Event as one identity may see it. Only `HoleCardsDealt` carries
 * anything private: the table is told the deal happened and to whom nothing,
 * and a seat is told only its own two cards (Phase 1 spec #130 §4).
 *
 * Shared by the live fan-out and the replay adapter so the visibility
 * boundary is one function — a replay that re-derived it could drift into
 * showing the room cards it never saw live.
 */
export function redactEventFor(
  event: HandEvent,
  identity: SeatId | "table",
): HandEvent {
  if (event.type !== "HoleCardsDealt") return event;
  return {
    ...event,
    deals:
      identity === "table"
        ? []
        : event.deals.filter((deal) => deal.seatId === identity),
  };
}
