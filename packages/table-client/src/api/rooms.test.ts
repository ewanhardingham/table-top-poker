import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeSeatCount, createRoom, endSession } from "./rooms.js";

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

    const room = await createRoom(5);

    expect(fetch).toHaveBeenCalledWith("/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seatCount: 5 }),
    });
    expect(room).toEqual(body);
  });

  it("throws when the server rejects the request", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 500 }));

    await expect(createRoom(8)).rejects.toThrow("failed to create room: 500");
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

describe("changeSeatCount", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the requested count to the table settings route", async () => {
    const body = {
      seatCount: 4,
      pendingSeatCount: null,
      applied: true,
      moves: [],
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    await expect(changeSeatCount("ABCD", 4)).resolves.toEqual(body);
    expect(fetch).toHaveBeenCalledWith("/rooms/ABCD/seats/count", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seatCount: 4 }),
    });
  });

  it("throws when the server rejects a setting", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 400 }));

    await expect(changeSeatCount("ABCD", 1)).rejects.toThrow(
      "failed to change seat count: 400",
    );
  });
});
