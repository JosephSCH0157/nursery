import type { HammerQuenchReleasePacketManifest } from "./hammer-release-packet.types";

export const QUENCH_CANONICAL_RELEASE_PROJECTION_VERSION = "forge.quench-release-projection.v2" as const;

export type QuenchCanonicalCandidate = {
  id: string; candidate_ordinal: number; recipe_id: string; recipe_revision: number; recipe_hash: string;
  title_revision_id?:string;concept_revision_id?:string;base_artwork_content_hash?:string;structural_composition_fingerprint?:string;
  composite_asset_id: string; composite_content_hash: string; candidate_binding_id: string; candidate_binding_revision: number;
  readability_evidence_hash: string; eligibility_state: "current"|"historical_brand"|"requires_reapproval"|"approved_historical_brand"|"blocked";
  authority_verified:boolean;verification_code:string;asset_path?:string;asset_mime_type?:string;asset_bytes?:number;
};
export type QuenchReleaseDecisionProjection={workspace_id:string;workpiece_id:string;destination_scope_id:string;current_decision_id:string|null;current_revision:number;decision?:Record<string,unknown>|null;assignments?:Array<Record<string,unknown>>;applicability?:{state:"current"|"requires_review"|"blocked"|"superseded";record_posture:string;reason_codes:string[]}};

export type QuenchCanonicalReleaseProjection = {
  contract_version: typeof QUENCH_CANONICAL_RELEASE_PROJECTION_VERSION; workspace_id: string; workpiece_id: string;
  hammer: { manifest_snapshot_id:string; manifest_path:string; manifest_version:1; manifest_content_hash:string; manifest:HammerQuenchReleasePacketManifest; readiness:HammerQuenchReleasePacketManifest["readiness"] };
  metadata: { revision:number; content_hash:string; episode:Record<string,unknown> };
  thumbnails: { candidate_set:Record<string,unknown>|null; active_binding_id:string|null; active_binding_revision:number|null; candidates:QuenchCanonicalCandidate[]; historical_candidate_sets?:Array<{candidate_set:Record<string,unknown>;candidates:QuenchCanonicalCandidate[]}> };
  destination_capabilities:Array<Record<string,unknown>>; current_decisions:QuenchReleaseDecisionProjection[]; projected_at:string;
};

export function isQuenchCanonicalReleaseProjection(value:unknown):value is QuenchCanonicalReleaseProjection{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;const row=value as Record<string,unknown>;
  return row.contract_version===QUENCH_CANONICAL_RELEASE_PROJECTION_VERSION&&typeof row.workspace_id==="string"&&typeof row.workpiece_id==="string"&&!!row.hammer&&typeof row.hammer==="object"&&!!row.metadata&&typeof row.metadata==="object"&&!!row.thumbnails&&typeof row.thumbnails==="object";
}
export function isQuenchCandidateSelectable(candidate:QuenchCanonicalCandidate):boolean{return candidate.authority_verified===true&&(candidate.eligibility_state==="current"||candidate.eligibility_state==="approved_historical_brand");}
