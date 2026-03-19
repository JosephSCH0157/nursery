import type { HammerPersistedVisualPlacements, HammerVisualPlacementRecord } from "../persistence/hammerPersistenceContract";
import { tongsFetch } from "./tongsFetch";
import {
  HAMMER_PREVIEW_PLACEMENT_DEFAULTS,
  resolveActiveHammerVisualAtTime,
  type HammerVisualApprovalState,
  type PreviewPlacementDefaults,
} from "./hammerVisualPreviewRules";

export type HammerPreviewVisualState =
  | {
    kind: "empty";
    ingestState: null;
    imageAssetId?: undefined;
    imageUrl?: undefined;
    imagePath?: undefined;
    entryId?: undefined;
    placement?: undefined;
    reason: "none";
  }
  | {
    kind: "image";
    ingestState: HammerVisualApprovalState;
    imageAssetId: string;
    imageUrl: string | null;
    imagePath: string | null;
    entryId: string;
    placement: PreviewPlacementDefaults;
    reason: "active_match" | "held_previous";
  };

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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

function inferImageMimeType(path: string | null | undefined): string {
  const normalized = readString(path)?.toLowerCase() ?? "";
  if (normalized.endsWith(".jpg") || normalized.endsWith(".jpeg")) return "image/jpeg";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  return "image/png";
}

export function getHammerPreviewVisualAssetRef(placement: HammerVisualPlacementRecord): string {
  return placement.asset_path ?? placement.storage_key ?? placement.asset_id ?? placement.asset_ref;
}

function filterPreviewablePlacements(
  visualPlacements: HammerPersistedVisualPlacements | null | undefined,
  ignoredAssetRefs: ReadonlySet<string>,
): HammerPersistedVisualPlacements | null {
  if (!visualPlacements) return null;
  return {
    ...visualPlacements,
    source_refs: [...visualPlacements.source_refs],
    uncertainty_flags: [...visualPlacements.uncertainty_flags],
    placements: visualPlacements.placements
      .filter((placement) => !ignoredAssetRefs.has(getHammerPreviewVisualAssetRef(placement)))
      .map((placement) => ({
        ...placement,
        matched_segment_ids: [...placement.matched_segment_ids],
        uncertainty_flags: [...placement.uncertainty_flags],
      })),
  };
}

export function buildHammerPreviewVisualState(args: {
  visualPlacements: HammerPersistedVisualPlacements | null | undefined;
  timeSec: number;
  resolvedAssetUrlsByRef?: ReadonlyMap<string, string>;
  ignoredAssetRefs?: ReadonlySet<string>;
}): HammerPreviewVisualState {
  const ignoredAssetRefs = args.ignoredAssetRefs ?? new Set<string>();
  const filteredPlacements = filterPreviewablePlacements(args.visualPlacements, ignoredAssetRefs);
  const resolved = resolveActiveHammerVisualAtTime({
    visualPlacements: filteredPlacements,
    timeSec: args.timeSec,
  });

  if (!resolved.visual) {
    return {
      kind: "empty",
      ingestState: null,
      reason: "none",
    };
  }

  const assetRef = getHammerPreviewVisualAssetRef(resolved.visual);
  const imageUrl = args.resolvedAssetUrlsByRef?.get(assetRef) ?? null;
  const reason = resolved.reason === "held_previous" ? "held_previous" : "active_match";
  return {
    kind: "image",
    ingestState: resolved.approval_state ?? "suggested",
    imageAssetId: resolved.visual.asset_id ?? resolved.visual.asset_ref,
    imageUrl,
    imagePath: resolved.visual.asset_path ?? null,
    entryId: resolved.visual.entry_id,
    placement: resolved.defaults ?? HAMMER_PREVIEW_PLACEMENT_DEFAULTS,
    reason,
  };
}

export async function loadHammerPreviewAssetDataUrl(args: {
  workpieceId: string;
  path: string | null | undefined;
}): Promise<
  | { ok: true; dataUrl: string; path: string }
  | { ok: false; error: string }
> {
  const path = readString(args.path);
  if (!path) {
    return { ok: false, error: "Preview image path is missing." };
  }

  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(path)}&encoding=base64`,
    { method: "GET" },
  );
  if (!response.ok) {
    return { ok: false, error: "Preview image is not available yet." };
  }

  const body = await readBodyAsJson(response);
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return { ok: false, error: "Preview image response was invalid." };
  }
  const bytesBase64 = readString(body.data.bytes_base64);
  if (!bytesBase64) {
    return { ok: false, error: "Preview image is empty." };
  }
  const contentType = readString(body.data.content_type) ?? inferImageMimeType(path);
  return {
    ok: true,
    dataUrl: `data:${contentType};base64,${bytesBase64}`,
    path,
  };
}
