import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Hostnames the dev server may be reached by, comma separated. Set it to open
// the client from another device (e.g. a tailnet name); unset keeps the dev
// server bound to localhost.
const repoRoot = new URL("../..", import.meta.url).pathname;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const allowedHosts = (env.DEV_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    plugins: [react()],
    build: {
      outDir: "build",
    },
    server: {
      port: 5173,
      host: allowedHosts.length > 0,
      allowedHosts,
      proxy: {
        "/ws": {
          target: "ws://localhost:3000",
          ws: true,
        },
        "/rooms": "http://localhost:3000",
      },
    },
  };
});
