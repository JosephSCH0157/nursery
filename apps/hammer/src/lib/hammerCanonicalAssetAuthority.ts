import {
  normalizeCanonicalAssetAuthority,
  type CanonicalAssetAuthority,
  type CanonicalAssetId,
} from "@forge/tongs/canonical-asset-authority";
import { tongsFetch } from "./tongsFetch";

export type HammerLegacyVisualReferenceClassification =
  | { state: "canonical_claimed"; canonicalAssetId: CanonicalAssetId }
  | { state: "legacy_unresolved"; legacyAssetId: string | null; path: string | null; storageKey: string | null; reason: string }
  | { state: "conflicting_evidence"; canonicalAssetId: CanonicalAssetId; reason: string };

const text = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

export function classifyLegacyHammerVisualReference(input: {
  canonicalAssetId?: string | null;
  assetId?: string | null;
  assetRef?: string | null;
  path?: string | null;
  storageKey?: string | null;
  placementId?: string | null;
}): HammerLegacyVisualReferenceClassification {
  const canonicalAssetId = text(input.canonicalAssetId);
  const legacyAssetId = text(input.assetId);
  if (canonicalAssetId) {
    if (legacyAssetId && legacyAssetId !== canonicalAssetId) {
      return { state: "conflicting_evidence", canonicalAssetId: canonicalAssetId as CanonicalAssetId, reason: "canonical_and_legacy_ids_disagree" };
    }
    return { state: "canonical_claimed", canonicalAssetId: canonicalAssetId as CanonicalAssetId };
  }
  return {
    state: "legacy_unresolved",
    legacyAssetId,
    path: text(input.path) ?? text(input.assetRef),
    storageKey: text(input.storageKey),
    reason: legacyAssetId ? "legacy_id_has_no_canonical_evidence" : "locator_cannot_establish_identity",
  };
}

export async function resolveHammerCanonicalAssetAuthority(args: {
  workspaceId: string;
  workpieceId: string;
  canonicalAssetId: CanonicalAssetId;
  requiredAssetKind?: string | null;
  expectedContentHash?: string | null;
  expectedPath?: string | null;
}): Promise<CanonicalAssetAuthority> {
  const response = await tongsFetch(
    `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/assets/${encodeURIComponent(args.canonicalAssetId)}/resolve-authority`,
    { method: "POST", json: {
      expected_workpiece_id: args.workpieceId,
      required_asset_kind: args.requiredAssetKind ?? null,
      expected_content_hash: args.expectedContentHash ?? null,
      expected_path: args.expectedPath ?? null,
    } },
  );
  const body = await response.json().catch(() => null) as { data?: { authority?: unknown }; error?: { message?: unknown } } | null;
  const authority = normalizeCanonicalAssetAuthority(body?.data?.authority);
  if (!response.ok || !authority) throw new Error(typeof body?.error?.message === "string" ? body.error.message : "Tongs canonical asset authority could not be resolved.");
  return authority;
}

export async function requireReadyHammerCanonicalAssetAuthority(args: Parameters<typeof resolveHammerCanonicalAssetAuthority>[0]): Promise<CanonicalAssetAuthority> {
  const authority = await resolveHammerCanonicalAssetAuthority(args);
  if (authority.state !== "ready") throw new Error(`Canonical asset is not ready for Hammer placement (${authority.state}).`);
  return authority;
}
