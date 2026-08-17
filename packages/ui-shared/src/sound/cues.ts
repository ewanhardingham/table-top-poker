import type { SoundSettings } from "@table-top-poker/protocol";

export const CUE_FILES = {
  deal: "deal.wav",
  board: "board.wav",
  fold: "fold.wav",
  check: "check.wav",
  flip: "flip.wav",
  yourTurn: "your-turn.wav",
} as const satisfies Record<string, string>;

export type CueName = keyof typeof CUE_FILES;

export const CUE_NAMES = Object.keys(CUE_FILES) as CueName[];

export const CUE_CATEGORY: Record<
  CueName,
  "cards" | "actions" | "notifications"
> = {
  deal: "cards",
  board: "cards",
  fold: "actions",
  check: "actions",
  flip: "cards",
  yourTurn: "notifications",
};

export function cueAllowed(settings: SoundSettings, cue: CueName): boolean {
  if (!settings.sounds) return false;
  switch (CUE_CATEGORY[cue]) {
    case "cards":
      return settings.cards;
    case "actions":
      return settings.actions;
    case "notifications":
      return settings.notifications;
  }
}
