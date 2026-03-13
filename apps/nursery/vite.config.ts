import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, join, dirname, isAbsolute } from "path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { createHammerDevMediaMiddleware } from "./scripts/mw-hammer-dev-media";
import { mwHearthChatApi } from "./scripts/mw-hearth-chat-api";
import { createNurseryTongsMiddleware } from "./scripts/mw-tongs-commit-api";

const RETRYABLE_PUBLIC_COPY_CODES = new Set(["EPERM", "EBUSY", "ENOTEMPTY"]);
const PUBLIC_COPY_RETRIES = 6;
const PUBLIC_COPY_RETRY_DELAY_MS = 50;
const EXTRA_FS_ALLOW_ENV_KEYS = ["FORGE_VITE_FS_ALLOW", "FORGE_MEDIA_ROOTS"] as const;

function isRetryableCopyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return RETRYABLE_PUBLIC_COPY_CODES.has(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function copyFileWithRetry(srcPath: string, destPath: string): Promise<void> {
  for (let attempt = 0; attempt < PUBLIC_COPY_RETRIES; attempt += 1) {
    try {
      await fsPromises.copyFile(srcPath, destPath);
      return;
    } catch (error) {
      if (!isRetryableCopyError(error)) throw error;
      if (attempt === PUBLIC_COPY_RETRIES - 1) {
        console.warn(`[nursery:copy-public] skipping locked file: ${srcPath}`);
        return;
      }
      await sleep(PUBLIC_COPY_RETRY_DELAY_MS * (attempt + 1));
    }
  }
}

async function copyPublicDirResilient(srcDir: string, destDir: string): Promise<void> {
  if (!fs.existsSync(srcDir)) return;
  await fsPromises.mkdir(destDir, { recursive: true });

  const entries = await fsPromises.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name);
    const destPath = join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyPublicDirResilient(srcPath, destPath);
      continue;
    }
    await fsPromises.mkdir(dirname(destPath), { recursive: true });
    await copyFileWithRetry(srcPath, destPath);
  }
}

function readExtraFsAllowRoots(): string[] {
  const raw = EXTRA_FS_ALLOW_ENV_KEYS
    .map((key) => process.env[key] ?? "")
    .find((value) => value.trim().length > 0)
    ?? "";
  if (!raw.trim()) return [];

  const roots = new Set<string>();
  for (const part of raw.split(/[;\n,]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    roots.add(isAbsolute(trimmed) ? trimmed : resolve(__dirname, trimmed));
  }
  return Array.from(roots);
}

const EXTRA_FS_ALLOW_ROOTS = readExtraFsAllowRoots();

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "nursery:copy-public-resilient",
      apply: "build",
      async closeBundle() {
        const rootDir = __dirname;
        const srcDir = resolve(rootDir, "public");
        const destDir = resolve(rootDir, "dist");
        await copyPublicDirResilient(srcDir, destDir);
      },
    },
    {
      name: "nursery:tongs-commit-api",
      configureServer(server) {
        server.middlewares.use(createNurseryTongsMiddleware({ routePrefix: "/tongs" }));
        server.middlewares.use(mwHearthChatApi());
        server.middlewares.use(createHammerDevMediaMiddleware());
      },
    },
  ],
  resolve: {
    alias: {
      "@forge/quench": resolve(__dirname, "../quench/src/index.ts"),
      "@barstock": resolve(__dirname, "../bar-stock/src"),
      "@hearth": resolve(__dirname, "../hearth/src"),
      "@hammer": resolve(__dirname, "../hammer/src"),
    },
  },
  server: {
    fs: {
      allow: [
        resolve(__dirname, ".."),
        resolve(__dirname, "../.."),
        ...EXTRA_FS_ALLOW_ROOTS,
      ],
    },
  },
  build: {
    copyPublicDir: false,
  },
});
