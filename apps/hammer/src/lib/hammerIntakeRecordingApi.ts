import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import { tongsFetch } from "./tongsFetch";

type JsonRecord = Record<string, unknown>;
type TongsFetcher = typeof tongsFetch;

export type HammerDetectedMediaType = "audio" | "video" | "unsupported";
export type HammerIntakeMode = "episode_attached" | "standalone";

export type HammerIntakeResult =
  | {
      ok: true;
      mode: HammerIntakeMode;
      workspace_id: string;
      workpiece_id: string;
      media_type: Exclude<HammerDetectedMediaType, "unsupported">;
      storage_path: string;
      take_kept_event_id: number | null;
    }
  | {
      ok: false;
      mode: HammerIntakeMode;
      workspace_id: string | null;
      workpiece_id: string | null;
      media_type: HammerDetectedMediaType;
      storage_path: string | null;
      take_kept_event_id: null;
      error: string;
    };

function readJsonRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractTongsErrorMessage(payload: unknown): string | null {
  const root = readJsonRecord(payload);
  const error = readJsonRecord(root?.error) ?? readJsonRecord(readJsonRecord(root?.data)?.error);
  const message = readString(error?.message);
  return message ?? null;
}

function encodeBase64(bytes: Uint8Array): string {
  if (!bytes.length) return "";

  const globalWithBuffer = globalThis as typeof globalThis & {
    Buffer?: { from: (data: Uint8Array) => { toString: (encoding: "base64") => string } };
  };
  if (globalWithBuffer.Buffer?.from) {
    return globalWithBuffer.Buffer.from(bytes).toString("base64");
  }

  if (typeof btoa !== "function") {
    throw new Error("No base64 encoder available in runtime");
  }

  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function buildStandaloneLabelFromFile(file: File): string {
  const base = `Standalone Edit — ${file.name || "Untitled"}`.trim();
  return base.length > 160 ? base.slice(0, 160).trim() : base;
}

function buildRecordingImportPath(file: File, timestampMs = Date.now()): string {
  const safeName = sanitizeFilename(file.name || "upload.bin");
  const stamp = Number.isFinite(timestampMs) ? Math.trunc(timestampMs) : Date.now();
  return `recordings/imported-${stamp}-${safeName}`;
}

function detectMediaTypeFromExtension(filename: string): HammerDetectedMediaType {
  const normalized = filename.trim().toLowerCase();
  if (/\.(wav|mp3|m4a|aac|flac|ogg|opus)$/i.test(normalized)) return "audio";
  if (/\.(mp4|mov|m4v|webm|mkv)$/i.test(normalized)) return "video";
  return "unsupported";
}

export function detectMediaType(file: Pick<File, "type" | "name">): HammerDetectedMediaType {
  const mime = (file.type ?? "").trim().toLowerCase();
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return detectMediaTypeFromExtension(file.name ?? "");
}

export async function pickMediaFile(): Promise<File | null> {
  if (typeof document === "undefined") return null;

  const accept = "audio/*,video/*";

  const maybePicker = (globalThis as unknown as { showOpenFilePicker?: unknown }).showOpenFilePicker;
  if (typeof maybePicker === "function") {
    try {
      const handles = await (maybePicker as (options: unknown) => Promise<Array<{ getFile: () => Promise<File> }>>)( {
        multiple: false,
        types: [
          {
            description: "Audio or video",
            accept: {
              "audio/*": [".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus"],
              "video/*": [".mp4", ".mov", ".m4v", ".webm", ".mkv"],
            },
          },
        ],
      });
      const first = handles[0];
      if (!first) return null;
      return await first.getFile();
    } catch {
      // Fall back to input picker.
    }
  }

  return await new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = false;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "-9999px";

    let settled = false;

    const cleanup = () => {
      try {
        input.remove();
      } catch {
        // ignore
      }
    };

    const settle = (file: File | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(file);
    };

    input.addEventListener("change", () => {
      const file = input.files && input.files.length > 0 ? input.files[0] ?? null : null;
      settle(file);
    }, { once: true });

    // Browsers do not reliably emit a cancellation event for <input type="file">.
    // The best-effort fallback is: if the picker closes without a change event,
    // the window regains focus and we resolve null.
    const onWindowFocus = () => {
      setTimeout(() => settle(null), 0);
    };
    window.addEventListener("focus", onWindowFocus, { once: true });

    document.body.appendChild(input);
    input.click();
  });
}

