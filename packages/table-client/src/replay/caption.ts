import type {
  ActionType,
  HandEvent,
  SeatView,
} from "@table-top-poker/protocol";
import { seatLabel } from "../seatLabel.js";
import { streetLabel } from "./beats.js";

const actionVerb: Record<ActionType, string> = {
  fold: "folded",
  check: "checked",
  call: "called",
  raise: "raised",
};

const boardName = {
  flop: "The flop",
  turn: "The turn",
  river: "The river",
} as const;

function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${String(names.at(-1))}`;
}

function showdownCaption(
  event: Extract<HandEvent, { type: "ShowdownReached" }>,
  seats: readonly SeatView[],
): string {
  const winners = listOf(
    event.winners.map((seatId) => seatLabel(seatId, seats)),
  );
  const description = event.results.find((result) =>
    event.winners.includes(result.seatId),
  )?.description;
  const verb = event.winners.length > 1 ? "split" : "wins";
  const hand = description === undefined ? "" : ` with ${description}`;
  return `Showdown — ${winners} ${verb}${hand}`;
}

/**
 * The beat just landed on, in the language of a poker table. The Event
 * ordinal is the model's addressing scheme and never appears here: the track
 * shows progress, the caption says what happened (Phase 2 spec #129 §6).
 */
export function captionFor(
  event: HandEvent | null,
  seats: readonly SeatView[],
): string | null {
  if (event === null) return null;

  switch (event.type) {
    case "HandStarted":
      return "Hand begins";
    case "HoleCardsDealt":
      return "Hole cards dealt";
    case "StreetStarted":
      return `${streetLabel[event.street]} betting`;
    case "ActionTaken":
      return `${seatLabel(event.seatId, seats)} ${actionVerb[event.action]}`;
    case "StreetClosed":
      return `${streetLabel[event.street]} betting complete`;
    case "BoardDealt":
      return boardName[event.street];
    case "HandFoldedOut":
      return `${seatLabel(event.winner, seats)} wins, everyone else folded`;
    case "ShowdownReached":
      return showdownCaption(event, seats);
    case "HandComplete":
      return "Hand complete";
  }
}
