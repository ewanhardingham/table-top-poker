import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "player-client",
    environment: "node",
    passWithNoTests: true,
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
