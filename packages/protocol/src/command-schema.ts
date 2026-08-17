import { z } from "zod";

export const ClientCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("startHand") }),
  z.strictObject({ type: z.literal("fold") }),
  z.strictObject({ type: z.literal("check") }),
  z.strictObject({ type: z.literal("call") }),
  z.strictObject({ type: z.literal("raise") }),
  z.strictObject({ type: z.literal("nextHand") }),
  z.strictObject({ type: z.literal("sitOut") }),
  z.strictObject({ type: z.literal("sitIn") }),
]);

export type ClientCommand = z.infer<typeof ClientCommandSchema>;
export type ClientCommandType = ClientCommand["type"];
