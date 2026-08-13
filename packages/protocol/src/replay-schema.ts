import { z } from "zod";

/**
 * Wire-level shape of a replay request a client sends over the *existing*
 * room socket — no separate HTTP route, because the socket already carries
 * room and per-seat identity from connect time (Phase 2 spec #129 §5).
 *
 * A deliberate sibling of `ClientCommandSchema` rather than a member of it:
 * a replay request never reaches `decide`, but it is untrusted JSON crossing
 * the same boundary, so it is parsed by the same Zod seam before the server
 * acts on it.
 *
 * The room is never client-supplied here — the server reads it off the
 * authenticated socket, exactly as it does for a command.
 */
export const ReplayRequestSchema = z.discriminatedUnion("type", [
  /** "Send me every hand this session has played." */
  z.strictObject({ type: z.literal("list-hands") }),
  /** "Send me hand N", addressed by the 1-based ordinal a summary carries. */
  z.strictObject({
    type: z.literal("get-hand"),
    handOrdinal: z.int().positive(),
  }),
]);

export type ReplayRequest = z.infer<typeof ReplayRequestSchema>;
export type ReplayRequestType = ReplayRequest["type"];
