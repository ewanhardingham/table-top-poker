import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// A release build (ticket 34) is staged at packages/server/public/table and
// served for GET / — its asset URLs need that prefix baked in. The dev
// server still serves everything from "/", so only `build` gets it.

// Hostnames the dev server may be reached by, comma separated. Set it to open
// the client from another device (e.g. a tailnet name); unset keeps the dev
// server bound to localhost.
const repoRoot = new URL("../..", import.meta.url).pathname;

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const allowedHosts = (env.DEV_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const backendOrigin = env.BACKEND_ORIGIN ?? "http://localhost:3000";
  const backendWebSocketOrigin = backendOrigin.replace(/^http/, "ws");

  return {
    plugins: [react()],
    base: command === "build" ? "/table/" : "/",
    build: {
      outDir: "build",
    },
    server: {
      port: 5173,
      host: allowedHosts.length > 0,
      allowedHosts,
      proxy: {
        "/ws": {
          target: backendWebSocketOrigin,
          ws: true,
        },
        "/rooms": backendOrigin,
      },
    },
  };
});
