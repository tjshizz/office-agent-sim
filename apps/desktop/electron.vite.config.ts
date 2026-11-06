import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

const sharedAlias = {
  "@office-sim/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
  "@office-sim/sim": resolve(__dirname, "../../packages/sim/src/index.ts"),
  "@office-sim/agents": resolve(__dirname, "../../packages/agents/src/index.ts"),
  "@office-sim/game": resolve(__dirname, "../../packages/game/src/index.ts"),
  "@office-sim/ui": resolve(__dirname, "../../packages/ui/src/index.ts"),
};

const workspaceExclude = [
  "@office-sim/shared",
  "@office-sim/sim",
  "@office-sim/agents",
  "@office-sim/game",
  "@office-sim/ui",
];

export default defineConfig({
  main: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin({ exclude: workspaceExclude })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/main/index.ts"),
        },
      },
    },
  },
  preload: {
    resolve: { alias: sharedAlias },
    plugins: [externalizeDepsPlugin({ exclude: workspaceExclude })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "renderer"),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "renderer/index.html"),
        },
      },
    },
    resolve: { alias: sharedAlias },
    plugins: [react()],
  },
});

