import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoom, endSession } from "./rooms.js";

describe("createRoom", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /rooms and returns the created room", async () => {
    const body = {
      code: "ABCD",
      joinUrl: "http://localhost:3000/join/ABCD",
      qrCodeDataUrl: "data:image/png;base64,xyz",
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    const room = await createRoom();

    expect(fetch).toHaveBeenCalledWith("/rooms", { method: "POST" });
    expect(room).toEqual(body);
  });

  it("throws when the server rejects the request", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(createRoom()).rejects.toThrow("failed to create room: 500");
  });
});

describe("endSession", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /rooms/:code/end", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    await endSession("ABCD");

    expect(fetch).toHaveBeenCalledWith("/rooms/ABCD/end", { method: "POST" });
  });

  it("throws when the server rejects the request", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));

    await expect(endSession("ABCD")).rejects.toThrow(
      "failed to end session: 404",
    );
  });
});
