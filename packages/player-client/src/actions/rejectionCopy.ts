import type {
  RejectionReason,
  ServerRejectionReason,
} from "@table-top-poker/protocol";

export function rejectionCopy(
  reason: RejectionReason | ServerRejectionReason,
): string {
  switch (reason) {
    case "not-your-turn":
      return "It's not your turn yet.";
    case "action-not-legal":
      return "That action isn't available right now.";
    case "hand-not-in-progress":
      return "There's no hand in progress.";
    case "hand-already-in-progress":
      return "A hand is already in progress.";
    case "stale-next-hand":
      return "That hand has already moved on.";
    case "not-at-showdown":
      return "There's no hand of yours to show.";
    case "showdown-unresolved":
      return "The hands are still being turned over.";
    case "invalid-command":
      return "That didn't go through — try again.";
    case "room-not-found":
      return "This room no longer exists.";
    case "not-enough-players":
      return "Not enough players to start.";
    case "not-permitted":
      return "That's not something you can do.";
    case "hand-unavailable":
      // Replay is a table-device surface; a phone never sends the request
      // this answers, so this exists only to keep the switch exhaustive.
      return "Hand review isn't available here.";
    case "recording-paused":
      return "The table paused the game to fix a recording problem.";
  }
}
