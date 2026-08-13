import { DirectoryRecordings } from "@table-top-poker/recording";
import { buildApp } from "./app.js";

/**
 * Where Room recordings live. Unset is a default, never an off switch —
 * recording is a Room invariant (Phase 2 spec #129 §3), and this process
 * refuses to start if the root will not take a write.
 */
const DEFAULT_RECORDINGS_DIR = "./recordings";

async function main(): Promise<void> {
  const recordings = new DirectoryRecordings(
    process.env.RECORDINGS_DIR ?? DEFAULT_RECORDINGS_DIR,
  );
  // Before listening, not at the first hand: an unwritable disk discovered
  // mid-session is discovered far too late, and a room already has players in
  // it by then.
  await recordings.ensureWritable();

  const app = await buildApp({ recordings });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";

  // A deploy is `systemctl restart poker`, so SIGTERM is the normal way this
  // process ends. Closing the app drains every open recording first; without
  // this the append in flight at that moment is simply lost.
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
