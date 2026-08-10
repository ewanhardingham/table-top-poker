// PROTOTYPE — throwaway sound layer for tactile card cues (#181).
// Delete this whole `prototype-sound/` folder with the `proto/sound-181`
// branch. Not production: no tests, no error handling beyond runnable, one
// module-level AudioContext, settings in a local zustand store so the
// on-screen panel can tune cues by ear.
//
// Design decisions baked in here (the things the prototype is checking):
//  - Card sounds only. The non-card interface cues (your-turn chime, check
//    knock, showdown flourish) were cut by ear — every remaining cue is
//    genuine card foley.
//  - Cue ownership per #180: the TABLE is the dealer/center voice (hole-card
//    deal sweep, board, hand-start shuffle); the PHONE is the player's own
//    hands (own fold, own hole cards, own reveal/conceal flip).
//  - Multi-card deals sound per card: the flop is three distinct board taps,
//    a phone's hole cards are two distinct slides — one `setTimeout` per card,
//    staggered by `staggerMs`.
//  - Sounds fire ONLY from `hand-update` (which carries the raw event), never
//    from `view-snapshot` — so a reconnect/refresh mid-hand can't replay a
//    burst of cues (the map's rejoin worry, #175).
import type { HandEvent, PlayerView, TableView } from "@table-top-poker/engine";
import { create } from "zustand";

export type Surface = "table" | "player";

export interface CueOption {
  readonly id: string;
  readonly file: string;
}

export interface CueDef {
  readonly label: string;
  readonly options: readonly CueOption[];
}

/**
 * The card cues, each with A/B(/C) options to compare by ear. Files are served
 * from each client's `public/sounds/` (copied from `assets/sounds/`). Defaults
 * are the first option, set from the human's picks: deal=slide-1, board=place-1,
 * fold=shove-1.
 */
export const CUES = {
  deal: {
    label: "Deal — hole-card slide",
    options: [
      { id: "slide-1", file: "deal/deal-a__card-slide-1.ogg" },
      { id: "slide-3", file: "deal/deal-b__card-slide-3.ogg" },
    ],
  },
  board: {
    label: "Board — per card (flop ×3)",
    options: [
      { id: "place-1", file: "flip/flip-a__card-place-1.ogg" },
      { id: "slide-1", file: "deal/deal-a__card-slide-1.ogg" },
      { id: "place-2", file: "flip/flip-b__card-place-2.ogg" },
      { id: "fan", file: "flip/flip-c-board__card-fan-1.ogg" },
    ],
  },
  fold: {
    label: "Fold — muck (own)",
    options: [
      { id: "shove-1", file: "fold/fold-a__card-shove-1.ogg" },
      { id: "shove-3", file: "fold/fold-b__card-shove-3.ogg" },
    ],
  },
  flip: {
    label: "Reveal / conceal flip (own)",
    options: [
      { id: "place-2", file: "flip/flip-b__card-place-2.ogg" },
      { id: "place-1", file: "flip/flip-a__card-place-1.ogg" },
      { id: "fan", file: "flip/flip-c-board__card-fan-1.ogg" },
    ],
  },
  yourTurn: {
    // Not card foley — the only "action on you" cues in the palette. Weakest
    // area (like check was); tune or replace by ear.
    label: "Your turn (own)",
    options: [
      { id: "pluck", file: "your-turn/turn-b__pluck_002.ogg" },
      { id: "question", file: "your-turn/turn-a__question_001.ogg" },
    ],
  },
  handStart: {
    label: "Hand start — shuffle",
    options: [{ id: "shuffle", file: "bonus/hand-start__card-shuffle.ogg" }],
  },
} as const satisfies Record<string, CueDef>;

export type CueName = keyof typeof CUES;

const CUE_NAMES = Object.keys(CUES) as CueName[];

function defaultSelection(): Record<CueName, string> {
  return Object.fromEntries(
    CUE_NAMES.map((cue) => [cue, CUES[cue].options[0].id]),
  ) as Record<CueName, string>;
}

function allEnabled(): Record<CueName, boolean> {
  return Object.fromEntries(CUE_NAMES.map((cue) => [cue, true])) as Record<
    CueName,
    boolean
  >;
}

