import type { HammerQuenchReleasePacketManifest } from "./hammer-release-packet.types";

export const QUENCH_CANONICAL_RELEASE_PROJECTION_VERSION = "forge.quench-release-projection.v2" as const;

export type QuenchCanonicalCandidate = {
  id: string; candidate_ordinal: number; recipe_id: string; recipe_revision: number; recipe_hash: string;
  composite_asset_id: string; composite_content_hash: string; candidate_binding_id: string; candidate_binding_revision: number;
  readability_evidence_hash: string; eligibility_state: "current"|"historical_brand"|"requires_reapproval"|"approved_historical_brand"|"blocked";
};

export type QuenchCanonicalReleaseProjection = {
  contract_version: typeof QUENCH_CANONICAL_RELEASE_PROJECTION_VERSION; workspace_id: string; workpiece_id: string;
  hammer: { manifest_snapshot_id:string; manifest_path:string; manifest_version:1; manifest_content_hash:string; manifest:HammerQuenchReleasePacketManifest; readiness:HammerQuenchReleasePacketManifest["readiness"] };
  metadata: { revision:number; content_hash:string; episode:Record<string,unknown> };
  thumbnails: { candidate_set:Record<string,unknown>|null; active_binding_id:string|null; active_binding_revision:number|null; candidates:QuenchCanonicalCandidate[] };
  destination_capabilities:Array<Record<string,unknown>>; current_decisions:Array<Record<string,unknown>>; projected_at:string;
};

export function isQuenchCanonicalReleaseProjection(value:unknown):value is QuenchCanonicalReleaseProjection{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;const row=value as Record<string,unknown>;
  return row.contract_version===QUENCH_CANONICAL_RELEASE_PROJECTION_VERSION&&typeof row.workspace_id==="string"&&typeof row.workpiece_id==="string"&&!!row.hammer&&typeof row.hammer==="object"&&!!row.metadata&&typeof row.metadata==="object"&&!!row.thumbnails&&typeof row.thumbnails==="object";
}
