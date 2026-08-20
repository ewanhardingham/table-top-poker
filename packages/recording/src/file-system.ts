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

/** The filesystem seam — see Recording in `docs/design/server.md`. */
export interface RecordingFileSystem {
  exists(target: string): Promise<boolean>;
  readFile(filePath: string): Promise<string | undefined>;
  /** Idempotent: succeeds if `dir` already exists. */
  mkdir(dir: string): Promise<void>;
  writeFile(filePath: string, contents: string): Promise<void>;
  appendFile(filePath: string, contents: string): Promise<void>;
  /** Atomic: the composition point for an atomic replace. */
  rename(from: string, to: string): Promise<void>;
  truncate(filePath: string, length: number): Promise<void>;
  /** Idempotent: succeeds if `target` is already gone. */
  remove(target: string): Promise<void>;
}

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
