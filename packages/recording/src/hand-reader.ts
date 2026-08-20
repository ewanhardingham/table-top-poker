import type {
  ReplayAuditRecord,
  ReplayCommandRecord,
  ReplayInput,
} from "@table-top-poker/engine";
import type { RecordingFileSystem } from "./file-system.js";
import { handRecordingPaths } from "./paths.js";
import type { HandContext } from "./records.js";

/** Not a replay verdict: this reports only the shapes it could not parse. */
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

/** A torn line can only ever be the last: every earlier write closed with its newline. */
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

/** At most one file can carry a torn final line: a crash lands mid-write of one. */
export async function readHandRecording({
  fileSystem,
  roomDir,
  handOrdinal,
}: ReadHandRecordingOptions): Promise<HandRecordingRead> {
  const paths = handRecordingPaths(roomDir, handOrdinal);
  // Independent files, read concurrently — none depends on another's content.
  const [contextText, commandsText, eventsText] = await Promise.all([
    fileSystem.readFile(paths.contextPath),
    // Missing reads as empty: both cases are the engine's to name, not a read failure.
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
