import { z } from "zod";

/**
 * Wire-level shape of a command a client sends over the room WebSocket —
 * deliberately thinner than the engine's `Command` type. `playerId` is
 * never trusted from the client: the server derives it from the
 * authenticated socket (room/seat/token query params, §6). `seed` is
 * never client-supplied either: the server generates it via CSPRNG
 * (docs/phase-1-spec.md §3). Both fields get filled in server-side before
 * reaching `decide`.
 */
export const ClientCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("startHand") }),
  z.strictObject({ type: z.literal("fold") }),
  z.strictObject({ type: z.literal("check") }),
  z.strictObject({ type: z.literal("call") }),
  z.strictObject({ type: z.literal("raise") }),
  z.strictObject({ type: z.literal("nextHand") }),
  /** Voluntary seat state (ADR-0002) — never reaches the engine, handled at the room-store layer only. */
  z.strictObject({ type: z.literal("sitOut") }),
  z.strictObject({ type: z.literal("sitIn") }),
]);

export type ClientCommand = z.infer<typeof ClientCommandSchema>;
export type ClientCommandType = ClientCommand["type"];
