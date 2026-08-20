import {
  access,
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  truncate,
  writeFile,
} from "node:fs/promises";

/**
 * Every filesystem call a recording makes, named as a narrow set of
 * primitives and injected rather than imported — the same shape `ActionClock`
 * (`packages/server/src/action-clock.ts`) uses for its timers.
 *
 * The point is testability of the paths a real disk will not produce on
 * demand: offset truncation after a partial operation, retry, and the
 * rollback of a half-created Room. An in-memory fake (see
 * `memory-file-system.ts`) can fail any of these deliberately, which keeps
 * fault injection out of the production code — the server ships no way to
 * make itself fail.
 *
 * Atomicity is *not* a primitive here. `writeFile` + `rename` is how the
 * module composes an atomic replace, so a fake only has to be faithful about
 * each simple operation.
 */
export interface RecordingFileSystem {
  /** Whether a file or directory is already there. */
  exists(target: string): Promise<boolean>;
  /** The whole contents of `filePath`, or undefined if it is not there. */
  readFile(filePath: string): Promise<string | undefined>;
  /** Creates `dir` and any missing parents; succeeds if it already exists. */
  mkdir(dir: string): Promise<void>;
  /** Creates or replaces `filePath` wholesale. */
  writeFile(filePath: string, contents: string): Promise<void>;
  /** Appends to `filePath`, creating it if absent. */
  appendFile(filePath: string, contents: string): Promise<void>;
  /** Atomically moves `from` over `to`. */
  rename(from: string, to: string): Promise<void>;
  /** Cuts `filePath` back to `length` bytes. */
  truncate(filePath: string, length: number): Promise<void>;
  /** Removes a file or directory tree; succeeds if it is already gone. */
  remove(target: string): Promise<void>;
}

/** The real disk. The only implementation production ever runs against. */
export const nodeFileSystem: RecordingFileSystem = {
  async exists(target) {
    try {
      await access(target);
      return true;
    } catch {
      return false;
    }
  },
  async readFile(filePath) {
    try {
      return await readFile(filePath, { encoding: "utf8" });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw cause;
    }
  },
  async mkdir(dir) {
    await mkdir(dir, { recursive: true });
  },
  async writeFile(filePath, contents) {
    await writeFile(filePath, contents, { encoding: "utf8" });
  },
  async appendFile(filePath, contents) {
    await appendFile(filePath, contents, { encoding: "utf8" });
  },
  async rename(from, to) {
    await rename(from, to);
  },
  async truncate(filePath, length) {
    await truncate(filePath, length);
  },
  async remove(target) {
    await rm(target, { recursive: true, force: true });
  },
};
