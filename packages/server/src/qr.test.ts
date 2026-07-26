import { describe, expect, it } from "vitest";
import { joinUrl, roomQrCodeDataUrl } from "./qr.js";

describe("joinUrl", () => {
  it("builds a join URL from the request's host and the room code", () => {
    expect(joinUrl("192.168.1.50:3000", "AB34")).toBe(
      "http://192.168.1.50:3000/join/AB34",
    );
  });
});

describe("roomQrCodeDataUrl", () => {
  it("encodes the join URL as a data URL", async () => {
    const dataUrl = await roomQrCodeDataUrl(
      "http://192.168.1.50:3000/join/AB34",
    );
    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