interface SoundState {
  unlocked: boolean;
  muted: boolean;
  volume: number;
  /** Gap between board cards (the flop's three taps), ms. */
  staggerMs: number;
  /**
   * Gap between hole cards in the dealer's sweep, ms — larger than the board
   * gap so each dealt card is obvious as the deal reaches around the table.
   */
  dealStaggerMs: number;
  selected: Record<CueName, string>;
  enabled: Record<CueName, boolean>;
  /** Surfaced last cue that played, for the panel's live state readout. */
  lastPlayed: string;
  setUnlocked: (v: boolean) => void;
  setMuted: (v: boolean) => void;
  setVolume: (v: number) => void;
  setStagger: (v: number) => void;
  setDealStagger: (v: number) => void;
  selectOption: (cue: CueName, optionId: string) => void;
  setEnabled: (cue: CueName, v: boolean) => void;
  setLastPlayed: (v: string) => void;
}

export const useSoundStore = create<SoundState>((set) => ({
  unlocked: false,
  muted: false,
  volume: 0.8,
  staggerMs: 90,
  dealStaggerMs: 320,
  selected: defaultSelection(),
  enabled: allEnabled(),
  lastPlayed: "—",
  setUnlocked: (v) => {
    set({ unlocked: v });
  },
  setMuted: (v) => {
    set({ muted: v });
  },
  setVolume: (v) => {
    set({ volume: v });
  },
  setStagger: (v) => {
    set({ staggerMs: v });
  },
  setDealStagger: (v) => {
    set({ dealStaggerMs: v });
  },
  selectOption: (cue, optionId) => {
    set((s) => ({ selected: { ...s.selected, [cue]: optionId } }));
  },
  setEnabled: (cue, v) => {
    set((s) => ({ enabled: { ...s.enabled, [cue]: v } }));
  },
  setLastPlayed: (v) => {
    set({ lastPlayed: v });
  },
}));

// --- audio engine -----------------------------------------------------------

let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();

function context(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}

async function loadBuffer(file: string): Promise<AudioBuffer> {
  const cached = buffers.get(file);
  if (cached) return cached;
  const response = await fetch(`/sounds/${file}`);
  const bytes = await response.arrayBuffer();
  const buffer = await context().decodeAudioData(bytes);
  buffers.set(file, buffer);
  return buffer;
}

function fileFor(cue: CueName): string {
  const { selected } = useSoundStore.getState();
  const def = CUES[cue];
  const option =
    def.options.find((o) => o.id === selected[cue]) ?? def.options[0];
  return option.file;
}

function playFile(file: string): void {
  // Inert without Web Audio (jsdom under vitest, SSR) so tests that reveal a
  // pair stay silent instead of throwing on `new AudioContext()`.
  if (typeof AudioContext === "undefined") return;
  const { volume } = useSoundStore.getState();
  void loadBuffer(file).then((buffer) => {
    const c = context();
    const source = c.createBufferSource();
    source.buffer = buffer;
    const gain = c.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(c.destination);
    source.start();
  });
}

/** Play a cue's currently-selected sound, honouring mute + per-cue enable. */
function playCue(cue: CueName): void {
  const s = useSoundStore.getState();
  if (s.muted || !s.enabled[cue]) return;
  const file = fileFor(cue);
  playFile(file);
  s.setLastPlayed(`${cue} · ${file.split("/").pop() ?? file}`);
}

/**
 * Play the reveal/conceal flip cue. Called by the player client's hole-card
 * hook when the pair flips face-up (reveal) or back face-down (conceal) — a
 * client-side presentation change, not a wire event.
 */
export function playRevealFlip(): void {
  playCue("flip");
}

/**
 * Preview a cue from the panel — always plays (ignores per-cue enable) so a
 * disabled cue can still be auditioned, but still respects mute.
 */
export function previewCue(cue: CueName): void {
  const s = useSoundStore.getState();
  if (s.muted) return;
  playFile(fileFor(cue));
  s.setLastPlayed(`preview ${cue}`);
}

/**
 * Unlock audio from a user gesture (#178: AudioContext starts `suspended`).
 * Resumes the context, warms the decode cache, and marks unlocked. Also wired
 * to re-resume on `visibilitychange` so returning to a backgrounded tab (a
 * phone unlocking) keeps sound alive.
 */
