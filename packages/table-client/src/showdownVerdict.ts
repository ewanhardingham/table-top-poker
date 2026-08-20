import type { SeatView } from "@table-top-poker/protocol";
import { seatLabel } from "./seatLabel.js";

interface Revealed {
  readonly seatId: number;
  readonly description: string;
}

export interface ShowdownVerdict {
  readonly names: readonly string[];
  readonly verb: "wins" | "split";
  readonly description: string | undefined;
}

export function showdownVerdict(
  winners: readonly number[],
  revealed: readonly Revealed[],
  seats: readonly SeatView[],
): ShowdownVerdict {
  return {
    names: winners.map((seatId) => seatLabel(seatId, seats)),
    verb: winners.length > 1 ? "split" : "wins",
    description: revealed.find((reveal) => winners.includes(reveal.seatId))
      ?.description,
  };
}
