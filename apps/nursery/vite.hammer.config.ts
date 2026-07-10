import { mergeConfig } from "vite";
import { resolve } from "node:path";
import baseConfig from "./vite.config";

export default mergeConfig(baseConfig, {
  build: {
    outDir: resolve(import.meta.dirname, "node_modules/.hammer-production-gate"),
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: resolve(import.meta.dirname, "src/hammer-production-gate-entry.tsx"),
    },
  },
});
