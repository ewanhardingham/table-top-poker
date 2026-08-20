import type { HandEvent, SeatId } from "@table-top-poker/protocol";

/** One function for the live fan-out and replay alike — see Secrecy in `docs/design/server.md`. */
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
