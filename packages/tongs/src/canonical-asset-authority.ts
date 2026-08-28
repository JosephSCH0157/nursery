export type CanonicalAssetId = string & { readonly __brand: "CanonicalAssetId" };
export type HammerTimelineAssetId = string & { readonly __brand: "HammerTimelineAssetId" };
export type ScriptDerivativeId = string & { readonly __brand: "ScriptDerivativeId" };
export type LegacyDerivedAssetId = string & { readonly __brand: "LegacyDerivedAssetId" };
export type StorageObjectKey = string & { readonly __brand: "StorageObjectKey" };
export type MediaContentHash = string & { readonly __brand: "MediaContentHash" };

export type CanonicalAssetScope =
  | { kind: "workpiece"; workpieceId: string; workspaceReusePolicy: "not_applicable" }
  | { kind: "workspace"; workpieceId: null; workspaceReusePolicy: "allowed" | "restricted" };

export type CanonicalAssetProvenanceClassification =
  | "canonical_native"
  | "legacy_resolved"
  | "legacy_unresolved"
  | "conflicting_evidence";

export type CanonicalAssetErrorCode =
  | "canonical_asset_missing"
  | "canonical_asset_workspace_mismatch"
  | "canonical_asset_workpiece_mismatch"
  | "canonical_asset_workspace_reuse_not_allowed"
  | "canonical_asset_kind_mismatch"
  | "canonical_asset_hash_mismatch"
  | "canonical_asset_storage_evidence_mismatch"
  | "canonical_asset_not_ready"
  | "canonical_asset_evidence_incomplete"
  | "canonical_asset_intrinsic_metadata_missing"
  | "canonical_asset_conflicting_evidence"
  | "legacy_asset_unresolved"
  | "asset_relationship_unverified";

export type CanonicalAssetReadiness =
  | { state: "ready"; code: null }
  | { state: "processing"; code: null }
  | { state: "unresolved"; code: CanonicalAssetErrorCode }
  | { state: "invalid"; code: CanonicalAssetErrorCode }
  | { state: "relationship_mismatch"; code: CanonicalAssetErrorCode };

export type CanonicalAssetAuthority = CanonicalAssetReadiness & {
  canonicalAssetId: CanonicalAssetId;
  workspaceId?: string;
  scope?: CanonicalAssetScope;
  assetKind?: string;
  contentHash?: MediaContentHash;
  storageBucket?: string;
  storageObjectKey?: StorageObjectKey;
  path?: string;
  mimeType?: string;
  bytes?: number;
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  durationMs?: number;
  assetStatus?: string;
  provenanceClassification?: CanonicalAssetProvenanceClassification;
  provenance?: Record<string, unknown>;
  readyAt?: string;
};

export type ResolveCanonicalAssetAuthorityRequest = {
  workspaceId: string;
  canonicalAssetId: CanonicalAssetId;
  expectedWorkpieceId?: string | null;
  requiredAssetKind?: string | null;
  expectedContentHash?: MediaContentHash | null;
  expectedStorageBucket?: string | null;
  expectedStorageObjectKey?: StorageObjectKey | null;
  expectedPath?: string | null;
};

export type ScriptDerivativeBasis = {
  workspaceId: string;
  workpieceId: string;
  scriptApprovalId: string;
  scriptApprovalRevision: number;
  scriptContentHash: MediaContentHash;
};

export type ScriptDerivativeAssetReference = {
  derivativeId: ScriptDerivativeId;
  derivativeBasis: ScriptDerivativeBasis;
  canonicalAssetId: CanonicalAssetId;
  expectedContentHash: MediaContentHash;
  readiness: CanonicalAssetReadiness;
};

export type HammerVisualPlacementAuthority = {
  placementId: HammerTimelineAssetId;
  canonicalAssetId: CanonicalAssetId | null;
  unresolvedLegacyAssetId?: LegacyDerivedAssetId;
  derivativeBasis?: ScriptDerivativeBasis;
  sourceDerivativeId?: ScriptDerivativeId;
  assetReadiness: CanonicalAssetReadiness;
  timelineStart: number;
  timelineEnd: number;
  laneId: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeCanonicalAssetAuthority(value: unknown): CanonicalAssetAuthority | null {
  const row = record(value);
  const state = string(row?.state);
  const canonicalAssetId = string(row?.canonical_asset_id);
  const rawCode = string(row?.code);
  if (!row || !canonicalAssetId || !state || !["ready", "processing", "unresolved", "invalid", "relationship_mismatch"].includes(state)) return null;
  if ((state === "ready" || state === "processing") && rawCode) return null;
  if (state !== "ready" && state !== "processing" && !rawCode) return null;

  const scopeRow = record(row.scope);
  const scopeKind = string(scopeRow?.kind);
  const workpieceId = string(scopeRow?.workpiece_id);
  const reusePolicy = string(scopeRow?.workspace_reuse_policy);
  const scope: CanonicalAssetScope | undefined = scopeKind === "workpiece" && workpieceId && reusePolicy === "not_applicable"
    ? { kind: "workpiece", workpieceId, workspaceReusePolicy: "not_applicable" }
    : scopeKind === "workspace" && !workpieceId && (reusePolicy === "allowed" || reusePolicy === "restricted")
      ? { kind: "workspace", workpieceId: null, workspaceReusePolicy: reusePolicy }
      : undefined;
  const provenance = record(row.provenance);
  return {
    state: state as CanonicalAssetAuthority["state"],
    code: rawCode as CanonicalAssetAuthority["code"],
    canonicalAssetId: canonicalAssetId as CanonicalAssetId,
    ...(string(row.workspace_id) ? { workspaceId: string(row.workspace_id)! } : {}),
    ...(scope ? { scope } : {}),
    ...(string(row.asset_kind) ? { assetKind: string(row.asset_kind)! } : {}),
    ...(string(row.content_hash) ? { contentHash: string(row.content_hash)! as MediaContentHash } : {}),
    ...(string(row.storage_bucket) ? { storageBucket: string(row.storage_bucket)! } : {}),
    ...(string(row.storage_object_key) ? { storageObjectKey: string(row.storage_object_key)! as StorageObjectKey } : {}),
    ...(string(row.path) ? { path: string(row.path)! } : {}),
    ...(string(row.mime_type) ? { mimeType: string(row.mime_type)! } : {}),
    ...(number(row.bytes) != null ? { bytes: number(row.bytes)! } : {}),
    ...(number(row.intrinsic_width) != null ? { intrinsicWidth: number(row.intrinsic_width)! } : {}),
    ...(number(row.intrinsic_height) != null ? { intrinsicHeight: number(row.intrinsic_height)! } : {}),
    ...(number(row.duration_ms) != null ? { durationMs: number(row.duration_ms)! } : {}),
    ...(string(row.asset_status) ? { assetStatus: string(row.asset_status)! } : {}),
    ...(string(row.provenance_classification) ? { provenanceClassification: string(row.provenance_classification)! as CanonicalAssetProvenanceClassification } : {}),
    ...(provenance ? { provenance } : {}),
    ...(string(row.ready_at) ? { readyAt: string(row.ready_at)! } : {}),
  } as CanonicalAssetAuthority;
}
