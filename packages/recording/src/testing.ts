/**
 * Test doubles, kept off the package's main entrypoint so fault injection stays
 * out of production code — see Recording in `docs/design/server.md`.
 */
export { createMemoryFileSystem } from "./memory-file-system.js";
export type {
  FailableOperation,
  MemoryFileSystem,
} from "./memory-file-system.js";

export function parseRecordedLines(contents: string | undefined): unknown[] {
  if (contents === undefined) return [];
  return contents
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as unknown);
}
