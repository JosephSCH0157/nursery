export type HammerBackgroundEffectKind =
  | "blur"
  | "wash"
  | "replacement_solid"
  | "replacement_image";

export type HammerCanonicalBackgroundAssetAuthority = Readonly<{
  canonical_asset_id: string;
  canonical_content_hash: string;
  workspace_id: string;
  workpiece_id: string;
  asset_kind: string;
  readiness: "ready";
  asset_path?: string | null;
}>;

export type HammerBackgroundEffectQualityMode =
  | "low"
  | "medium"
  | "high";

export type HammerBackgroundEffectFallbackMode =
  | "disable"
  | "passthrough";

export type HammerBackgroundEffectCommonSettingsV1 = {
  edge_feather_px: number;
  subject_expansion_px: number;
  temporal_smoothing: number; // 0..1
  quality_mode: HammerBackgroundEffectQualityMode;
  fallback_mode: HammerBackgroundEffectFallbackMode;
};

export type HammerBackgroundBlurEffectSettingsV1 = HammerBackgroundEffectCommonSettingsV1 & {
  blur_px: number;
};

export type HammerBackgroundWashEffectSettingsV1 = HammerBackgroundEffectCommonSettingsV1 & {
  dim_amount: number; // 0..1
  desaturate_amount: number; // 0..1
};

export type HammerBackgroundReplacementSolidEffectSettingsV1 = HammerBackgroundEffectCommonSettingsV1 & {
  replacement_color: string;
};

export type HammerBackgroundReplacementImageEffectSettingsV1 = HammerBackgroundEffectCommonSettingsV1 & {
  replacement_asset: HammerCanonicalBackgroundAssetAuthority;
  fit: "cover" | "contain";
};

export type HammerBackgroundEffectSettingsV1 =
  | HammerBackgroundBlurEffectSettingsV1
  | HammerBackgroundWashEffectSettingsV1
  | HammerBackgroundReplacementSolidEffectSettingsV1
  | HammerBackgroundReplacementImageEffectSettingsV1;

export type HammerExportSegmentationAuthority = Readonly<{
  provider_id: "mediapipe_tasks_image_segmenter";
  provider_version: string;
  model_id: "mediapipe_selfie_segmentation_landscape" | "mediapipe_selfie_segmentation_general";
  model_sha256: string;
  model_license: "Apache-2.0";
  runtime_image: string;
  runtime_version: string;
  ffmpeg_version: string;
  refinement_version: string;
  confidence_threshold: number;
  failure_policy: "fail_closed";
  frame_policy: Readonly<{
    fps: number;
    timestamp_mode: "monotonic_milliseconds";
    reset_on_cut: true;
    reset_on_source_change: true;
    reset_on_dimension_change: true;
  }>;
}>;

export type HammerSegmentationProviderCapabilities = {
  preview_safe: boolean;
  export_safe: boolean;
  supports_frame_source: boolean;
  max_recommended_pixels?: number;
  notes?: string[];
};

export type HammerBackgroundEffectsExportPolicyV1 = {
  version: "v1";
  fps: number;
  width: number;
  height: number;
  matte_resolution_strategy: "full" | "half" | "quarter";
  confidence_thresholds: {
    minimum_score: number; // 0..1
  };
  degraded_behavior: "disable" | "passthrough" | "fail";
  temporal_smoothing_policy: {
    enabled: boolean;
    reset_on_seek: boolean;
    reset_on_dimension_change: boolean;
  };
  recompute_required: true;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
  }
  return null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeQualityMode(value: unknown): HammerBackgroundEffectQualityMode {
  const mode = readString(value);
  return mode === "low" || mode === "high" ? mode : "medium";
}

function normalizeFallbackMode(value: unknown): HammerBackgroundEffectFallbackMode {
  const mode = readString(value);
  return mode === "passthrough" ? "passthrough" : "disable";
}

function normalizeCommonSettingsV1(value: unknown): HammerBackgroundEffectCommonSettingsV1 | null {
  const row = readObject(value);
  if (!row) return null;
  const edgeFeatherPx = clamp(readNumber(row.edge_feather_px) ?? 0, 0, 64);
  const subjectExpansionPx = clamp(readNumber(row.subject_expansion_px) ?? 0, 0, 64);
  const temporalSmoothing = clamp(readNumber(row.temporal_smoothing) ?? 0, 0, 1);
  const qualityMode = normalizeQualityMode(row.quality_mode);
  const fallbackMode = normalizeFallbackMode(row.fallback_mode);
  return {
    edge_feather_px: edgeFeatherPx,
    subject_expansion_px: subjectExpansionPx,
    temporal_smoothing: temporalSmoothing,
    quality_mode: qualityMode,
    fallback_mode: fallbackMode,
  };
}