export async function unlockAudio(): Promise<void> {
  await context().resume();
  useSoundStore.getState().setUnlocked(true);
  // Warm every option so the first real cue has no decode latency.
  await Promise.all(
    CUE_NAMES.flatMap((cue) =>
      CUES[cue].options.map((o) => loadBuffer(o.file).catch(() => undefined)),
    ),
  );
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && ctx) void ctx.resume();
  });
}

// --- event → sound ----------------------------------------------------------

/** Edge-detect "it just became my turn" so the prompt fires once, not per view. */
let lastMyTurn = false;

/**
 * When the current hand's hole-card sweep finishes (ms epoch). The your-turn
 * prompt is deferred until then so a player hears their cards land before the
 * prompt. Reset each hand; 0 means no sweep pending.
 */
let dealSweepEndsAt = 0;

/**
 * The single entry point the WebSocket hooks call on every `hand-update`
 * (never on `view-snapshot`). `seatId` is the phone's own seat; omitted on the
 * table surface.
 */
export function onHandUpdate(args: {
  surface: Surface;
  event: HandEvent;
  view: PlayerView | TableView;
  seatId?: number;
}): void {
  const { surface, event, seatId } = args;
  const { staggerMs, dealStaggerMs } = useSoundStore.getState();

  switch (event.type) {
    case "HandStarted":
      lastMyTurn = false;
      dealSweepEndsAt = 0;
      if (surface === "table") playCue("handStart");
      break;

    case "HoleCardsDealt": {
      // A dealer's sweep, one distinct slide per card, spaced by the wider
      // hole-deal gap so each dealt card is obvious. The table hears the whole
      // table dealt; each phone hears only its own two cards (#180). The
      // your-turn cue below is held until this sweep ends.
      const count =
        surface === "table"
          ? event.deals.reduce((n, d) => n + d.cards.length, 0)
          : (event.deals.find((d) => d.seatId === seatId)?.cards.length ?? 0);
      dealSweepEndsAt = Date.now() + count * dealStaggerMs;
      staggeredCue("deal", count, dealStaggerMs);
      break;
    }

    case "BoardDealt":
      // One tap per board card, staggered — three distinct taps on the flop,
      // one each on the turn and river. Table only (the center voice, #180).
      if (surface === "table") {
        staggeredCue("board", event.cards.length, staggerMs);
      }
      break;

    case "ActionTaken":
      // Only the acting player's own phone voices the fold muck; the table
      // stays silent. check/call/raise are unallocated (cut or no asset yet).
      if (
        surface === "player" &&
        event.seatId === seatId &&
        event.action === "fold"
      ) {
        playCue("fold");
      }
      break;

    case "StreetStarted":
    case "StreetClosed":
    case "ShowdownReached":
    case "HandFoldedOut":
    case "HandComplete":
      // No dedicated cue (your-turn is derived from the view below).
      break;
  }

  // "Action on you": derived from the phone's view, edge-detected so it fires
  // once when the turn arrives, and held until the deal sweep has finished so
  // the player hears their cards land first, then the prompt.
  if (surface === "player") {
    const { view } = args;
    const myTurn =
      view.phase === "betting" &&
      "legalActions" in view &&
      view.legalActions.length > 0;
    if (myTurn && !lastMyTurn) {
      const wait = Math.max(0, dealSweepEndsAt - Date.now());
      setTimeout(() => {
        playCue("yourTurn");
      }, wait);
    }
    lastMyTurn = myTurn;
  }
}

/**
 * Fire a cue once per card, staggered so multi-card deals read as distinct.
 * The buffer is decoded up front, then the spaced plays run from cache — so
 * the gaps hold even on the first deal after unlocking, when an
 * on-demand decode would otherwise resolve all at once and collapse them.
 */
function staggeredCue(cue: CueName, count: number, gapMs: number): void {
  if (count <= 0) return;
  void loadBuffer(fileFor(cue))
    .then(() => {
      for (let i = 0; i < count; i++) {
        setTimeout(() => {
          playCue(cue);
        }, i * gapMs);
      }
    })
    .catch(() => undefined);
}
