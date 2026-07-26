import { buildApp } from "./app.js";

export { buildApp } from "./app.js";
export { RoomStore, type Room } from "./rooms.js";
export { ROOM_CODE_ALPHABET, generateRoomCode } from "./room-code.js";

async function main(): Promise<void> {
  const app = await buildApp();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  app.log.info(`table-top-poker server listening on port ${String(port)}`);
}

const invokedScript = process.argv[1];
if (
  invokedScript !== undefined &&
  import.meta.url === `file://${invokedScript}`
) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