export function normalizeHammerBackgroundEffectSettingsV1(args: {
  effect_kind: HammerBackgroundEffectKind;
  value: unknown;
}): HammerBackgroundEffectSettingsV1 | null {
  const common = normalizeCommonSettingsV1(args.value) ?? {
    edge_feather_px: 0,
    subject_expansion_px: 0,
    temporal_smoothing: 0,
    quality_mode: "medium" as const,
    fallback_mode: "disable" as const,
  };
  const row = readObject(args.value) ?? {};
  switch (args.effect_kind) {
    case "blur": {
      const blurPx = clamp(readNumber(row.blur_px) ?? 8, 0, 64);
      return { ...common, blur_px: blurPx };
    }
    case "wash": {
      const dim = clamp(readNumber(row.dim_amount) ?? 0.25, 0, 1);
      const desat = clamp(readNumber(row.desaturate_amount) ?? 0.15, 0, 1);
      return { ...common, dim_amount: dim, desaturate_amount: desat };
    }
    case "replacement_solid": {
      const color = readString(row.replacement_color) ?? "#d0d0d0";
      return { ...common, replacement_color: color };
    }
    case "replacement_image": {
      const asset = readObject(row.replacement_asset);
      const id = readString(asset?.canonical_asset_id);
      const hash = readString(asset?.canonical_content_hash);
      const workspaceId = readString(asset?.workspace_id);
      const workpieceId = readString(asset?.workpiece_id);
      const assetKind = readString(asset?.asset_kind);
      const readiness = readString(asset?.readiness);
      if (!id || !hash || !/^[0-9a-f]{64}$/.test(hash) || !workspaceId || !workpieceId || readiness !== "ready" || !assetKind) return null;
      return {
        ...common,
        replacement_asset: {
          canonical_asset_id: id,
          canonical_content_hash: hash,
          workspace_id: workspaceId,
          workpiece_id: workpieceId,
          asset_kind: assetKind as HammerCanonicalBackgroundAssetAuthority["asset_kind"],
          readiness: "ready",
          asset_path: readString(asset?.asset_path),
        },
        fit: readString(row.fit) === "contain" ? "contain" : "cover",
      };
    }
    default: {
      const exhaustive: never = args.effect_kind;
      return exhaustive;
    }
  }
}

export function cloneHammerBackgroundEffectSettingsV1(args: {
  effect_kind: HammerBackgroundEffectKind;
  value: HammerBackgroundEffectSettingsV1 | null | undefined;
}): HammerBackgroundEffectSettingsV1 | null {
  return normalizeHammerBackgroundEffectSettingsV1({ effect_kind: args.effect_kind, value: args.value });
}

export function normalizeHammerBackgroundEffectsExportPolicyV1(
  value: unknown,
): HammerBackgroundEffectsExportPolicyV1 | null {
  const row = readObject(value);
  if (!row || readString(row.version) !== "v1") return null;
  const fps = clamp(readNumber(row.fps) ?? 30, 1, 120);
  const width = clamp(readNumber(row.width) ?? 1280, 1, 10000);
  const height = clamp(readNumber(row.height) ?? 720, 1, 10000);
  const matteStrategy = readString(row.matte_resolution_strategy);
  const matte_resolution_strategy = matteStrategy === "quarter" || matteStrategy === "half" ? matteStrategy : "full";
  const confidenceRow = readObject(row.confidence_thresholds) ?? {};
  const minimumScore = clamp(readNumber(confidenceRow.minimum_score) ?? 0.35, 0, 1);
  const degradedBehaviorRaw = readString(row.degraded_behavior);
  const degraded_behavior = degradedBehaviorRaw === "passthrough" || degradedBehaviorRaw === "fail" ? degradedBehaviorRaw : "disable";
  const temporalRow = readObject(row.temporal_smoothing_policy) ?? {};
  const enabled = readBoolean(temporalRow.enabled) ?? true;
  const resetOnSeek = readBoolean(temporalRow.reset_on_seek) ?? true;
  const resetOnDimensionChange = readBoolean(temporalRow.reset_on_dimension_change) ?? true;
  return {
    version: "v1",
    fps,
    width,
    height,
    matte_resolution_strategy,
    confidence_thresholds: {
      minimum_score: minimumScore,
    },
    degraded_behavior,
    temporal_smoothing_policy: {
      enabled,
      reset_on_seek: resetOnSeek,
      reset_on_dimension_change: resetOnDimensionChange,
    },
    recompute_required: true,
  };
}

