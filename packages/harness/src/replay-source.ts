import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ReplayInput } from "@table-top-poker/engine";
import {
  nodeFileSystem,
  readHandRecording,
  RECORDING_LAYOUT_VERSION,
  roomManifestPath,
} from "@table-top-poker/recording";
import type { RoomManifest } from "@table-top-poker/recording";

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

/** Unfiltered by layout version — see Resolving `<room>` in `packages/harness/README.md`. */
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

/** See Resolving `<room>` in `packages/harness/README.md`. */
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

export interface LoadedHand {
  readonly roomDir: string;
  readonly resolutionNote: string | undefined;
  readonly input: ReplayInput;
}

/** Reads through the same reader the server uses, so neither can disagree on a torn tail. */
export async function loadHand(
  room: string,
  handOrdinal: number,
  recordingsDir: string,
): Promise<LoadedHand> {
  const resolved = await resolveRoomDirectory(room, recordingsDir);

  const read = await readHandRecording({
    fileSystem: nodeFileSystem,
    roomDir: resolved.roomDir,
    handOrdinal,
  });
  if (read.status === "missing-file") {
    throw new ReplaySourceError({ kind: "missing-file", file: read.file });
  }
  if (read.status === "malformed-record") {
    throw new ReplaySourceError({
      kind: "malformed-record",
      file: read.file,
      line: read.line,
    });
  }

  return {
    roomDir: resolved.roomDir,
    resolutionNote: resolved.note,
    input: read.input,
  };
}
