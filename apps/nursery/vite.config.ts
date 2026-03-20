import { defineConfig, type Connect } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, join, dirname, isAbsolute, extname, sep } from "path";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { createHammerDevMediaMiddleware } from "./scripts/mw-hammer-dev-media";
import { createHammerPrepMiddleware } from "./scripts/mw-hammer-prep";
import { mwAnvilWhisperApi } from "./scripts/mw-anvil-whisper-api";
import { mwHearthChatApi } from "./scripts/mw-hearth-chat-api";
import { createNurseryTongsMiddleware } from "./scripts/mw-tongs-commit-api";

const RETRYABLE_PUBLIC_COPY_CODES = new Set(["EPERM", "EBUSY", "ENOTEMPTY"]);
const PUBLIC_COPY_RETRIES = 6;
const PUBLIC_COPY_RETRY_DELAY_MS = 50;
const EXTRA_FS_ALLOW_ENV_KEYS = ["FORGE_VITE_FS_ALLOW", "FORGE_MEDIA_ROOTS"] as const;
const ANVIL_DEV_ROUTE_PREFIX = "/anvil/";

function getMimeType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    case ".ico":
      return "image/x-icon";
    case ".jpeg":
    case ".jpg":
      return "image/jpeg";
    case ".js":
    case ".mjs":
      return "text/javascript; charset=utf-8";
    case ".json":
    case ".map":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".webm":
      return "video/webm";
    case ".webmanifest":
      return "application/manifest+json; charset=utf-8";
    case ".xml":
      return "application/xml; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function normalizeAnvilAssetPath(url: string | undefined): string | null {
  const rawUrl = typeof url === "string" ? url : "";
  const pathname = rawUrl.split("?")[0]?.split("#")[0] ?? "";
  if (pathname === "/anvil" || pathname === "/anvil/") {
    return "teleprompter_pro.html";
  }
  if (!pathname.startsWith(ANVIL_DEV_ROUTE_PREFIX)) return null;
  const encodedRelative = pathname.slice(ANVIL_DEV_ROUTE_PREFIX.length);
  if (!encodedRelative) return null;
  let decodedRelative: string;
  try {
    decodedRelative = decodeURIComponent(encodedRelative);
  } catch {
    return null;
  }
  const normalized = decodedRelative.replace(/\\/g, "/");
  if (
    normalized.length === 0
    || normalized.startsWith("/")
    || normalized.split("/").some((segment) => segment === ".." || segment.length === 0)
  ) {
    return null;
  }
  return normalized;
}

function resolveInside(rootDir: string, relativePath: string): string | null {
  const candidate = resolve(rootDir, relativePath);
  const normalizedRoot = `${rootDir}${sep}`;
  if (candidate === rootDir || candidate.startsWith(normalizedRoot)) {
    return candidate;
  }
  return null;
}

function createAnvilSourceMiddleware() {
  return async (
    req: Connect.IncomingMessage,
    res: Connect.ServerResponse,
    next: Connect.NextFunction,
  ) => {
    const relativePath = normalizeAnvilAssetPath(req.url);
    if (!relativePath) {
      next();
      return;
    }

    const sourceRoot = resolve(__dirname, "../anvil");
    const publicMirrorRoot = resolve(__dirname, "public", "anvil");
    const candidatePaths = [
      resolveInside(sourceRoot, relativePath),
      resolveInside(publicMirrorRoot, relativePath),
    ].filter((value): value is string => !!value);

    for (const candidatePath of candidatePaths) {
      try {
        const stats = await fsPromises.stat(candidatePath);
        if (!stats.isFile()) continue;
        res.statusCode = 200;
        res.setHeader("Content-Type", getMimeType(candidatePath));
        if (candidatePath.toLowerCase().endsWith(".html")) {
          res.setHeader("Cache-Control", "no-store");
        }
        fs.createReadStream(candidatePath)
          .on("error", (error) => next(error))
          .pipe(res);
        return;
      } catch {
        // Try the next candidate path. Locked or missing public mirror files
        // should not stop dev from loading Anvil.
      }
    }

    next();
  };
}

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
        server.middlewares.use(createAnvilSourceMiddleware());
        server.middlewares.use(createNurseryTongsMiddleware({ routePrefix: "/tongs" }));
        server.middlewares.use(mwHearthChatApi());
        server.middlewares.use(mwAnvilWhisperApi());
        server.middlewares.use(createHammerDevMediaMiddleware());
        server.middlewares.use(createHammerPrepMiddleware());
      },
    },
  ],
  resolve: {
    alias: {
      "@forge/bellows": resolve(__dirname, "../bellows/dist/index.js"),
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
