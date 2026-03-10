import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import type { MediaKind } from "../../../packages/contracts/hammer/media-resolver.contract";

type Next = (err?: unknown) => void;

const RECORDINGS_ROUTE = "/api/hammer/dev-recordings";
const MEDIA_ROUTE = "/api/hammer/dev-media";
const DEFAULT_SUBDIR = "recordings";
const ALLOWED_MEDIA_EXTENSIONS = new Set([".mp4", ".webm", ".mov", ".wav", ".mp3", ".m4a"]);
const TRANSCRIPT_SIDECAR_EXTENSIONS = [".json", ".srt", ".vtt", ".txt"];
const MEDIA_CONTENT_TYPES: Partial<Record<string, string>> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

type DevRecordingEntry = {
  media_id: string;
  name: string;
  extension: string;
  kind: MediaKind;
  local_relpath: string;
  playback_url: string;
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

function isSafeRelpath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.length > 0 && parts.every((part) => part !== "." && part !== "..");
}

function buildPlaybackUrl(localRootAbs: string, localRelpath: string): string {
  const params = new URLSearchParams({
    local_root_abs: localRootAbs,
    local_relpath: localRelpath,
  });
  return `${MEDIA_ROUTE}?${params.toString()}`;
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
    if (!isSafeRelpath(folder)) {
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

function resolveMediaFileAbs(localRootAbs: string, localRelpath: string): string | null {
  if (!isSafeRelpath(localRelpath)) {
    return null;
  }

  const rootAbs = path.resolve(localRootAbs);
  const absolutePath = path.resolve(rootAbs, ...localRelpath.replace(/\\/g, "/").split("/").filter(Boolean));
  const relative = path.relative(rootAbs, absolutePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return absolutePath;
}

function readHeaderString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return readTrimmed(value[0]);
  }
  return readTrimmed(value);
}

function parseByteRange(rangeHeader: string, totalSize: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader);
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  if (!startRaw) {
    const suffixSize = Number(endRaw);
    if (!Number.isFinite(suffixSize) || suffixSize <= 0) return null;
    const boundedSuffixSize = Math.min(suffixSize, totalSize);
    return {
      start: totalSize - boundedSuffixSize,
      end: totalSize - 1,
    };
  }

  const start = Number(startRaw);
  if (!Number.isFinite(start) || start < 0 || start >= totalSize) return null;

  const end = endRaw
    ? Number(endRaw)
    : totalSize - 1;
  if (!Number.isFinite(end) || end < start) return null;

  return {
    start,
    end: Math.min(end, totalSize - 1),
  };
}

async function streamMediaFile(
  req: IncomingMessage,
  res: ServerResponse,
  localRootAbs: string,
  localRelpath: string,
): Promise<void> {
  const absolutePath = resolveMediaFileAbs(localRootAbs, localRelpath);
  if (!absolutePath) {
    sendJson(res, 400, { ok: false, error: "local_relpath is invalid for this mapped media root." });
    return;
  }

  let stat;
  try {
    stat = await fsPromises.stat(absolutePath);
  } catch {
    sendJson(res, 404, { ok: false, error: "Requested media file was not found." });
    return;
  }

  if (!stat.isFile()) {
    sendJson(res, 404, { ok: false, error: "Requested media path is not a file." });
    return;
  }

  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = MEDIA_CONTENT_TYPES[extension] ?? "application/octet-stream";
  const rangeHeader = readHeaderString(req.headers.range);
  const totalSize = stat.size;

  res.setHeader("content-type", contentType);
  res.setHeader("accept-ranges", "bytes");
  res.setHeader("cache-control", "no-store");

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, totalSize);
    if (!range) {
      res.statusCode = 416;
      res.setHeader("content-range", `bytes */${totalSize}`);
      res.end();
      return;
    }

    const chunkSize = range.end - range.start + 1;
    res.statusCode = 206;
    res.setHeader("content-length", chunkSize);
    res.setHeader("content-range", `bytes ${range.start}-${range.end}/${totalSize}`);
    fs.createReadStream(absolutePath, { start: range.start, end: range.end }).pipe(res);
    return;
  }

  res.statusCode = 200;
  res.setHeader("content-length", totalSize);
  fs.createReadStream(absolutePath).pipe(res);
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
      playback_url: buildPlaybackUrl(localRootAbs, localRelpath),
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
      if (url.pathname !== RECORDINGS_ROUTE && url.pathname !== MEDIA_ROUTE) {
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

      if (url.pathname === MEDIA_ROUTE) {
        const localRelpath = readTrimmed(url.searchParams.get("local_relpath"));
        if (!localRelpath) {
          sendJson(res, 400, { ok: false, error: "local_relpath is required." });
          return;
        }
        await streamMediaFile(req, res, localRootAbs, localRelpath);
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
