import type {
  RejectionReason,
  ServerRejectionReason,
} from "@table-top-poker/protocol";

/**
 * Display copy for an inline rejection, exhaustively switched
 * (eslint's switch-exhaustiveness-check) so a new reason code added to
 * either union is a build failure here, not a silent blank message.
 * `hand-already-in-progress` and `stale-next-hand` can't actually reach an
 * action button (they're `startHand`/`nextHand`-only reasons) but the type
 * doesn't know that, so they get terse copy rather than a `default`.
 */
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
