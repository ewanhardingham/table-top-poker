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

/**
 * The one flipbook position an all-torn Command log still supports: the
 * starting state, built from the Hand context alone. Mirrors the object
 * literal `replayHand` itself constructs (engine/src/replay.ts) — no public
 * engine constructor exists for "state at an arbitrary Button" (§4), and
 * this is the one caller-side place that legitimately needs the same shape.
 */
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

/**
 * Runs `harness replay`, returning the process exit code rather than setting
 * it, so callers — the real CLI and tests alike — decide what to do with it.
 *
 * Loads and validates the complete requested Hand before writing anything to
 * `stdout` (§7): every failure — bad arguments, a source-read failure, an
 * out-of-range selector, or the engine's own validation — writes only to
 * `stderr` and produces no stdout output at all.
 */
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

    // A torn line on the Hand's very first Command line leaves `decide`
    // nothing to replay, and the engine's own validation reports that as
    // `invalid-command-log: empty` — correct when the log really is empty,
    // but indistinguishable there from a crash mid-write of its first line.
    // §4/§7 treat *any* torn final JSONL record as incomplete, not corrupt,
    // with no carve-out for it being the first — so this is the one failure
    // shape the harness reclassifies rather than passing straight through.
    // Reaching it means `replayHand` already validated context and version
    // (both run before the empty-log check), so position 0 is safe to
    // synthesize without re-checking either.
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
