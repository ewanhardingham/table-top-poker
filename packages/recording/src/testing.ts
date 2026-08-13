/**
 * Test doubles for the recording seam, deliberately kept off the package's
 * main entrypoint (`@table-top-poker/recording`) and reachable only as
 * `@table-top-poker/recording/testing`.
 *
 * The split is the point: injection exists so the failure paths are testable
 * *and* so fault injection stays out of production code — the server must
 * ship no way to make itself fail (Phase 2 spec #129 §3). Importing this
 * module from anything but a test is the mistake it is arranged to make
 * visible.
 */
export { createMemoryFileSystem } from "./memory-file-system.js";
export type {
  FailableOperation,
  MemoryFileSystem,
} from "./memory-file-system.js";

/** Parses a recorded JSONL file's contents into one value per line. */
export function parseRecordedLines(contents: string | undefined): unknown[] {
  if (contents === undefined) return [];
  return contents
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as unknown);
}
