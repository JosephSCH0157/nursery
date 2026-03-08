import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import type { MediaKind } from "../../../packages/contracts/hammer/media-resolver.contract";

type Next = (err?: unknown) => void;

const ROUTE = "/api/hammer/dev-recordings";
const DEFAULT_SUBDIR = "recordings";
const ALLOWED_MEDIA_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".wav", ".mp3", ".m4a"]);
const TRANSCRIPT_SIDECAR_EXTENSIONS = [".json", ".srt", ".vtt", ".txt"];

type DevRecordingEntry = {
  media_id: string;
  name: string;
  extension: string;
  kind: MediaKind;
  local_relpath: string;
  transcript_sidecar_relpath: string | null;
  byte_size: number | null;
  modified_at: string | null;
};

function readTrimmed(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(body);
}

function normalizeRelpath(rootAbs: string, absolutePath: string): string | null {
  const relative = path.relative(rootAbs, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return relative.split(path.sep).join("/");
}

function isSafeSubdir(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 && parts.every((part) => part !== "." && part !== "..");
}

function inferMediaKind(extension: string): MediaKind {
  return extension === ".wav" || extension === ".mp3" || extension === ".m4a"
    ? "recording_audio"
    : "recording_video";
}

function createDevMediaId(localRelpath: string): string {
  const slug = localRelpath
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `dev_media_${slug || "recording"}`;
}

async function resolveDirectoryAbs(localRootAbs: string, folder: string | null): Promise<string> {
  if (folder) {
    if (!isSafeSubdir(folder)) {
      throw new Error("Invalid recordings subdirectory.");
    }
    return path.join(localRootAbs, ...folder.replace(/\\/g, "/").split("/").filter(Boolean));
  }

  const recordingsDir = path.join(localRootAbs, DEFAULT_SUBDIR);
  try {
    const stat = await fsPromises.stat(recordingsDir);
    if (stat.isDirectory()) {
      return recordingsDir;
    }
  } catch {
    // Fall back to the root when the mapped directory itself is the recordings folder.
  }

  return localRootAbs;
}

async function listRecordingEntries(localRootAbs: string, folder: string | null): Promise<{
  directoryAbs: string;
  files: DevRecordingEntry[];
}> {
  const directoryAbs = await resolveDirectoryAbs(localRootAbs, folder);
  const entries = await fsPromises.readdir(directoryAbs, { withFileTypes: true });
  const siblingNames = new Set(
    entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name.toLowerCase()),
  );

  const files: DevRecordingEntry[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const extension = path.extname(entry.name).toLowerCase();
    if (!ALLOWED_MEDIA_EXTENSIONS.has(extension)) continue;

    const absolutePath = path.join(directoryAbs, entry.name);
    const localRelpath = normalizeRelpath(localRootAbs, absolutePath);
    if (!localRelpath) continue;

    let byteSize: number | null = null;
    let modifiedAt: string | null = null;
    try {
      const stat = await fsPromises.stat(absolutePath);
      byteSize = Number.isFinite(stat.size) ? stat.size : null;
      modifiedAt = stat.mtime.toISOString();
    } catch {
      // Keep listing stable even if metadata cannot be read.
    }

    const baseName = path.basename(entry.name, extension);
    const transcriptSidecarName = TRANSCRIPT_SIDECAR_EXTENSIONS
      .map((sidecarExtension) => `${baseName}${sidecarExtension}`)
      .find((candidate) => siblingNames.has(candidate.toLowerCase()))
      ?? null;
    const transcriptSidecarRelpath = transcriptSidecarName
      ? normalizeRelpath(localRootAbs, path.join(directoryAbs, transcriptSidecarName))
      : null;

    files.push({
      media_id: createDevMediaId(localRelpath),
      name: entry.name,
      extension,
      kind: inferMediaKind(extension),
      local_relpath: localRelpath,
      transcript_sidecar_relpath: transcriptSidecarRelpath,
      byte_size: byteSize,
      modified_at: modifiedAt,
    });
  }

  files.sort((left, right) => {
    if (left.modified_at && right.modified_at && left.modified_at !== right.modified_at) {
      return right.modified_at.localeCompare(left.modified_at);
    }
    return left.name.localeCompare(right.name);
  });

  return {
    directoryAbs,
    files,
  };
}

export function createHammerDevMediaMiddleware() {
  return async function hammerDevMediaMiddleware(
    req: IncomingMessage,
    res: ServerResponse,
    next: Next,
  ) {
    try {
      const rawUrl = req.url || "";
      const origin = `http://${req.headers.host || "localhost"}`;
      const url = new URL(rawUrl, origin);
      if (url.pathname !== ROUTE) {
        next();
        return;
      }

      const method = (req.method || "GET").toUpperCase();
      if (method !== "GET") {
        sendJson(res, 405, { ok: false, error: "Method not allowed." });
        return;
      }

      const localRootAbs = readTrimmed(url.searchParams.get("local_root_abs"));
      const folder = readTrimmed(url.searchParams.get("folder"));
      if (!localRootAbs || !path.isAbsolute(localRootAbs)) {
        sendJson(res, 400, { ok: false, error: "local_root_abs is required and must be absolute." });
        return;
      }

      if (!fs.existsSync(localRootAbs)) {
        sendJson(res, 404, { ok: false, error: "Mapped media root was not found on this machine." });
        return;
      }

      const { directoryAbs, files } = await listRecordingEntries(localRootAbs, folder);
      sendJson(res, 200, {
        ok: true,
        local_root_abs: localRootAbs,
        directory_abs: directoryAbs,
        files,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to list mapped recordings.";
      sendJson(res, 500, { ok: false, error: message });
    }
  };
}
