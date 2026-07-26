import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { fileURLToPath } from "node:url";
import { joinUrl, roomQrCodeDataUrl } from "./qr.js";
import { RoomStore } from "./rooms.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));

export interface BuildAppOptions {
  readonly rooms?: RoomStore;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const rooms = options.rooms ?? new RoomStore();
  const app = Fastify();

  await app.register(fastifyStatic, { root: publicDir });
  await app.register(fastifyWebsocket);

  app.post("/rooms", () => {
    const room = rooms.create();
    return { code: room.code };
  });

  app.post<{ Params: { code: string } }>(
    "/rooms/:code/join",
    async (request, reply) => {
      const room = rooms.get(request.params.code);
      if (!room) {
        return reply.code(404).send({ error: "room-not-found" });
      }
      return { code: room.code };
    },
  );

  app.get<{ Params: { code: string } }>(
    "/rooms/:code/qr",
    async (request, reply) => {
      const room = rooms.get(request.params.code);
      if (!room) {
        return reply.code(404).send({ error: "room-not-found" });
      }
      const url = joinUrl(request.headers.host ?? "localhost", room.code);
      const dataUrl = await roomQrCodeDataUrl(url);
      return { url, dataUrl };
    },
  );

  app.post<{ Params: { code: string } }>(
    "/rooms/:code/end",
    async (request, reply) => {
      const room = rooms.get(request.params.code);
      if (!room) {
        return reply.code(404).send({ error: "room-not-found" });
      }
      rooms.end(request.params.code);
      return reply.code(204).send();
    },
  );

  app.register((wsApp, _opts, done) => {
    wsApp.get("/ws", { websocket: true }, (socket) => {
      socket.on("message", () => {
        // No payload logic yet — the connection is the whole contract for this slice.
      });
    });
    done();
  });

  return app;
}
