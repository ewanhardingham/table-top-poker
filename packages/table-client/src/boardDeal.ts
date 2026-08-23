import type { Card } from "@table-top-poker/protocol";

export interface DealtCard {
  readonly card: Card;
  readonly key: string;
  readonly initial:
    | {
        readonly opacity: number;
        readonly y: number;
        readonly rotate: number;
        readonly scale: number;
      }
    | false;
  readonly duration: number;
  readonly delay: number;
}

/** `Card` sizes off its font size, so the burn pile matches the board through this. */
export const BOARD_CARD_EM = 2.4;

const arriving = { opacity: 0, y: -18, rotate: -6, scale: 0.9 } as const;

export function cardKey(card: Card): string {
  return `${card.rank}${card.suit}`;
}

export function boardKeys(board: readonly Card[]): ReadonlySet<string> {
  return new Set(board.map(cardKey));
}

export function dealBoard(
  board: readonly Card[],
  alreadyDealt: ReadonlySet<string>,
  leadIn = 0,
): readonly DealtCard[] {
  let arrived = 0;
  return board.map((card) => {
    const key = cardKey(card);
    if (alreadyDealt.has(key)) {
      return { card, key, initial: false, duration: 0, delay: 0 };
    }
    const delay = leadIn + arrived * 0.08;
    arrived += 1;
    return { card, key, initial: arriving, duration: 0.4, delay };
  });
}
