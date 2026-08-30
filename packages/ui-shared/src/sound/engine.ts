import {
  DEFAULT_SOUND_SETTINGS,
  type HandEvent,
  type PlayerView,
  type SoundSettings,
  type TableView,
} from "@table-top-poker/protocol";
import { type CueName, cueAllowed } from "./cues.js";

export type Surface = "table" | "player";

export interface PlaybackHandle {
  readonly stop: () => void;
}

export interface PlaybackOptions {
  readonly gain?: number;
  readonly offset?: number;
  readonly duration?: number;
}

export type SoundSource = CueName | AudioBuffer;

export interface HandUpdateArgs {
  readonly surface: Surface;
  readonly event: HandEvent;
  readonly view: PlayerView | TableView;
  readonly seatId?: number;
}

export interface SoundEffects {
  readonly play: (
    source: SoundSource,
    options?: PlaybackOptions,
  ) => PlaybackHandle;
  readonly now: () => number;
  readonly schedule: (fn: () => void, delayMs: number) => void;
}

export interface SoundEngine {
  readonly onHandUpdate: (args: HandUpdateArgs) => void;
  readonly applyRoomSoundSettings: (settings: SoundSettings) => void;
  readonly setPlayerTurnSound: (
    buffer: AudioBuffer | null,
    options?: PlaybackOptions,
  ) => void;
  readonly playRevealFlip: () => PlaybackHandle;
}

export const TIMINGS = {
  dealStaggerMs: 600,
  boardStaggerMs: 250,
  turnAfterDealMs: 700,
  boardLeadInMs: 150,
  burnLengthMs: 700,
} as const;

export function createSoundEngine(
  effects: SoundEffects,
  initialSettings: SoundSettings = DEFAULT_SOUND_SETTINGS,
): SoundEngine {
  let settings = initialSettings;

  let lastMyTurn = false;
  let turnToken = 0;
  let lastHoleCardAt = 0;
  let nextBurnAt = 0;
  let playerTurnSound: {
    buffer: AudioBuffer;
    options: PlaybackOptions;
  } | null = null;
  let activeTurnPlayback: PlaybackHandle | null = null;
  const silentPlayback: PlaybackHandle = { stop: () => undefined };

  function playCue(cue: CueName): PlaybackHandle {
    if (cueAllowed(settings, cue)) return effects.play(cue);
    return silentPlayback;
  }

  function playTurnCue(): void {
    if (!cueAllowed(settings, "yourTurn")) return;
    activeTurnPlayback = playerTurnSound
      ? effects.play(playerTurnSound.buffer, playerTurnSound.options)
      : effects.play("yourTurn");
  }

  function stopTurnCue(): void {
    activeTurnPlayback?.stop();
    activeTurnPlayback = null;
  }

  function staggeredCue(
    cue: CueName,
    count: number,
    gapMs: number,
    startDelayMs = 0,
  ): void {
    for (let i = 0; i < count; i++) {
      effects.schedule(
        () => {
          playCue(cue);
        },
        startDelayMs + i * gapMs,
      );
    }
  }

  function onHandUpdate(args: HandUpdateArgs): void {
    const { surface, event, seatId } = args;

    switch (event.type) {
      case "HandStarted":
        lastMyTurn = false;
        lastHoleCardAt = 0;
        nextBurnAt = 0;
        break;

      case "HoleCardsDealt": {
        if (surface !== "player") break;
        const count =
          event.deals.find((d) => d.seatId === seatId)?.cards.length ?? 0;
        lastHoleCardAt =
          effects.now() + Math.max(0, count - 1) * TIMINGS.dealStaggerMs;
        staggeredCue("deal", count, TIMINGS.dealStaggerMs);
        break;
      }

      case "BoardDealt":
        if (surface === "table") {
          staggeredCue(
            "board",
            event.cards.length,
            TIMINGS.boardStaggerMs,
            TIMINGS.boardLeadInMs,
          );
        }
        break;

      case "ActionTaken":
        if (surface === "player" && event.seatId === seatId) {
          if (event.action === "fold") playCue("fold");
          else if (event.action === "check") playCue("check");
        }
        break;

      case "HoleCardsMucked":
        if (surface === "player" && event.seatId === seatId) playCue("fold");
        break;

      case "CardBurned": {
        if (surface !== "table") break;
        const at = Math.max(effects.now(), nextBurnAt);
        nextBurnAt = at + TIMINGS.burnLengthMs;
        effects.schedule(() => {
          playCue("burn");
        }, at - effects.now());
        break;
      }

      case "StreetStarted":
      case "StreetClosed":
      case "HoleCardsTabled":
      case "ShowdownReached":
      case "HoleCardsShown":
      case "WinnersDeclared":
      case "HandFoldedOut":
      case "HandComplete":
        break;
    }

    if (surface === "player") {
      const { view } = args;
      const myTurn =
        view.phase === "betting" &&
        "legalActions" in view &&
        view.legalActions.length > 0;
      if (myTurn !== lastMyTurn) turnToken++;
      if (!myTurn) stopTurnCue();
      if (myTurn && !lastMyTurn) {
        const token = turnToken;
        const wait = Math.max(
          0,
          lastHoleCardAt + TIMINGS.turnAfterDealMs - effects.now(),
        );
        effects.schedule(() => {
          if (token === turnToken) playTurnCue();
        }, wait);
      }
      lastMyTurn = myTurn;
    }
  }

  return {
    onHandUpdate,
    applyRoomSoundSettings(next: SoundSettings): void {
      settings = next;
      if (!cueAllowed(settings, "yourTurn")) stopTurnCue();
    },
    setPlayerTurnSound(buffer, options = {}): void {
      stopTurnCue();
      playerTurnSound = buffer === null ? null : { buffer, options };
    },
    playRevealFlip(): PlaybackHandle {
      return playCue("flip");
    },
  };
}
