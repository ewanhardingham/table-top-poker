import type { HandEvent, SeatView } from "@table-top-poker/protocol";
import { actionVerb } from "../actionWords.js";
import { seatLabel } from "../seatLabel.js";
import { showdownVerdict } from "../showdownVerdict.js";
import { streetLabel } from "./beats.js";

const boardName = {
  flop: "The flop",
  turn: "The turn",
  river: "The river",
} as const;

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${String(names.at(-1))}`;
}

function winnersCaption(
  event: Extract<HandEvent, { type: "WinnersDeclared" }>,
  seats: readonly SeatView[],
): string {
  const { names, verb } = showdownVerdict(event.winners, [], seats);
  return `${joinNames(names)} ${verb}`;
}

/** The beat just landed on — see Caption in `CONTEXT.md`. */
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
    case "CardBurned":
      return "A card burns";
    case "HandFoldedOut":
      return `${seatLabel(event.winner, seats)} wins, everyone else folded`;
    case "HoleCardsTabled":
      return `${joinNames(event.seats.map((seat) => seatLabel(seat, seats)))} ${
        event.seats.length === 1 ? "tables" : "table"
      }`;
    case "ShowdownReached":
      return "Showdown";
    case "HoleCardsShown":
      return `${seatLabel(event.result.seatId, seats)} shows ${event.result.description}`;
    case "HoleCardsMucked":
      return `${seatLabel(event.seatId, seats)} mucks`;
    case "WinnersDeclared":
      return winnersCaption(event, seats);
    case "HandComplete":
      return "Hand complete";
  }
}
