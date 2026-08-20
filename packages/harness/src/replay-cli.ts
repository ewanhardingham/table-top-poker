import type { Writable } from "node:stream";
import { replayHand } from "@table-top-poker/engine";
import type { EngineState, ReplayOutcome } from "@table-top-poker/engine";
import { parseReplayArgs } from "./replay-args.js";
import { renderFlipbook } from "./replay-format.js";
import { loadHand, ReplaySourceError } from "./replay-source.js";
import type { LoadedHand } from "./replay-source.js";

export interface ReplayCliStreams {
  readonly stdout: Writable;
  readonly stderr: Writable;
}

function writeLine(stream: Writable, text: string): void {
  stream.write(text + "\n");
}

function writeDiagnostic(stream: Writable, diagnostic: unknown): void {
  writeLine(stream, JSON.stringify(diagnostic));
}

/** The stderr diagnostic for an incomplete-Hand replay — one or both reasons. */
function incompleteHandDiagnostic(
  outcome: Extract<ReplayOutcome, { status: "incomplete" }>,
): unknown {
  return {
    kind: "incomplete-hand",
    ...(outcome.tornRecord === null ? {} : { tornRecord: outcome.tornRecord }),
    ...(outcome.orphanedCommand === null
      ? {}
      : { orphanedCommand: outcome.orphanedCommand }),
  };
}

/** See "An all-torn first Command line" in `packages/harness/README.md`. */
function startingPositionOnly(loaded: LoadedHand): ReplayOutcome & {
  status: "complete";
} {
  const state: EngineState = {
    seats: [...loaded.input.context.seats],
    button: loaded.input.context.button,
    hand: null,
  };
  return {
    status: "complete",
    positions: [{ position: 0, event: null, state }],
    rejections: [],
  };
}

/** Validates the whole Hand before any stdout: every failure writes only to stderr. */
export async function runReplayCli(
  argv: readonly string[],
  streams: ReplayCliStreams,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number> {
  try {
    const args = parseReplayArgs(argv, env);
    const loaded = await loadHand(args.room, args.hand, args.recordingsDir);
    if (loaded.resolutionNote !== undefined) {
      writeLine(streams.stderr, loaded.resolutionNote);
    }

    const outcome = replayHand(loaded.input);

    // See "An all-torn first Command line" in `packages/harness/README.md`.
    if (
      outcome.status === "failed" &&
      outcome.failure.kind === "invalid-command-log" &&
      outcome.failure.reason === "empty" &&
      loaded.input.tornRecord !== null
    ) {
      const records = renderFlipbook(
        args.hand,
        startingPositionOnly(loaded),
        args.selector,
      );
      for (const record of records) {
        writeLine(streams.stdout, JSON.stringify(record));
      }
      writeDiagnostic(streams.stderr, {
        kind: "incomplete-hand",
        tornRecord: loaded.input.tornRecord,
      });
      return 2;
    }

    if (outcome.status === "failed") {
      writeDiagnostic(streams.stderr, outcome.failure);
      return 1;
    }

    const records = renderFlipbook(args.hand, outcome, args.selector);
    for (const record of records) {
      writeLine(streams.stdout, JSON.stringify(record));
    }

    if (outcome.status === "incomplete") {
      writeDiagnostic(streams.stderr, incompleteHandDiagnostic(outcome));
      return 2;
    }
    return 0;
  } catch (error) {
    if (error instanceof ReplaySourceError) {
      writeDiagnostic(streams.stderr, error.failure);
    } else {
      writeLine(
        streams.stderr,
        error instanceof Error ? error.message : String(error),
      );
    }
    return 1;
  }
}
