import { z } from "zod";

/**
 * A sibling of `ClientCommandSchema`, not a member: a replay request never
 * reaches `decide`, but crosses the same untrusted boundary. The room is read
 * off the authenticated socket, never client-supplied.
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
