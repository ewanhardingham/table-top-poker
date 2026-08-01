import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimSeat, joinRoom } from "./rooms.js";

describe("joinRoom", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /rooms/:code/join and returns the room view", async () => {
    const body = { code: "ABCD", seats: [] };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    const view = await joinRoom("ABCD");

    expect(fetch).toHaveBeenCalledWith("/rooms/ABCD/join", { method: "POST" });
    expect(view).toEqual(body);
  });

  it("throws when the room doesn't exist", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 404 }));
    await expect(joinRoom("ZZZZ")).rejects.toThrow("failed to join room: 404");
  });
});

describe("claimSeat", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /rooms/:code/seats/:seatId/claim and returns the claim", async () => {
    const body = {
      seatId: 2,
      token: "tok",
      displayName: "Avery",
      sittingOut: false,
      sittingOutReason: null,
    };
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200 }),
    );

    const claim = await claimSeat("ABCD", 2, "Avery");

    expect(fetch).toHaveBeenCalledWith("/rooms/ABCD/seats/2/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Avery" }),
    });
    expect(claim).toEqual(body);
  });

  it("throws when the seat is already claimed", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 409 }));
    await expect(claimSeat("ABCD", 2, "Avery")).rejects.toThrow(
      "failed to claim seat: 409",
    );
  });

  it("preserves the server error code for a duplicate display name", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "duplicate-display-name" }), {
        status: 409,
      }),
    );

    await expect(claimSeat("ABCD", 2, "Avery")).rejects.toThrow(
      "duplicate-display-name",
    );
  });
});
