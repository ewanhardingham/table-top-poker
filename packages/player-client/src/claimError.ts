export type ClaimErrorCode =
  | "room-not-found"
  | "seat-not-found"
  | "seat-already-claimed"
  | "invalid-display-name"
  | "duplicate-display-name"
  | "claim-failed";

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
