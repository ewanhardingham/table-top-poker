import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "engine",
    environment: "node",
    passWithNoTests: true,
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
