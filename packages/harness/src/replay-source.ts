import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ReplayAuditRecord,
  ReplayCommandRecord,
  ReplayInput,
} from "@table-top-poker/engine";
import {
  handRecordingPaths,
  RECORDING_LAYOUT_VERSION,
  roomManifestPath,
} from "@table-top-poker/recording";
import type { HandContext, RoomManifest } from "@table-top-poker/recording";

/** A hard failure: nothing is written to stdout and the CLI exits `1`. */
export type ReplaySourceFailure =
  | { readonly kind: "missing-file"; readonly file: string }
  | {
      readonly kind: "malformed-record";
      readonly file: string;
      readonly line: number;
    }
  | {
      readonly kind: "unsupported-version";
      readonly expected: number;
      readonly actual: number;
      readonly file: string;
      readonly record: number | null;
    };

export class ReplaySourceError extends Error {
  readonly failure: ReplaySourceFailure;

  constructor(failure: ReplaySourceFailure) {
    super(`replay source: ${failure.kind}`);
    this.failure = failure;
  }
}

async function readFileOrUndefined(
  filePath: string,
): Promise<string | undefined> {
  try {
    return await readFile(filePath, { encoding: "utf8" });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
}

/** Reads and parses `room.json` at `roomDir`; `undefined` if it's absent. */
async function readManifest(
  roomDir: string,
): Promise<RoomManifest | undefined> {
  const file = roomManifestPath(roomDir);
  const contents = await readFileOrUndefined(file);
  if (contents === undefined) return undefined;
  try {
    return JSON.parse(contents) as RoomManifest;
  } catch {
    throw new ReplaySourceError({ kind: "malformed-record", file, line: 1 });
  }
}

function requireSupportedLayout(manifest: RoomManifest, roomDir: string): void {
  if (manifest.layoutVersion !== RECORDING_LAYOUT_VERSION) {
    throw new ReplaySourceError({
      kind: "unsupported-version",
      expected: RECORDING_LAYOUT_VERSION,
      actual: manifest.layoutVersion,
      file: roomManifestPath(roomDir),
      record: null,
    });
  }
}

async function listRoomDirs(recordingsDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(recordingsDir, { withFileTypes: true });
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(recordingsDir, entry.name));
}

/**
 * The manifest of every directory under `recordingsDir` that parses as a
 * Room recording — deliberately unfiltered by layout version, so a `latest`
 * or join-code scan picks the directory the timestamp actually names first
 * and validates it second. Silently preferring an older, version-compatible
 * directory instead would be the "partial replay for a version mismatch"
 * §7 rules out, just moved a step earlier.
 */
async function candidateManifests(
  recordingsDir: string,
): Promise<{ roomDir: string; manifest: RoomManifest }[]> {
  const dirs = await listRoomDirs(recordingsDir);
  const candidates: { roomDir: string; manifest: RoomManifest }[] = [];
  for (const roomDir of dirs) {
    let manifest: RoomManifest | undefined;
    try {
      manifest = await readManifest(roomDir);
    } catch {
      continue; // Not a Room recording directory — skip rather than fail the scan.
    }
    if (manifest !== undefined) candidates.push({ roomDir, manifest });
  }
  return candidates;
}

export interface ResolvedRoom {
  readonly roomDir: string;
  readonly manifest: RoomManifest;
  /** Present when resolution scanned `recordingsDir` rather than taking a path literally. */
  readonly note?: string;
}

function byCreatedAtDescending(
  a: { manifest: RoomManifest },
  b: { manifest: RoomManifest },
): number {
  if (a.manifest.createdAt === b.manifest.createdAt) return 0;
  return a.manifest.createdAt < b.manifest.createdAt ? 1 : -1;
}

/**
 * Resolves the `<room>` positional to a directory: a literal path, a
 * four-character join code (scanned across `recordingsDir`, most recent
 * `createdAt` wins on a collision — codes are recycled), or the literal
 * `latest` (Phase 2 spec #129 §7). A directory that exists — either `room`
 * taken literally, or `room` as a Room ID directly under `recordingsDir` —
 * is always taken over a code scan, so a directory happening to share a
 * code's shape is never misread as one. The second check is what makes the
 * Room ID a harness run just printed (`--room-id`, or the default sortable
 * timestamp) usable as-is, without spelling out the path to `recordingsDir`
 * by hand.
 */
