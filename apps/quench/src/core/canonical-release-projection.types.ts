import type { HammerQuenchReleasePacketManifest } from "./hammer-release-packet.types";

export const QUENCH_CANONICAL_RELEASE_PROJECTION_VERSION = "forge.quench-release-projection.v2" as const;
export const QUENCH_OPEN_AUTHORITY_VERSION = "forge.quench-open-authority.v1" as const;

export type QuenchCanonicalCandidate = {
  id: string; candidate_ordinal: number; recipe_id: string; recipe_revision: number; recipe_hash: string;
  title_revision_id?:string;concept_revision_id?:string;base_artwork_content_hash?:string;structural_composition_fingerprint?:string;
  composite_asset_id: string; composite_content_hash: string; candidate_binding_id: string; candidate_binding_revision: number;
  style_source?: "brand_profile"|"forge_standard"; style_provenance_hash?: string;
  readability_evidence_hash: string; eligibility_state: "current"|"historical_brand"|"requires_reapproval"|"approved_historical_brand"|"blocked";
  authority_verified:boolean;verification_code:string;asset_path?:string;asset_mime_type?:string;asset_bytes?:number;
};
export type QuenchDestinationCapability={id:string;platform:string;adapter_id:string;execution_context:string;state:string;current_capability_revision_id:string;current_capability?:{id:string;revision:number;contract_version:string;content_hash:string;adapter_version:string;capabilities_json:{supports_experiment_intent?:boolean;supports_thumbnail_selection?:boolean;supports_thumbnail_rotation?:boolean}}|null};
export type QuenchReleaseDecisionProjection={workspace_id:string;workpiece_id:string;destination_scope_id:string;current_decision_id:string|null;current_revision:number;decision?:Record<string,unknown>|null;assignments?:Array<Record<string,unknown>>;recent_history?:Array<Record<string,unknown>>;applicability?:{state:"current"|"requires_review"|"blocked"|"superseded";record_posture:string;reason_codes:string[]}};

export type QuenchCanonicalReleaseProjection = {
  contract_version: typeof QUENCH_CANONICAL_RELEASE_PROJECTION_VERSION; workspace_id: string; workpiece_id: string;
  hammer: { manifest_snapshot_id:string; manifest_path:string; manifest_version:1; manifest_content_hash:string; manifest:HammerQuenchReleasePacketManifest; readiness:HammerQuenchReleasePacketManifest["readiness"] };
  metadata: { revision:number; content_hash:string; episode:Record<string,unknown> };
  thumbnails: { candidate_set:Record<string,unknown>|null; active_binding_id:string|null; active_binding_revision:number|null; candidates:QuenchCanonicalCandidate[]; historical_candidate_sets?:Array<{candidate_set:Record<string,unknown>;candidates:QuenchCanonicalCandidate[]}> };
  destination_capabilities:QuenchDestinationCapability[]; current_decisions:QuenchReleaseDecisionProjection[]; projected_at:string;
};

export type QuenchOpenAuthority = {
  contract_version: typeof QUENCH_OPEN_AUTHORITY_VERSION;
  open_authority_id:string;open_operation_id:string;workspace_id:string;workpiece_id:string;
  manifest_snapshot_id:string;manifest_content_hash:string;state_version:number;opened_at:string;
  newer_manifest_available:boolean;review_projection:QuenchCanonicalReleaseProjection;
};

export function getQuenchExperimentCapability(scope:QuenchDestinationCapability|null|undefined){const flags=scope?.current_capability?.capabilities_json;const planning=flags?.supports_experiment_intent===true&&flags?.supports_thumbnail_selection===true;return{planning_supported:planning,rotation_supported:planning&&flags?.supports_thumbnail_rotation===true,reason:flags?.supports_experiment_intent!==true?"experiment_intent_unsupported":flags?.supports_thumbnail_selection!==true?"thumbnail_selection_unsupported":null};}

export function isQuenchCanonicalReleaseProjection(value:unknown):value is QuenchCanonicalReleaseProjection{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;const row=value as Record<string,unknown>;
  return row.contract_version===QUENCH_CANONICAL_RELEASE_PROJECTION_VERSION&&typeof row.workspace_id==="string"&&typeof row.workpiece_id==="string"&&!!row.hammer&&typeof row.hammer==="object"&&!!row.metadata&&typeof row.metadata==="object"&&!!row.thumbnails&&typeof row.thumbnails==="object";
}
export function isQuenchOpenAuthority(value:unknown):value is QuenchOpenAuthority{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;const row=value as Record<string,unknown>;
  return row.contract_version===QUENCH_OPEN_AUTHORITY_VERSION&&typeof row.open_authority_id==="string"&&typeof row.open_operation_id==="string"&&typeof row.workspace_id==="string"&&typeof row.workpiece_id==="string"&&typeof row.manifest_snapshot_id==="string"&&typeof row.manifest_content_hash==="string"&&typeof row.state_version==="number"&&typeof row.newer_manifest_available==="boolean"&&isQuenchCanonicalReleaseProjection(row.review_projection);
}
export function isQuenchCandidateSelectable(candidate:QuenchCanonicalCandidate):boolean{return candidate.authority_verified===true&&(candidate.eligibility_state==="current"||candidate.eligibility_state==="approved_historical_brand");}
