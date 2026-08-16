import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const handLogDir = process.env.HAND_LOG_DIR;
  const testMode = process.env.POKER_TEST_MODE !== undefined;
  const app = await buildApp({
    ...(handLogDir === undefined ? {} : { handLogDir }),
    testMode,
  });
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen({ port, host });
  app.log.info(`table-top-poker server listening on port ${String(port)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