export async function resolveRoomDirectory(
  room: string,
  recordingsDir: string,
): Promise<ResolvedRoom> {
  if (room !== "latest") {
    for (const candidate of [
      path.resolve(room),
      path.join(recordingsDir, room),
    ]) {
      const manifest = await readManifest(candidate);
      if (manifest !== undefined) {
        requireSupportedLayout(manifest, candidate);
        return { roomDir: candidate, manifest };
      }
    }
  }

  const candidates = await candidateManifests(recordingsDir);
  const matching =
    room === "latest"
      ? candidates
      : candidates.filter((c) => c.manifest.code === room);

  if (matching.length === 0) {
    throw new ReplaySourceError({
      kind: "missing-file",
      file:
        room === "latest"
          ? recordingsDir
          : `${recordingsDir} (no room.json with code "${room}")`,
    });
  }

  matching.sort(byCreatedAtDescending);
  const chosen = matching[0];
  if (chosen === undefined) {
    throw new ReplaySourceError({ kind: "missing-file", file: recordingsDir });
  }
  requireSupportedLayout(chosen.manifest, chosen.roomDir);

  const note =
    room === "latest"
      ? `resolved "latest" to ${chosen.roomDir}`
      : `resolved join code "${room}" to ${chosen.roomDir}` +
        (matching.length > 1 ? " (most recent of several matches)" : "");

  return { roomDir: chosen.roomDir, manifest: chosen.manifest, note };
}

/** A validated final JSONL line the reader discarded because it was torn. */
export interface TornRecord {
  readonly file: string;
  readonly line: number;
}

interface ParsedJsonl<T> {
  readonly records: readonly T[];
  readonly tornRecord: TornRecord | null;
}

/**
 * Parses a JSONL file, tolerating an unterminated final line as torn rather
 * than malformed: append-as-you-go persistence (`RoomRecording`) never
 * leaves a torn line anywhere but the last, since every earlier write already
 * completed with its trailing newline before the next one began.
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
      throw new ReplaySourceError({
        kind: "malformed-record",
        file,
        line: index + 1,
      });
    }
  }
  return { records, tornRecord: null };
}

export interface LoadedHand {
  readonly roomDir: string;
  readonly resolutionNote: string | undefined;
  readonly input: ReplayInput;
}

/**
 * Resolves `<room>`, reads Hand `handOrdinal`'s three files, and assembles
 * the `ReplayInput` the engine's `replayHand` takes. At most one of
 * `commands.jsonl`/`events.jsonl` can carry a torn final line — a crash can
 * only land mid-write of one file at a time — so `tornRecord` is whichever
 * one reports it.
 */
export async function loadHand(
  room: string,
  handOrdinal: number,
  recordingsDir: string,
): Promise<LoadedHand> {
  const resolved = await resolveRoomDirectory(room, recordingsDir);

  const paths = handRecordingPaths(resolved.roomDir, handOrdinal);
  // Independent files, read concurrently — none depends on another's content.
  const [contextText, commandsText, eventsText] = await Promise.all([
    readFileOrUndefined(paths.contextPath),
    // A missing commands/events file reads as empty — an empty Command log
    // is the engine's own `invalid-command-log` failure, and a commands
    // file with no matching events file is the orphaned-trailing-Command
    // case §4 describes, not a harness-level "missing file".
    readFileOrUndefined(paths.commandsPath).then((text) => text ?? ""),
    readFileOrUndefined(paths.eventsPath).then((text) => text ?? ""),
  ]);

  if (contextText === undefined) {
    throw new ReplaySourceError({
      kind: "missing-file",
      file: paths.contextPath,
    });
  }
  let context: HandContext;
  try {
    context = JSON.parse(contextText) as HandContext;
  } catch {
    throw new ReplaySourceError({
      kind: "malformed-record",
      file: paths.contextPath,
      line: 1,
    });
  }

  const commands = parseJsonl<ReplayCommandRecord>(
    paths.commandsPath,
    commandsText,
  );
  const events = parseJsonl<ReplayAuditRecord>(paths.eventsPath, eventsText);

  const tornRecord = commands.tornRecord ?? events.tornRecord ?? null;

  const input: ReplayInput = {
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
    tornRecord,
  };

  return {
    roomDir: resolved.roomDir,
    resolutionNote: resolved.note,
    input,
  };
}
