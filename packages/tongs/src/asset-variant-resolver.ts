export type ForgeAssetVariantKind = "original" | "preview" | "thumb";
export type ForgeAssetVariantPurpose = "list" | "preview" | "export";

export type ForgeAssetVariantRow = {
  id: string;
  workpiece_id: string;
  source_asset_id: string | null;
  variant_kind: ForgeAssetVariantKind;
  variant_version: number;
  path: string;
  storage_key: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  cache_control: string | null;
  mime_type: string | null;
  status: string | null;
};

export type ForgeResolvedAssetVariant = {
  asset_id: string;
  variant_kind: ForgeAssetVariantKind;
  variant_version: number;
  path: string;
  storage_key: string;
  bytes: number | null;
  width: number | null;
  height: number | null;
  cache_control: string | null;
  mime_type: string | null;
  identity_key: string;
  public_url_path: string;
  purpose: ForgeAssetVariantPurpose;
  requested_variant_kind: ForgeAssetVariantKind;
  fallback_used: boolean;
};

export type ForgeVariantResolutionStatus =
  | "resolved"
  | "missing_variant"
  | "variant_not_allowed"
  | "variant_too_large";

export type ForgeAssetVariantResolution = {
  status: ForgeVariantResolutionStatus;
  resolved: ForgeResolvedAssetVariant | null;
  message: string;
};

type VariantLimits = {
  maxWidth: number;
  targetBytes: number;
  hardMaxBytes: number;
};

export const PREVIEW_LIMITS: VariantLimits = {
  maxWidth: 1280,
  targetBytes: 300 * 1024,
  hardMaxBytes: 500 * 1024,
};

export const THUMB_LIMITS: VariantLimits = {
  maxWidth: 320,
  targetBytes: 100 * 1024,
  hardMaxBytes: 100 * 1024,
};

function toRequestedVariantKind(purpose: ForgeAssetVariantPurpose): ForgeAssetVariantKind {
  if (purpose === "list") return "thumb";
  if (purpose === "preview") return "preview";
  return "original";
}

function isReady(row: ForgeAssetVariantRow): boolean {
  return (row.status ?? "ready") === "ready";
}

function isWithinLimit(row: ForgeAssetVariantRow, limits: VariantLimits): boolean {
  const width = typeof row.width === "number" && Number.isFinite(row.width) ? row.width : null;
  const bytes = typeof row.bytes === "number" && Number.isFinite(row.bytes) ? row.bytes : null;
  if (width != null && width > limits.maxWidth) return false;
  if (bytes != null && bytes > limits.hardMaxBytes) return false;
  return true;
}

export function buildForgeAssetIdentityKey(args: {
  workpiece_id: string;
  asset_id: string;
  variant_kind: ForgeAssetVariantKind;
  variant_version: number;
}): string {
  return `${args.workpiece_id}:${args.asset_id}:${args.variant_kind}:v${args.variant_version}`;
}

export function buildForgeCanonicalVariantPublicPath(args: {
  workpiece_id: string;
  asset_id: string;
  variant_kind: ForgeAssetVariantKind;
  variant_version: number;
  extension: string;
}): string {
  const extension = args.extension.trim().replace(/^\./, "").toLowerCase() || "bin";
  return `/storage/episode-media/${encodeURIComponent(args.workpiece_id)}/${encodeURIComponent(args.asset_id)}/${args.variant_kind}_v${args.variant_version}.${extension}`;
}

function inferExtension(path: string, mimeType: string | null): string {
  const normalizedPath = path.trim().toLowerCase();
  const match = normalizedPath.match(/\.([a-z0-9]+)$/);
  if (match?.[1]) return match[1];
  if (mimeType?.includes("png")) return "png";
  if (mimeType?.includes("jpeg") || mimeType?.includes("jpg")) return "jpg";
  if (mimeType?.includes("webp")) return "webp";
  if (mimeType?.includes("gif")) return "gif";
  return "bin";
}

