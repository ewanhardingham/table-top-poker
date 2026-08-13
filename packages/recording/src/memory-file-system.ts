import path from "node:path";
import type { RecordingFileSystem } from "./file-system.js";

/** The operations a test may make fail, keyed exactly as the seam names them. */
export type FailableOperation = keyof RecordingFileSystem;

export interface MemoryFileSystem extends RecordingFileSystem {
  /** Contents of one file, or undefined if it does not exist. */
  read(filePath: string): string | undefined;
  /** Every file path currently on the fake disk, sorted. */
  paths(): string[];
  /** Fails the next `count` calls to `operation`, then behaves normally again. */
  failNext(operation: FailableOperation, count?: number): void;
  /** Fails every subsequent call to `operation` — a card gone read-only. */
  failAlways(operation: FailableOperation): void;
  /**
   * Fails `operation` only for the paths `matches` accepts — how a test
   * lands half of an operation on disk and fails the other half.
   */
  failWhen(
    operation: FailableOperation,
    matches: (target: string) => boolean,
  ): void;
  /** Stops any failure previously armed for `operation`. */
  healAll(): void;
}

class MissingDirectoryError extends Error {
  constructor(dir: string) {
    super(`ENOENT: no such directory ${dir}`);
  }
}

/**
 * An in-memory `RecordingFileSystem` with arm-a-failure controls, faithful
 * about the things the recording module depends on: a write into a directory
 * that was never created fails, appends accumulate, and truncate is a byte
 * count. Test-only — production wires `nodeFileSystem`.
 */
export function createMemoryFileSystem(): MemoryFileSystem {
  const files = new Map<string, string>();
  const dirs = new Set<string>(["/"]);
  const failures = new Map<FailableOperation, number>();
  const targetedFailures = new Map<
    FailableOperation,
    (target: string) => boolean
  >();

  function checkFailure(operation: FailableOperation, target: string): void {
    if (targetedFailures.get(operation)?.(target) === true) {
      throw new Error(`EIO: injected failure, ${operation} ${target}`);
    }
    const remaining = failures.get(operation);
    if (remaining === undefined) return;
    if (remaining === Infinity) {
      throw new Error(`EROFS: read-only file system, ${operation}`);
    }
    if (remaining <= 1) failures.delete(operation);
    else failures.set(operation, remaining - 1);
    throw new Error(`EIO: injected failure, ${operation}`);
  }

  /**
   * Runs `work`, turning a thrown failure into a rejected promise — a real
   * filesystem never throws synchronously, and code that only handles
   * rejections must be exercised the same way here.
   */
  function settle(work: () => void): Promise<void> {
    try {
      work();
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  function requireParent(filePath: string): void {
    const parent = path.dirname(filePath);
    if (!dirs.has(parent)) throw new MissingDirectoryError(parent);
  }

  function makeDir(dir: string): void {
    let current = dir;
    while (!dirs.has(current)) {
      dirs.add(current);
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return {
    read(filePath) {
      return files.get(filePath);
    },
    paths() {
      return [...files.keys()].sort();
    },
    failNext(operation, count = 1) {
      failures.set(operation, count);
    },
    failAlways(operation) {
      failures.set(operation, Infinity);
    },
    failWhen(operation, matches) {
      targetedFailures.set(operation, matches);
    },
    healAll() {
      failures.clear();
      targetedFailures.clear();
    },

    exists(target) {
      return Promise.resolve(files.has(target) || dirs.has(target));
    },
    mkdir(dir) {
      return settle(() => {
        checkFailure("mkdir", dir);
        makeDir(dir);
      });
    },
    writeFile(filePath, contents) {
      return settle(() => {
        checkFailure("writeFile", filePath);
        requireParent(filePath);
        files.set(filePath, contents);
      });
    },
    appendFile(filePath, contents) {
      return settle(() => {
        checkFailure("appendFile", filePath);
        requireParent(filePath);
        files.set(filePath, (files.get(filePath) ?? "") + contents);
      });
    },
    rename(from, to) {
      return settle(() => {
        checkFailure("rename", to);
        const contents = files.get(from);
        if (contents === undefined) {
          throw new Error(`ENOENT: no such file ${from}`);
        }
        requireParent(to);
        files.delete(from);
        files.set(to, contents);
      });
    },
    truncate(filePath, length) {
      return settle(() => {
        checkFailure("truncate", filePath);
        const contents = files.get(filePath);
        if (contents === undefined) {
          throw new Error(`ENOENT: no such file ${filePath}`);
        }
        files.set(
          filePath,
          Buffer.from(contents, "utf8").subarray(0, length).toString("utf8"),
        );
      });
    },
    remove(target) {
      return settle(() => {
        checkFailure("remove", target);
        files.delete(target);
        const prefix = target.endsWith(path.sep) ? target : target + path.sep;
        for (const filePath of [...files.keys()]) {
          if (filePath.startsWith(prefix)) files.delete(filePath);
        }
        for (const dir of [...dirs]) {
          if (dir === target || dir.startsWith(prefix)) dirs.delete(dir);
        }
      });
    },
  };
}
