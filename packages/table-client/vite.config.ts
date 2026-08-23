import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const repoRoot = new URL("../..", import.meta.url).pathname;
const uiSharedSource = new URL("../ui-shared/src/index.ts", import.meta.url)
  .pathname;

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, repoRoot, "");
  const allowedHosts = (env.DEV_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
  const devServerHost =
    process.env.DEV_SERVER_HOST ??
    (allowedHosts.length > 0 ? "0.0.0.0" : "127.0.0.1");
  const backendOrigin = env.BACKEND_ORIGIN ?? "http://localhost:3000";
  const backendWebSocketOrigin = backendOrigin.replace(/^http/, "ws");

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@table-top-poker/ui-shared": uiSharedSource,
      },
    },
    base: command === "build" ? "/table/" : "/",
    build: {
      outDir: "build",
    },
    server: {
      port: 5173,
      host: devServerHost,
      allowedHosts,
      proxy: {
        "/ws": {
          target: backendWebSocketOrigin,
          ws: true,
        },
        "/config": backendOrigin,
        "/rooms": backendOrigin,
      },
    },
  };
});
