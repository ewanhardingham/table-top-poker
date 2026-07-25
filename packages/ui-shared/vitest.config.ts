import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "ui-shared",
    environment: "node",
    passWithNoTests: true,
    exclude: ["**/dist/**", "**/node_modules/**"],
  },
});
