import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfigFromFile } from "vite";

describe("table-client Vite dev proxy", () => {
  it("forwards server config discovery to the backend", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    );

    const proxy = loaded?.config.server?.proxy;
    expect(proxy).toBeDefined();
    if (proxy === undefined) return;

    expect(proxy["/rooms"]).toBeDefined();
    expect(proxy["/config"]).toBe(proxy["/rooms"]);
  });
});

describe("table-client Vite entries", () => {
  it("builds the burn prototype alongside the table app", async () => {
    const loaded = await loadConfigFromFile(
      { command: "build", mode: "test" },
      fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    );

    expect(loaded?.config.build?.rolldownOptions?.input).toMatchObject({
      main: expect.stringContaining("index.html") as string,
      burn: expect.stringContaining("burn.html") as string,
    });
  });
});
