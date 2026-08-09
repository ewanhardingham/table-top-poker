// PROTOTYPE — throwaway sound layer for tactile card cues (#181).
// Delete this whole `prototype-sound/` folder with the `proto/sound-181`
// branch. Not production: no tests, no error handling beyond runnable, one
// module-level AudioContext, settings in a local zustand store so the
// on-screen panel can tune cues by ear.
//
// Design decisions baked in here (the things the prototype is checking):
//  - Cue ownership per #180: the TABLE is the dealer/center voice (hole-card
//    deal riffle, board, showdown); the PHONE is the player's own hands
//    (your-turn, own check-knock, own fold, own hole cards).
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
 * The starter palette (#179) laid out as A/B(/C) options per cue. Files are
 * served from each client's `public/sounds/` (copied from `assets/sounds/`).
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
    label: "Board — flop / turn / river",
    options: [
      { id: "fan", file: "flip/flip-c-board__card-fan-1.ogg" },
      { id: "place-1", file: "flip/flip-a__card-place-1.ogg" },
      { id: "place-2", file: "flip/flip-b__card-place-2.ogg" },
    ],
  },
  fold: {
    label: "Fold — muck (own)",
    options: [
      { id: "shove-1", file: "fold/fold-a__card-shove-1.ogg" },
      { id: "shove-3", file: "fold/fold-b__card-shove-3.ogg" },
    ],
  },
  check: {
    label: "Check — knock (own)",
    options: [
      { id: "drop", file: "check-knock/knock-a__drop_003.ogg" },
      { id: "bong", file: "check-knock/knock-b__bong_001.ogg" },
    ],
  },
  yourTurn: {
    label: "Your turn (own)",
    options: [
      { id: "question", file: "your-turn/turn-a__question_001.ogg" },
      { id: "pluck", file: "your-turn/turn-b__pluck_002.ogg" },
    ],
  },
  showdown: {
    label: "Showdown",
    options: [
      { id: "confirm", file: "showdown/showdown-a__confirmation_001.ogg" },
      { id: "maximize", file: "showdown/showdown-b__maximize_004.ogg" },
    ],
  },
  handStart: {
    label: "Hand start — shuffle (bonus)",
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
  /** Inter-card delay for the dealer's hole-card sweep, ms. */
  staggerMs: number;
  selected: Record<CueName, string>;
  enabled: Record<CueName, boolean>;
  /** Surfaced last cue that played, for the panel's live state readout. */
  lastPlayed: string;
  setUnlocked: (v: boolean) => void;
  setMuted: (v: boolean) => void;
  setVolume: (v: number) => void;
  setStagger: (v: number) => void;
  selectOption: (cue: CueName, optionId: string) => void;
  setEnabled: (cue: CueName, v: boolean) => void;
  setLastPlayed: (v: string) => void;
}

export const useSoundStore = create<SoundState>((set) => ({
  unlocked: false,
  muted: false,
  volume: 0.8,
  staggerMs: 90,
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

/** Edge-detect "it just became my turn" so your-turn chimes once, not per view. */
let lastMyTurn = false;

function isMyTurn(view: PlayerView | TableView): boolean {
  return (
    view.phase === "betting" &&
    "legalActions" in view &&
    view.legalActions.length > 0
  );
}

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
  const { surface, event, view, seatId } = args;
  const { staggerMs } = useSoundStore.getState();

  switch (event.type) {
    case "HandStarted":
      lastMyTurn = false;
      if (surface === "table") playCue("handStart");
      break;

    case "HoleCardsDealt": {
      // Dealer's sweep: one deal tick per card, staggered. The table hears the
      // whole table dealt; a phone hears only its own two cards.
      const cardCount =
        surface === "table"
          ? event.deals.reduce((n, d) => n + d.cards.length, 0)
          : (event.deals.find((d) => d.seatId === seatId)?.cards.length ?? 0);
      for (let i = 0; i < cardCount; i++) {
        setTimeout(() => {
          playCue("deal");
        }, i * staggerMs);
      }
      break;
    }

    case "BoardDealt":
      if (surface === "table") playCue("board");
      break;

    case "ActionTaken":
      // Only the acting player's own phone voices check/fold; the table stays
      // silent on these. call/raise are unallocated (no chip asset yet).
      if (surface === "player" && event.seatId === seatId) {
        if (event.action === "fold") playCue("fold");
        else if (event.action === "check") playCue("check");
      }
      break;

    case "ShowdownReached":
      if (surface === "table") playCue("showdown");
      break;

    case "StreetStarted":
    case "StreetClosed":
    case "HandFoldedOut":
    case "HandComplete":
      // No dedicated cue (your-turn is derived from the view below).
      break;
  }

  // your-turn is derived from the view (the actor), not from a dedicated event.
  if (surface === "player") {
    const myTurn = isMyTurn(view);
    if (myTurn && !lastMyTurn) playCue("yourTurn");
    lastMyTurn = myTurn;
  }
}
