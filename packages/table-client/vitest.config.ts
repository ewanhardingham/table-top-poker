import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "table-client",
    environment: "node",
    passWithNoTests: true,
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
