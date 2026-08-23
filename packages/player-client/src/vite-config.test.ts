import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadConfigFromFile } from "vite";

describe("player-client Vite workspace aliases", () => {
  it("resolves ui-shared from source so stale workspace dist cannot hide cues", async () => {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
    );

    expect(loaded?.config.resolve?.alias).toMatchObject({
      "@table-top-poker/ui-shared": fileURLToPath(
        new URL("../../ui-shared/src/index.ts", import.meta.url),
      ),
    });
  });
});
