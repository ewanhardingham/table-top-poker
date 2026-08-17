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
    case "invalid-command":
      return "That didn't go through — try again.";
    case "room-not-found":
      return "This room no longer exists.";
    case "not-enough-players":
      return "Not enough players to start.";
    case "not-permitted":
      return "That's not something you can do.";
  }
}
