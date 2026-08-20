import type {
  ReplayAuditRecord,
  ReplayCommandRecord,
  ReplayInput,
} from "@table-top-poker/engine";
import type { RecordingFileSystem } from "./file-system.js";
import { handRecordingPaths } from "./paths.js";
import type { HandContext } from "./records.js";

/**
 * What one Hand's three files hold, or why they could not be read. Nothing
 * here is a replay verdict: the engine's `replayHand` decides whether the
 * records agree, and this only reports the shapes it could not parse.
 */
export type HandRecordingRead =
  | { readonly status: "read"; readonly input: ReplayInput }
  | { readonly status: "missing-file"; readonly file: string }
  | {
      readonly status: "malformed-record";
      readonly file: string;
      readonly line: number;
    };

export interface ReadHandRecordingOptions {
  readonly fileSystem: RecordingFileSystem;
  readonly roomDir: string;
  readonly handOrdinal: number;
}

interface ParsedJsonl<T> {
  readonly records: readonly T[];
  readonly tornRecord: { readonly file: string; readonly line: number } | null;
}

class MalformedRecordError extends Error {
  readonly file: string;
  readonly line: number;

  constructor(file: string, line: number) {
    super(`malformed record: ${file}:${String(line)}`);
    this.file = file;
    this.line = line;
  }
}

/**
 * Parses a JSONL file, tolerating an unterminated final line as torn rather
 * than malformed: append-as-you-go persistence (`RoomRecording`) never leaves
 * a torn line anywhere but the last, since every earlier write completed with
 * its trailing newline before the next one began.
 */
function parseJsonl<T>(file: string, contents: string): ParsedJsonl<T> {
  if (contents === "") return { records: [], tornRecord: null };

  const endsWithNewline = contents.endsWith("\n");
  const body = endsWithNewline ? contents.slice(0, -1) : contents;
  const lines = body.split("\n");
  const records: T[] = [];

  for (const [index, line] of lines.entries()) {
    try {
      records.push(JSON.parse(line) as T);
    } catch {
      const isFinalLine = index === lines.length - 1;
      if (isFinalLine && !endsWithNewline) {
        return { records, tornRecord: { file, line: index + 1 } };
      }
      throw new MalformedRecordError(file, index + 1);
    }
  }
  return { records, tornRecord: null };
}

/**
 * Reads Hand `handOrdinal` of the Room recording at `roomDir` into the
 * `ReplayInput` the engine's `replayHand` takes.
 *
 * The filesystem is injected rather than imported, so every caller reads
 * through the same seam the writer uses — which is what lets the server's
 * replay path be exercised against an in-memory disk (Phase 2 spec #129 §3).
 *
 * At most one of `commands.jsonl`/`events.jsonl` can carry a torn final line
 * — a crash lands mid-write of one file at a time — so `tornRecord` is
 * whichever one reports it.
 */
export async function readHandRecording({
  fileSystem,
  roomDir,
  handOrdinal,
}: ReadHandRecordingOptions): Promise<HandRecordingRead> {
  const paths = handRecordingPaths(roomDir, handOrdinal);
  // Independent files, read concurrently — none depends on another's content.
  const [contextText, commandsText, eventsText] = await Promise.all([
    fileSystem.readFile(paths.contextPath),
    // A missing commands/events file reads as empty: an empty Command log is
    // the engine's own `invalid-command-log` failure, and a commands file
    // with no matching events file is the orphaned-trailing-Command case §4
    // describes, not a missing file.
    fileSystem.readFile(paths.commandsPath).then((text) => text ?? ""),
    fileSystem.readFile(paths.eventsPath).then((text) => text ?? ""),
  ]);

  if (contextText === undefined) {
    return { status: "missing-file", file: paths.contextPath };
  }

  let context: HandContext;
  try {
    context = JSON.parse(contextText) as HandContext;
  } catch {
    return { status: "malformed-record", file: paths.contextPath, line: 1 };
  }

  let commands: ParsedJsonl<ReplayCommandRecord>;
  let events: ParsedJsonl<ReplayAuditRecord>;
  try {
    commands = parseJsonl(paths.commandsPath, commandsText);
    events = parseJsonl(paths.eventsPath, eventsText);
  } catch (error) {
    if (!(error instanceof MalformedRecordError)) throw error;
    return {
      status: "malformed-record",
      file: error.file,
      line: error.line,
    };
  }

  return {
    status: "read",
    input: {
      sources: {
        context: paths.contextPath,
        commands: paths.commandsPath,
        events: paths.eventsPath,
      },
      context: {
        v: context.v,
        seats: context.seats,
        button: context.button,
      },
      commands: commands.records,
      events: events.records,
      tornRecord: commands.tornRecord ?? events.tornRecord,
    },
  };
}
