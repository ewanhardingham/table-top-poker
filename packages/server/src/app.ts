import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { fileURLToPath } from "node:url";
import { joinUrl, roomQrCodeDataUrl } from "./qr.js";
import { type Room, RoomStore } from "./rooms.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));

export interface BuildAppOptions {
  readonly rooms?: RoomStore;
}

interface RoomCodeRoute {
  Params: { code: string };
}

/** Looks up a room, replying 404 and returning undefined when it's not live. */
function findRoomOrReject(
  rooms: RoomStore,
  code: string,
  reply: FastifyReply,
): Room | undefined {
  const room = rooms.get(code);
  if (!room) {
    void reply.code(404).send({ error: "room-not-found" });
    return undefined;
  }
  return room;
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

  app.post<RoomCodeRoute>("/rooms/:code/join", (request, reply) => {
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    return { code: room.code };
  });

  app.get<RoomCodeRoute>("/rooms/:code/qr", async (request, reply) => {
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    const url = joinUrl(request.headers.host ?? "localhost", room.code);
    const dataUrl = await roomQrCodeDataUrl(url);
    return { url, dataUrl };
  });

  app.post<RoomCodeRoute>("/rooms/:code/end", (request, reply) => {
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    rooms.end(room.code);
    return reply.code(204).send();
  });

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
