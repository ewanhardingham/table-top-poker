import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfigFromFile } from "vite";

describe("table-client Vite dev proxy", () => {
  it("forwards server config discovery to the backend", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    );

    expect(loaded?.config.server?.proxy).toMatchObject({
      "/config": "http://localhost:3000",
    });
  });
});