export async function createStandaloneCradle(args: {
  workspaceId: string;
  label: string;
  fetcher?: TongsFetcher;
}): Promise<string> {
  const response = await (args.fetcher ?? tongsFetch)("/tongs/cradles", {
    method: "POST",
    json: {
      workspace_id: args.workspaceId,
      metadata: {
        label: args.label,
      },
      origin_tool: {
        name: "hammer",
        version: HAMMER_RUNTIME_WRITTEN_BY.tool_version,
      },
      written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
    },
    timeoutMs: 30_000,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractTongsErrorMessage(payload) ?? "Hammer could not create a standalone workpiece.");
  }

  const cradle = readJsonRecord(readJsonRecord(readJsonRecord(payload)?.data)?.cradle);
  const cradleId = readString(cradle?.id);
  if (!cradleId) {
    throw new Error("Hammer could not resolve the newly created workpiece id.");
  }

  return cradleId;
}

export async function commitRecordingFile(args: {
  workpieceId: string;
  file: File;
  destPath: string;
  fetcher?: TongsFetcher;
}): Promise<void> {
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const contentType = readString(args.file.type)?.toLowerCase() || "application/octet-stream";
  const response = await (args.fetcher ?? tongsFetch)(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: args.destPath,
        content_type: contentType,
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        bytes_base64: encodeBase64(bytes),
        event_name: "take_completed",
        event_payload: {
          source: "hammer.intake",
          file_path: args.destPath,
          original_name: args.file.name || "upload.bin",
          bytes: bytes.byteLength,
          content_type: contentType,
        },
      },
      timeoutMs: 60_000,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractTongsErrorMessage(payload) ?? "Hammer could not upload media to workpiece recordings.");
  }
}

export async function appendTakeKept(args: {
  workpieceId: string;
  file: File;
  filePath: string;
  bytes: number;
  contentType: string;
  fetcher?: TongsFetcher;
}): Promise<number | null> {
  const response = await (args.fetcher ?? tongsFetch)(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/append-event`,
    {
      method: "POST",
      json: {
        event_name: "take_kept",
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        payload: {
          source: "hammer.intake",
          file_path: args.filePath,
          original_name: args.file.name || "upload.bin",
          bytes: args.bytes,
          content_type: args.contentType,
          duration_ms: null,
        },
      },
      timeoutMs: 30_000,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(extractTongsErrorMessage(payload) ?? "Hammer could not mark this take as kept in Tongs.");
  }

  const eventId = readNullableNumber(readJsonRecord(readJsonRecord(payload)?.data)?.id);
  return eventId;
}

export async function intake(args:
  | {
      mode: "episode_attached";
      workspaceId: string;
      workpieceId: string;
      file: File;
      fetcher?: TongsFetcher;
    }
  | {
      mode: "standalone";
      workspaceId: string;
      file: File;
      fetcher?: TongsFetcher;
    }
): Promise<HammerIntakeResult> {
  const startedAt = Date.now();
  const mode = args.mode;
  const workspaceId = args.workspaceId;
  let workpieceId: string | null = "workpieceId" in args ? args.workpieceId : null;
  let mediaType: HammerDetectedMediaType = "unsupported";
  let storagePath: string | null = null;
  let takeKeptEventId: number | null = null;
  let outcome: "success" | "failure" = "failure";

  try {
    mediaType = detectMediaType(args.file);
    if (mediaType === "unsupported") {
      throw new Error("Hammer only supports importing audio or video files.");
    }

    if (mode === "standalone") {
      workpieceId = await createStandaloneCradle({
        workspaceId,
        label: buildStandaloneLabelFromFile(args.file),
        fetcher: args.fetcher,
      });
    }

    if (!workpieceId) {
      throw new Error("Missing workpiece context for media intake.");
    }

    storagePath = buildRecordingImportPath(args.file, startedAt);
    await commitRecordingFile({
      workpieceId,
      file: args.file,
      destPath: storagePath,
      fetcher: args.fetcher,
    });

    const contentType = readString(args.file.type)?.toLowerCase() || "application/octet-stream";
    takeKeptEventId = await appendTakeKept({
      workpieceId,
      file: args.file,
      filePath: storagePath,
      bytes: args.file.size,
      contentType,
      fetcher: args.fetcher,
    });

    outcome = "success";
    const result: HammerIntakeResult = {
      ok: true,
      mode,
      workspace_id: workspaceId,
      workpiece_id: workpieceId,
      media_type: mediaType,
      storage_path: storagePath,
      take_kept_event_id: takeKeptEventId,
    };
    return result;
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "Hammer intake failed.";
    return {
      ok: false,
      mode,
      workspace_id: workspaceId ?? null,
      workpiece_id: workpieceId,
      media_type: mediaType,
      storage_path: storagePath,
      take_kept_event_id: null,
      error: message,
    };
  } finally {
    const payload: Record<string, unknown> = {
      mode,
      workspace_id: workspaceId ?? null,
      workpiece_id: workpieceId,
      media_type: mediaType,
      storage_path: storagePath,
      take_kept_event_id: takeKeptEventId,
      result: outcome,
    };
    // eslint-disable-next-line no-console
    console.info("[hammer-intake]", payload);
  }
}
