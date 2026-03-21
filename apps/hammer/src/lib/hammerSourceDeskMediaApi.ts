import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import { tongsFetch } from "./tongsFetch";

const INTRO_OUTRO_SELECTION_PATH = "hammer/session/intro-outro.v1.json";

export type HammerStoredMediaKind = "image" | "broll" | "audio" | "other";

export type HammerStoredMediaFile = {
  path: string;
  name: string;
  kind: HammerStoredMediaKind;
  bytes: number | null;
  updatedAt: string | null;
};

export type HammerIntroOutroSelection = {
  intro_path: string | null;
  outro_path: string | null;
  updated_at: string;
};

type StorageNode = {
  kind: "directory" | "file";
  path: string;
  bytes?: number | null;
  updated_at?: string | null;
  children?: StorageNode[];
};

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function inferStoredMediaKind(path: string): HammerStoredMediaKind {
  const normalized = path.toLowerCase();
  if (
    normalized.endsWith(".jpg")
    || normalized.endsWith(".jpeg")
    || normalized.endsWith(".png")
    || normalized.endsWith(".gif")
    || normalized.endsWith(".webp")
  ) {
    return "image";
  }
  if (
    normalized.endsWith(".mp4")
    || normalized.endsWith(".mov")
    || normalized.endsWith(".m4v")
    || normalized.endsWith(".webm")
  ) {
    return "broll";
  }
  if (
    normalized.endsWith(".wav")
    || normalized.endsWith(".mp3")
    || normalized.endsWith(".aac")
    || normalized.endsWith(".m4a")
  ) {
    return "audio";
  }
  return "other";
}

function basename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? path;
}

function flattenStorageFiles(nodes: StorageNode[]): HammerStoredMediaFile[] {
  const files: HammerStoredMediaFile[] = [];
  const walk = (node: StorageNode) => {
    if (node.kind === "file") {
      files.push({
        path: node.path,
        name: basename(node.path),
        kind: inferStoredMediaKind(node.path),
        bytes: readNullableNumber(node.bytes),
        updatedAt: readString(node.updated_at),
      });
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return files;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

export async function listWorkpieceStoredMedia(
  workpieceId: string,
): Promise<HammerStoredMediaFile[]> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/storage`,
    {
      method: "GET",
      timeoutMs: 30_000,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const root = readJsonObject(payload);
    const message = readString(readJsonObject(root?.error)?.message) ?? "Hammer could not list workpiece storage.";
    throw new Error(message);
  }

  const listing = readJsonObject(readJsonObject(payload)?.listing);
  const nodes = Array.isArray(listing?.nodes) ? listing?.nodes as StorageNode[] : [];
  return flattenStorageFiles(nodes);
}

export async function uploadWorkpieceMediaFile(args: {
  workpieceId: string;
  file: File;
  category: "images" | "broll" | "introoutro";
}): Promise<{ path: string }> {
  const safeName = sanitizeFilename(args.file.name || "upload.bin");
  const path = `assets/uploads/${args.category}/${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path,
        content_type: args.file.type || "application/octet-stream",
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        bytes_base64: toBase64(bytes),
      },
      timeoutMs: 60_000,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const root = readJsonObject(payload);
    const message = readString(readJsonObject(root?.error)?.message) ?? "Hammer could not upload media to workpiece storage.";
    throw new Error(message);
  }
  return { path };
}

export async function loadIntroOutroSelection(
  workpieceId: string,
): Promise<HammerIntroOutroSelection | null> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(INTRO_OUTRO_SELECTION_PATH)}`,
    {
      method: "GET",
      timeoutMs: 30_000,
    },
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return null;
  }
  const root = readJsonObject(payload);
  if (root?.exists !== true) return null;
  const data = readJsonObject(root?.data);
  if (!data) return null;
  return {
    intro_path: readString(data.intro_path),
    outro_path: readString(data.outro_path),
    updated_at: readString(data.updated_at) ?? new Date().toISOString(),
  };
}

export async function saveIntroOutroSelection(args: {
  workpieceId: string;
  selection: HammerIntroOutroSelection;
}): Promise<void> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: INTRO_OUTRO_SELECTION_PATH,
        content_type: "application/json",
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        json: args.selection,
      },
      timeoutMs: 30_000,
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const root = readJsonObject(payload);
    const message = readString(readJsonObject(root?.error)?.message) ?? "Hammer could not save intro/outro selection.";
    throw new Error(message);
  }
}

export async function loadWorkpieceMediaPreviewUrl(args: {
  workpieceId: string;
  path: string;
  mimeType?: string | null;
}): Promise<string> {
  const params = new URLSearchParams({
    path: args.path,
    encoding: "binary",
  });
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?${params.toString()}`,
    {
      method: "GET",
      headers: {
        accept: "application/octet-stream",
      },
      timeoutMs: 45_000,
    },
  );

  if (!response.ok) {
    throw new Error("Hammer could not load Source Desk media preview.");
  }
  const bytes = await response.arrayBuffer();
  const contentType = response.headers.get("content-type")?.trim() || args.mimeType?.trim() || "application/octet-stream";
  return URL.createObjectURL(new Blob([bytes], { type: contentType }));
}