function toResolved(args: {
  row: ForgeAssetVariantRow;
  purpose: ForgeAssetVariantPurpose;
  requestedVariantKind: ForgeAssetVariantKind;
  fallbackUsed: boolean;
}): ForgeResolvedAssetVariant {
  const extension = inferExtension(args.row.path, args.row.mime_type);
  return {
    asset_id: args.row.id,
    variant_kind: args.row.variant_kind,
    variant_version: args.row.variant_version,
    path: args.row.path,
    storage_key: args.row.storage_key,
    bytes: args.row.bytes,
    width: args.row.width,
    height: args.row.height,
    cache_control: args.row.cache_control,
    mime_type: args.row.mime_type,
    identity_key: buildForgeAssetIdentityKey({
      workpiece_id: args.row.workpiece_id,
      asset_id: args.row.id,
      variant_kind: args.row.variant_kind,
      variant_version: args.row.variant_version,
    }),
    public_url_path: buildForgeCanonicalVariantPublicPath({
      workpiece_id: args.row.workpiece_id,
      asset_id: args.row.id,
      variant_kind: args.row.variant_kind,
      variant_version: args.row.variant_version,
      extension,
    }),
    purpose: args.purpose,
    requested_variant_kind: args.requestedVariantKind,
    fallback_used: args.fallbackUsed,
  };
}

export function resolveForgeAssetVariant(args: {
  purpose: ForgeAssetVariantPurpose;
  originalAsset: ForgeAssetVariantRow;
  variants: readonly ForgeAssetVariantRow[];
}): ForgeAssetVariantResolution {
  const requestedVariantKind = toRequestedVariantKind(args.purpose);
  const readyVariants = args.variants.filter(isReady);
  const previewCandidate = readyVariants.find((row) => row.variant_kind === "preview") ?? null;
  const thumbCandidate = readyVariants.find((row) => row.variant_kind === "thumb") ?? null;

  if (args.purpose === "export") {
    if (!isReady(args.originalAsset)) {
      return {
        status: "missing_variant",
        resolved: null,
        message: "Original export asset is not available.",
      };
    }
    return {
      status: "resolved",
      resolved: toResolved({
        row: args.originalAsset,
        purpose: args.purpose,
        requestedVariantKind,
        fallbackUsed: false,
      }),
      message: "Resolved original export asset.",
    };
  }

  if (args.purpose === "list") {
    if (!thumbCandidate) {
      return {
        status: "missing_variant",
        resolved: null,
        message: "Thumb variant is required for list surfaces.",
      };
    }
    if (!isWithinLimit(thumbCandidate, THUMB_LIMITS)) {
      return {
        status: "variant_too_large",
        resolved: null,
        message: "Thumb variant exceeds list-surface size contract.",
      };
    }
    return {
      status: "resolved",
      resolved: toResolved({
        row: thumbCandidate,
        purpose: args.purpose,
        requestedVariantKind,
        fallbackUsed: false,
      }),
      message: "Resolved thumb list variant.",
    };
  }

  // Preview resolution: preview preferred, thumb fallback allowed, original fallback forbidden.
  if (previewCandidate) {
    if (!isWithinLimit(previewCandidate, PREVIEW_LIMITS)) {
      return {
        status: "variant_too_large",
        resolved: null,
        message: "Preview variant exceeds preview size contract.",
      };
    }
    return {
      status: "resolved",
      resolved: toResolved({
        row: previewCandidate,
        purpose: args.purpose,
        requestedVariantKind,
        fallbackUsed: false,
      }),
      message: "Resolved preview variant.",
    };
  }

  if (thumbCandidate) {
    if (!isWithinLimit(thumbCandidate, THUMB_LIMITS)) {
      return {
        status: "variant_too_large",
        resolved: null,
        message: "Thumb fallback exceeds list-size contract.",
      };
    }
    return {
      status: "resolved",
      resolved: toResolved({
        row: thumbCandidate,
        purpose: args.purpose,
        requestedVariantKind,
        fallbackUsed: true,
      }),
      message: "Resolved thumb fallback for preview.",
    };
  }

  return {
    status: "missing_variant",
    resolved: null,
    message: "Preview variant is missing and original fallback is forbidden.",
  };
}
