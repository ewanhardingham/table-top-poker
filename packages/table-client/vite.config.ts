import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const repoRoot = new URL("../..", import.meta.url).pathname;

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
    base: command === "build" ? "/table/" : "/",
    build: {
      outDir: "build",
      rolldownOptions: {
        input: {
          main: fileURLToPath(new URL("index.html", import.meta.url)),
          burn: fileURLToPath(new URL("burn.html", import.meta.url)),
        },
      },
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
