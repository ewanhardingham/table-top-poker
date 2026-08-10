import type { SoundSettings } from "@table-top-poker/protocol";

/**
 * The six production cues, each backed by one canonical AAC `.m4a` asset
 * (#185) served same-origin from `public/sounds/`. Card foley — deal, board,
 * fold, flip (reveal/conceal), check-knock — plus the one non-card cue, the
 * your-turn prompt. `call`/`raise` are deliberately unallocated: no chip asset
 * exists yet.
 */
export const CUE_FILES = {
  deal: "deal.m4a",
  board: "board.m4a",
  fold: "fold.m4a",
  check: "check.m4a",
  flip: "flip.m4a",
  yourTurn: "your-turn.m4a",
} as const satisfies Record<string, string>;

export type CueName = keyof typeof CUE_FILES;

export const CUE_NAMES = Object.keys(CUE_FILES) as CueName[];

/**
 * Which room-level category (#182) each cue belongs to. `cards` is the tactile
 * card foley; `notifications` is the your-turn prompt. A cue plays only when
 * the room's master switch and its category are both on — see `cueAllowed`.
 */
export const CUE_CATEGORY: Record<CueName, "cards" | "notifications"> = {
  deal: "cards",
  board: "cards",
  fold: "cards",
  check: "cards",
  flip: "cards",
  yourTurn: "notifications",
};

/**
 * Whether the room's settings (#182) currently allow this cue: the master
 * switch on, and the cue's category (cards / notifications) on. This is the
 * real mute path — the table owns it and it reaches every surface via
 * `room-view`.
 */
export function cueAllowed(settings: SoundSettings, cue: CueName): boolean {
  if (!settings.sounds) return false;
  return CUE_CATEGORY[cue] === "cards"
    ? settings.cards
    : settings.notifications;
}
