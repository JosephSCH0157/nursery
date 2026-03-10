import {
  createEmptyEpisodePackageV2,
  ensureImageMapV2,
  type EpisodeImageMapEntry,
} from "./episode-package-v2";
import { tongsFetch } from "./tongs-fetch";

export type WorkpieceImageMapView = {
  workpieceId: string;
  workspaceId: string;
  entries: EpisodeImageMapEntry[];
  metadataUpdatedAt: string | null;
  asset: {
    id: string;
    path: "assets/image-map/image-map.v1.json";
    assetKind: "image_map_json";
    status: "ready";
    storageBucket: string;
    storageKey: string;
    entryCount: number;
    updatedAt: string;
    supersedesAssetId: string | null;
  } | null;
};

export type GetWorkpieceImageMapResult =
  | { ok: true; imageMap: WorkpieceImageMapView }
  | { ok: false; status: number; reason: string };

export type SaveWorkpieceImageMapResult =
  | { ok: true; imageMap: WorkpieceImageMapView }
  | { ok: false; status: number; reason: "request_failed" | "conflict" | "invalid_response"; latest?: WorkpieceImageMapView };

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

async function readBodyAsJson(response: Response): Promise<unknown> {
  const text = await response.text();
  const raw = readString(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function normalizeImageMapEntries(value: unknown): EpisodeImageMapEntry[] {
  const pkg = ensureImageMapV2({
    ...createEmptyEpisodePackageV2(),
    image_map: {
      entries: Array.isArray(value) ? value as EpisodeImageMapEntry[] : [],
    },
  });
  return pkg.image_map.entries;
}

function normalizeWorkpieceImageMapView(body: unknown): WorkpieceImageMapView | null {
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) return null;

  const imageMapRoot = isRecord(body.data.image_map) ? body.data.image_map : null;
  if (!imageMapRoot) return null;

  const workpieceId = readString(imageMapRoot.workpiece_id);
  const workspaceId = readString(imageMapRoot.workspace_id);
  if (!workpieceId || !workspaceId) return null;

  const assetRoot = isRecord(body.data.asset) ? body.data.asset : null;
  const entryCount = assetRoot && isRecord(assetRoot.metadata_json) && typeof assetRoot.metadata_json.entry_count === "number"
    ? Math.max(0, Math.trunc(assetRoot.metadata_json.entry_count))
    : 0;

  return {
    workpieceId,
    workspaceId,
    entries: normalizeImageMapEntries(imageMapRoot.entries),
    metadataUpdatedAt: readString(imageMapRoot.metadata_updated_at),
    asset: assetRoot
      ? {
        id: readString(assetRoot.id) ?? "",
        path: "assets/image-map/image-map.v1.json",
        assetKind: "image_map_json",
        status: "ready",
        storageBucket: readString(assetRoot.storage_bucket) ?? "",
        storageKey: readString(assetRoot.storage_key) ?? "",
        entryCount,
        updatedAt: readString(assetRoot.updated_at) ?? "",
        supersedesAssetId: readString(assetRoot.supersedes_asset_id),
      }
      : null,
  };
}

async function readLatestImageMap(workpieceId: string): Promise<WorkpieceImageMapView | undefined> {
  const result = await getWorkpieceImageMap(workpieceId);
  return result.ok ? result.imageMap : undefined;
}

export async function getWorkpieceImageMap(workpieceId: string): Promise<GetWorkpieceImageMapResult> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/image-map`, {
    method: "GET",
  });
  const body = await readBodyAsJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: "request_failed",
    };
  }

  const imageMap = normalizeWorkpieceImageMapView(body);
  if (!imageMap) {
    return {
      ok: false,
      status: response.status,
      reason: "invalid_response",
    };
  }

  return { ok: true, imageMap };
}

export async function saveWorkpieceImageMap(args: {
  workpieceId: string;
  workspaceId: string;
  entries: EpisodeImageMapEntry[];
  expectedMetadataUpdatedAt?: string | null;
}): Promise<SaveWorkpieceImageMapResult> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/image-map`, {
    method: "PUT",
    json: {
      workspace_id: args.workspaceId,
      entries: args.entries,
      ...(typeof args.expectedMetadataUpdatedAt !== "undefined"
        ? { expected_metadata_updated_at: args.expectedMetadataUpdatedAt }
        : {}),
    },
  });
  const body = await readBodyAsJson(response);

  if (response.status === 409) {
    const latest = await readLatestImageMap(args.workpieceId);
    return {
      ok: false,
      status: 409,
      reason: "conflict",
      ...(latest ? { latest } : {}),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      reason: "request_failed",
    };
  }

  const imageMap = normalizeWorkpieceImageMapView(body);
  if (!imageMap) {
    return {
      ok: false,
      status: response.status,
      reason: "invalid_response",
    };
  }

  return { ok: true, imageMap };
}
