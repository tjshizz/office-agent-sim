import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@office-sim/shared": resolve(root, "packages/shared/src/index.ts"),
      "@office-sim/sim": resolve(root, "packages/sim/src/index.ts"),
      "@office-sim/agents": resolve(root, "packages/agents/src/index.ts"),
      "@office-sim/game": resolve(root, "packages/game/src/index.ts"),
      "@office-sim/ui": resolve(root, "packages/ui/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/xai": {
        target: "https://api.x.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/xai/, ""),
        secure: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/xai": {
        target: "https://api.x.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/xai/, ""),
        secure: true,
      },
    },
  },
  optimizeDeps: {
    include: ["phaser"],
  },
});
