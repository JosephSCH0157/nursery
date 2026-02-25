import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { createNurseryTongsMiddleware } from "./scripts/mw-tongs-commit-api";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "nursery:tongs-commit-api",
      configureServer(server) {
        server.middlewares.use(createNurseryTongsMiddleware({ routePrefix: "/tongs" }));
      },
    },
  ],
  resolve: {
    alias: {
      "@barstock": resolve(__dirname, "../bar-stock/src"),
      "@hearth": resolve(__dirname, "../hearth/src"),
    },
  },
  server: {
    fs: {
      allow: [resolve(__dirname, ".."), resolve(__dirname, "../..")],
    },
  },
});
