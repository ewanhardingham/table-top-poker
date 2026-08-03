import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimSeat, joinRoom, leaveSeat } from "./rooms.js";

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

describe("leaveSeat", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the seat token to the leave endpoint with keepalive", () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 204 }));

    leaveSeat("ABCD", 2, "tok");

    expect(fetch).toHaveBeenCalledWith("/rooms/ABCD/seats/2/leave", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "tok" }),
      keepalive: true,
    });
  });

  it("never throws when the request fails — teardown proceeds regardless", () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));

    expect(() => {
      leaveSeat("ABCD", 2, "tok");
    }).not.toThrow();
  });
});
