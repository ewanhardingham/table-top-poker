export type ClaimErrorCode =
  | "room-not-found"
  | "seat-not-found"
  | "seat-already-claimed"
  | "invalid-display-name"
  | "duplicate-display-name"
  | "claim-failed";

/**
 * Keep server claim errors specific when a claim races a room update. Anything
 * the server did not name — a network failure, a 500 — falls back to
 * `claim-failed` rather than to an occupied seat: telling a player someone
 * took the seat sends them hunting for another one when the seat was fine.
 */
export function claimErrorCode(error: unknown): ClaimErrorCode {
  const code = error instanceof Error ? error.message : "";
  if (
    code === "room-not-found" ||
    code === "seat-not-found" ||
    code === "seat-already-claimed" ||
    code === "invalid-display-name" ||
    code === "duplicate-display-name"
  ) {
    return code;
  }
  return "claim-failed";
}
