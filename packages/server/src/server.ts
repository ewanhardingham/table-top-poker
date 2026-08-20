import { DirectoryRecordings } from "@table-top-poker/recording";
import { buildApp } from "./app.js";

/** Unset is a default, never an off switch: recording is a Room invariant. */
const DEFAULT_RECORDINGS_DIR = "./recordings";

async function main(): Promise<void> {
  const testMode = process.env.POKER_TEST_MODE !== undefined;
  const recordings = new DirectoryRecordings(
    process.env.RECORDINGS_DIR ?? DEFAULT_RECORDINGS_DIR,
  );
  // Before listening: an unwritable disk found mid-session is found far too late.
  await recordings.ensureWritable();

  const app = await buildApp({ recordings, testMode });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";

  // SIGTERM is the normal end (a deploy restarts the unit); closing drains first.
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      app.log.info(`${signal} received, draining recordings`);
      void app.close().then(
        () => process.exit(0),
        (error: unknown) => {
          console.error(error);
          process.exit(1);
        },
      );
    });
  }

  await app.listen({ port, host });
  app.log.info(`table-top-poker server listening on port ${String(port)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
