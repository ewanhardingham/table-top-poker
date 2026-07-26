import { describe, expect, it } from "vitest";
import { getWebSocketUrl } from "./getWebSocketUrl.js";

describe("getWebSocketUrl", () => {
  it("derives wss:// from an https: location", () => {
    expect(
      getWebSocketUrl({ protocol: "https:", host: "poker.local:8080" }),
    ).toBe("wss://poker.local:8080/ws");
  });

  it("derives ws:// from an http: location", () => {
    expect(getWebSocketUrl({ protocol: "http:", host: "localhost:3000" })).toBe(
      "ws://localhost:3000/ws",
    );
  });
});
