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
 * The measured length of each cue's AAC asset, in ms (rounded up from the
 * container duration). The beat queue uses these as an action's execution time
 * so the next beat — the board deal especially — opens only once the sound it
 * would collide with has finished. Keep in step with the assets in
 * `public/sounds/`; the check knock is the long one that drove this (#186).
 */
export const CUE_DURATIONS_MS: Record<CueName, number> = {
  deal: 601,
  board: 690,
  fold: 766,
  check: 1323,
  flip: 460,
  yourTurn: 2143,
};

/**
 * The fraction past a cue's measured length to hold the next beat: a tail so
 * the following beat opens after the sound has clearly finished rather than
 * clipping its decay. 1.3 = the clip plus 30%.
 */
export const CUE_SETTLE_BUFFER = 1.3;

/**
 * How long a sounded cue should hold the next presentation beat — its measured
 * length plus the settle buffer, rounded up to whole ms. The one source of
 * truth for both the table's beat queue (`tableBeatDuration`) and the phone's
 * your-turn hold (`checkKnockSettleMs`), so retuning an asset's length moves
 * both in step instead of leaving a hand-copied constant to drift.
 */
export function cueSettleMs(cue: CueName): number {
  return Math.ceil(CUE_DURATIONS_MS[cue] * CUE_SETTLE_BUFFER);
}

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
