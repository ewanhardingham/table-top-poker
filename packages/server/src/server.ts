import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`table-top-poker server listening on port ${String(port)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
