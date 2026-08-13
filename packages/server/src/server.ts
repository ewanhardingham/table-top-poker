import { DirectoryRecordings } from "@table-top-poker/recording";
import { buildApp } from "./app.js";

/**
 * Where Room recordings live. Unset is a default, never an off switch —
 * recording is a Room invariant (Phase 2 spec #129 §3), and this process
 * refuses to start if the root will not take a write.
 */
const DEFAULT_RECORDINGS_DIR = "./recordings";

async function main(): Promise<void> {
  const testMode = process.env.POKER_TEST_MODE !== undefined;
  const recordings = new DirectoryRecordings(
    process.env.RECORDINGS_DIR ?? DEFAULT_RECORDINGS_DIR,
  );
  // Before listening, not at the first hand: an unwritable disk discovered
  // mid-session is discovered far too late, and a room already has players in
  // it by then.
  await recordings.ensureWritable();

  const app = await buildApp({ recordings, testMode });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen({ port, host });
  app.log.info(`table-top-poker server listening on port ${String(port)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
