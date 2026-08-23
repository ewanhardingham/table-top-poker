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
  const entries = async (command: "serve" | "build") => {
    const loaded = await loadConfigFromFile(
      { command, mode: "test" },
      fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    );
    return loaded?.config.build?.rolldownOptions?.input;
  };

  it("serves the burn prototype alongside the table app in dev", async () => {
    expect(await entries("serve")).toMatchObject({
      main: expect.stringContaining("index.html") as string,
      burn: expect.stringContaining("burn.html") as string,
    });
  });

  it("keeps the prototype out of the release the Pi serves to the LAN", async () => {
    const input = await entries("build");
    expect(input).toMatchObject({
      main: expect.stringContaining("index.html") as string,
    });
    expect(input).not.toHaveProperty("burn");
  });
});
