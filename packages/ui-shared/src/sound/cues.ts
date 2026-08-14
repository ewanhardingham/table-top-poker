import type { SoundSettings } from "@table-top-poker/protocol";

/**
 * The six production cues, each backed by one canonical `.wav` asset (#185)
 * served same-origin from `public/sounds/`. Card foley — deal, board, fold,
 * flip (reveal/conceal), check-knock — plus the one non-card cue, the your-turn
 * prompt. `call`/`raise` are deliberately unallocated: no chip asset exists yet.
 *
 * WAV (uncompressed PCM), not AAC/`.m4a`: iOS Safari's `decodeAudioData` reject
 * the AAC set on some devices (an iPadOS 27 table returned "Decoding failed" for
 * every file while the same build decoded them on an iPhone) — PCM needs no
 * codec, so it decodes on every surface. The clips are short, so the size cost
 * is a few hundred KB each, warmed once on unlock.
 */
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

/**
 * Which room-level category (#182) each cue belongs to. `cards` is the tactile
 * card foley (deal, board, flip); `actions` is player actions (fold, check);
 * `notifications` is the your-turn prompt. A cue plays only when the room's
 * master switch and its category are both on — see `cueAllowed`.
 */
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

/**
 * Whether the room's settings (#182) currently allow this cue: the master
 * switch on, and the cue's category (cards / actions / notifications) on. This
 * is the real mute path — the table owns it and it reaches every surface via
 * `room-view`.
 */
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
