import {
  EPISODE_PACKAGE_V3_SCHEMA,
  canonicalSerialize,
  deterministicUuid,
  deriveThumbnailPromptPack,
  hydrateEpisodePackageV3,
  serializeEpisodePackageV3,
  type EpisodePackageV3,
  type ThumbnailBaseVersion,
  type ThumbnailCompositeSnapshot,
  type ThumbnailPublicationEvent,
  type ThumbnailRenderRecipe,
  type ThumbnailCandidateSetProjection,
  type ThumbnailRequestedStyleSource,
} from "./episode-package-v3";
import { appendLaunchSnapshot, appendPublicationEvent, canReuseLaunchSnapshotForPublish, proveThumbnailMutation, type ThumbnailMutationProof } from "./hearth-thumbnail-v3-authority";
import { resolveForgeUserAccessToken } from "./hearth-chat-api";
import { tongsFetch } from "./tongs-fetch";
import {
  deriveCustomerOperationId,
  readCustomerSpendingQuote,
  requestCustomerSpendingAcceptance,
} from "../../../../packages/tongs/src/customer-spending-confirmation";

type ThumbnailMutationKind = Parameters<typeof proveThumbnailMutation>[0]["kind"];

export type CanonicalEpisodePackageV3 = {
  episodePackage: EpisodePackageV3;
  metadata: Record<string, unknown>;
  metadataUpdatedAt: string | null;
};

export type ThumbnailSaveState = "editing" | "saving" | "saved" | "error";
export type ThumbnailBrandAuthorityStatus = {
  state: "unresolved" | "canonical_branded" | "canonical_unbranded" | "stale_projection" | "verification_blocked";
  binding: Record<string, unknown> | null;
  profile_label: string | null;
  workspace_default_profile_label: string | null;
  workspace_default_profile_id: string | null;
  workspace_default_profile_revision_id: string | null;
  workspace_default_profile_revision: number | null;
  episode_profile_revision: number | null;
  episode_profile_rules: Record<string, unknown> | null;
  message: string;
};

export type ThumbnailBrandSetupState = "pending" | "asset_ready" | "profile_committed" | "binding_committed" | "verified";
export type ThumbnailBrandSetupOperation = Record<string, unknown> & {
  state: ThumbnailBrandSetupState;
  operation_id: string;
  operation_fingerprint?: string;
  failed_stage?: ThumbnailBrandSetupState | null;
  failure_code?: string | null;
  failure_message?: string | null;
};
export type ThumbnailBrandSetupPointer = {
  version: 1;
  workspaceId: string;
  workpieceId: string;
  operationId: string;
  operationFingerprint: string;
  profileId: string;
  role: "transparent_logo" | "primary_logo" | "watermark_logo";
  filename: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  fileContentHash: string;
  expectedBindingRevision: number;
  requestedRules: Record<string, unknown>;
};
export type ThumbnailBrandSetupReceipt = Record<string, unknown> & {
  schema_version: "forge.thumbnail-brand-setup-receipt.v1";
  operation_id: string;
};

export type ThumbnailCandidateAuthorityProjection = { candidate_set: Record<string, unknown> | null; active_binding_id: string | null; active_binding_revision: number | null; candidates: Array<Record<string, unknown>> };

export type ThumbnailLaunchCommitReceipt = {
  launchVariantId: string;
  launchRevision: number;
  recipeId: string;
  recipeRevision: number;
  assetId: string;
  assetPath: string;
  contentHash: string;
};

export type V3MutationResult =
  | ({ ok: true; saveState: "saved"; launchReceipt?: ThumbnailLaunchCommitReceipt } & CanonicalEpisodePackageV3)
  | { ok: false; saveState: "error"; status: number; error: string; canonical?: CanonicalEpisodePackageV3 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function errorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;
  const error = isRecord(body.error) ? body.error : null;
  return readString(error?.message) ?? readString(body.message) ?? fallback;
}

export async function readThumbnailBrandAuthorityStatus(args: {
  workpieceId: string;
  workspaceId: string;
  projectedBindingId?: string | null;
  projectedBindingRevision?: number | null;
}): Promise<ThumbnailBrandAuthorityStatus> {
  const token = await requireThumbnailUserToken();
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/brand-status`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: { workspace_id: args.workspaceId, projected_binding_id: args.projectedBindingId ?? null, projected_binding_revision: args.projectedBindingRevision ?? null },
  });
  const body = await json(response);
  if (!response.ok || !isRecord(body) || !isRecord(body.data)) throw new Error(errorMessage(body, "Unable to read canonical thumbnail branding status."));
  return body.data as ThumbnailBrandAuthorityStatus;
}

function thumbnailBrandSetupPointerKey(workspaceId: string, workpieceId: string) {
  return `forge.hearth.thumbnail-brand-setup.v1:${workspaceId}:${workpieceId}`;
}

export function readThumbnailBrandSetupPointer(workspaceId: string, workpieceId: string): ThumbnailBrandSetupPointer | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(thumbnailBrandSetupPointerKey(workspaceId, workpieceId)) ?? "null") as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || parsed.workspaceId !== workspaceId || parsed.workpieceId !== workpieceId
      || !readString(parsed.operationId) || !readString(parsed.operationFingerprint) || !readString(parsed.profileId)
      || !readString(parsed.filename) || !readString(parsed.fileContentHash)
      || !Number.isInteger(parsed.expectedBindingRevision) || Number(parsed.expectedBindingRevision) < 0 || !isRecord(parsed.requestedRules)
      || (parsed.role !== "transparent_logo" && parsed.role !== "primary_logo" && parsed.role !== "watermark_logo")
      || (parsed.mimeType !== "image/png" && parsed.mimeType !== "image/jpeg" && parsed.mimeType !== "image/webp")) return null;
    return parsed as ThumbnailBrandSetupPointer;
  } catch { return null; }
}

export function forgetThumbnailBrandSetupPointer(workspaceId: string, workpieceId: string) {
  if (typeof window !== "undefined") window.localStorage.removeItem(thumbnailBrandSetupPointerKey(workspaceId, workpieceId));
}

function retainThumbnailBrandSetupPointer(pointer: ThumbnailBrandSetupPointer) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(thumbnailBrandSetupPointerKey(pointer.workspaceId, pointer.workpieceId), JSON.stringify(pointer));
}

async function thumbnailBrandSetupRequest(args: {
  workpieceId: string;
  stage: "begin" | "asset-ready" | "profile" | "binding" | "verify" | "receipt";
  body: Record<string, unknown>;
}): Promise<ThumbnailBrandSetupOperation | ThumbnailBrandSetupReceipt> {
  const token = await requireThumbnailUserToken();
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-brand-setup/${args.stage}`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: args.body,
  });
  const body = await json(response);
  if (!response.ok || !isRecord(body) || !isRecord(body.data)) throw new Error(errorMessage(body, `Thumbnail brand setup failed at ${args.stage}.`));
  return body.data as ThumbnailBrandSetupOperation | ThumbnailBrandSetupReceipt;
}

export async function readThumbnailBrandSetupOperation(args: { workspaceId: string; workpieceId: string; operationId: string }) {
  return thumbnailBrandSetupRequest({ workpieceId: args.workpieceId, stage: "receipt", body: { workspace_id: args.workspaceId, operation_id: args.operationId } });
}

async function sha256Bytes(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function beginThumbnailBrandSetup(args: {
  workspaceId: string;
  workpieceId: string;
  profileId: string;
  expectedBindingRevision: number;
  requestedRules: Record<string, unknown>;
  file: File;
  role?: "transparent_logo" | "primary_logo" | "watermark_logo";
  replaceOperation?: boolean;
}) {
  const mimeType = args.file.type as ThumbnailBrandSetupPointer["mimeType"];
  if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/webp") throw new Error("Choose a PNG, JPEG, or WebP logo.");
  const bytes = new Uint8Array(await args.file.arrayBuffer());
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Logo must be between 1 byte and 10 MB.");
  const fileContentHash = await sha256Bytes(bytes);
  const existing = args.replaceOperation ? null : readThumbnailBrandSetupPointer(args.workspaceId, args.workpieceId);
  if (existing) {
    if (existing.fileContentHash !== fileContentHash) throw new Error("This retry requires the same logo file used to begin the canonical setup.");
    try {
      return { pointer: existing, operation: await readThumbnailBrandSetupOperation({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, operationId: existing.operationId }), bytes };
    } catch {
      const replayIntent = { workspace_id: existing.workspaceId, workpiece_id: existing.workpieceId, profile_id: existing.profileId,
        logo_role: existing.role, filename: existing.filename, mime_type: existing.mimeType, file_content_hash: existing.fileContentHash,
        expected_binding_revision: existing.expectedBindingRevision, requested_rules: existing.requestedRules, operation_id: existing.operationId };
      const operation = await thumbnailBrandSetupRequest({ workpieceId: existing.workpieceId, stage: "begin", body: {
        ...replayIntent, operation_fingerprint: existing.operationFingerprint, asset_id: null, internal_label: `${existing.filename} thumbnail logo`,
      } });
      return { pointer: existing, operation, bytes };
    }
  }
  const role = args.role ?? "transparent_logo";
  const operationId = crypto.randomUUID();
  const intent = { workspace_id: args.workspaceId, workpiece_id: args.workpieceId, profile_id: args.profileId,
    logo_role: role, filename: args.file.name, mime_type: mimeType, file_content_hash: fileContentHash,
    expected_binding_revision: args.expectedBindingRevision, requested_rules: args.requestedRules, operation_id: operationId };
  const operationFingerprint = await sha256Canonical(intent);
  const pointer: ThumbnailBrandSetupPointer = { version: 1, workspaceId: args.workspaceId, workpieceId: args.workpieceId,
    operationId, operationFingerprint, profileId: args.profileId, role, filename: args.file.name, mimeType, fileContentHash,
    expectedBindingRevision: args.expectedBindingRevision, requestedRules: structuredClone(args.requestedRules) };
  // Retained before the request so a lost begin response reuses the exact identity.
  retainThumbnailBrandSetupPointer(pointer);
  const operation = await thumbnailBrandSetupRequest({ workpieceId: args.workpieceId, stage: "begin", body: {
    ...intent, operation_fingerprint: operationFingerprint, asset_id: null, internal_label: `${args.file.name} thumbnail logo`,
  } });
  return { pointer, operation, bytes };
}

const receiptField = (value: unknown, path: readonly string[]): unknown => path.reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, value);
const VERIFIED_RECEIPT_FIELDS = [
  ["schema_version"], ["operation_id"], ["workspace_id"], ["workpiece_id"],
  ["logo", "asset_revision_id"], ["logo", "role"], ["logo", "content_hash"], ["logo", "storage_bucket"], ["logo", "storage_key"],
  ["profile", "profile_id"], ["profile", "revision_id"], ["profile", "revision"], ["profile", "content_hash"],
  ["binding", "id"], ["binding", "revision"], ["renderer", "style_source"], ["renderer", "logo_asset_revision_id"],
  ["renderer", "storage_bucket"], ["renderer", "storage_key"], ["preservation", "candidate_set_id"],
  ["preservation", "candidate_set_revision"], ["preservation", "candidate_count"], ["preservation", "candidate_content_hash"],
  ["preservation", "thumbnail_count"], ["preservation", "thumbnail_identity_hash"],
  ["preservation", "existing_thumbnails_unchanged"], ["preservation", "existing_candidates_unchanged"],
] as const;

export function verifyThumbnailBrandSetupReceipt(args: { receipt: unknown; readback: unknown; pointer: ThumbnailBrandSetupPointer }) {
  if (!isRecord(args.receipt) || !isRecord(args.readback)) return { ok: false as const, reason: "Verified receipt readback is unavailable." };
  for (const path of VERIFIED_RECEIPT_FIELDS) {
    if (canonicalSerialize(receiptField(args.receipt, path)) !== canonicalSerialize(receiptField(args.readback, path))) {
      return { ok: false as const, reason: `Verified receipt readback mismatch at ${path.join(".")}.` };
    }
  }
  for (const path of [["logo", "asset_revision_id"], ["logo", "content_hash"], ["logo", "storage_bucket"], ["logo", "storage_key"],
    ["profile", "profile_id"], ["profile", "revision_id"], ["profile", "revision"], ["profile", "content_hash"],
    ["binding", "id"], ["binding", "revision"], ["renderer", "logo_asset_revision_id"], ["renderer", "storage_bucket"],
    ["renderer", "storage_key"], ["preservation", "candidate_count"], ["preservation", "thumbnail_count"],
    ["preservation", "thumbnail_identity_hash"]] as const) {
    if (receiptField(args.readback, path) == null) return { ok: false as const, reason: `Verified receipt is incomplete at ${path.join(".")}.` };
  }
  if (args.readback.schema_version !== "forge.thumbnail-brand-setup-receipt.v1"
    || args.readback.operation_id !== args.pointer.operationId
    || args.readback.workspace_id !== args.pointer.workspaceId || args.readback.workpiece_id !== args.pointer.workpieceId
    || receiptField(args.readback, ["logo", "role"]) !== args.pointer.role
    || receiptField(args.readback, ["logo", "content_hash"]) !== args.pointer.fileContentHash
    || receiptField(args.readback, ["renderer", "style_source"]) !== "brand_profile"
    || receiptField(args.readback, ["renderer", "logo_asset_revision_id"]) !== receiptField(args.readback, ["logo", "asset_revision_id"])
    || receiptField(args.readback, ["renderer", "storage_bucket"]) !== receiptField(args.readback, ["logo", "storage_bucket"])
    || receiptField(args.readback, ["renderer", "storage_key"]) !== receiptField(args.readback, ["logo", "storage_key"])
    || receiptField(args.readback, ["preservation", "existing_thumbnails_unchanged"]) !== true
    || receiptField(args.readback, ["preservation", "existing_candidates_unchanged"]) !== true) {
    return { ok: false as const, reason: "Verified receipt identities do not match the canonical setup intent." };
  }
  return { ok: true as const, receipt: args.readback as ThumbnailBrandSetupReceipt };
}

export async function advanceThumbnailBrandSetup(args: {
  pointer: ThumbnailBrandSetupPointer;
  fileBytes?: Uint8Array | null;
  onProgress?: (operation: ThumbnailBrandSetupOperation | ThumbnailBrandSetupReceipt) => void;
}) {
  const common = { workspace_id: args.pointer.workspaceId, operation_id: args.pointer.operationId, operation_fingerprint: args.pointer.operationFingerprint };
  let current = await readThumbnailBrandSetupOperation({ workspaceId: args.pointer.workspaceId, workpieceId: args.pointer.workpieceId, operationId: args.pointer.operationId });
  args.onProgress?.(current);
  if (current.schema_version === "forge.thumbnail-brand-setup-receipt.v1") return verifyThumbnailBrandSetupReceipt({ receipt: current, readback: current, pointer: args.pointer });
  if (current.state === "verified") {
    const readback = await readThumbnailBrandSetupOperation({ workspaceId: args.pointer.workspaceId, workpieceId: args.pointer.workpieceId, operationId: args.pointer.operationId });
    return verifyThumbnailBrandSetupReceipt({ receipt: readback, readback, pointer: args.pointer });
  }
  if (current.state === "pending") {
    if (!args.fileBytes?.length) throw new Error("Canonical setup is waiting for the original logo file. Choose the same file to resume.");
    if (await sha256Bytes(args.fileBytes) !== args.pointer.fileContentHash) throw new Error("This retry requires the same logo file used to begin the canonical setup.");
    current = await thumbnailBrandSetupRequest({ workpieceId: args.pointer.workpieceId, stage: "asset-ready", body: {
      ...common, bytes_base64: bytesToBase64(args.fileBytes), mime_type: args.pointer.mimeType,
    } }); args.onProgress?.(current);
  }
  if (current.state === "asset_ready") { current = await thumbnailBrandSetupRequest({ workpieceId: args.pointer.workpieceId, stage: "profile", body: common }); args.onProgress?.(current); }
  if (current.state === "profile_committed") { current = await thumbnailBrandSetupRequest({ workpieceId: args.pointer.workpieceId, stage: "binding", body: common }); args.onProgress?.(current); }
  if (current.state === "binding_committed") { current = await thumbnailBrandSetupRequest({ workpieceId: args.pointer.workpieceId, stage: "verify", body: common }); args.onProgress?.(current); }
  if (current.schema_version !== "forge.thumbnail-brand-setup-receipt.v1") {
    const failure = readString(current.failure_message);
    return { ok: false as const, reason: failure ?? `Canonical setup stopped at ${readString(current.failed_stage) ?? current.state}.`, operation: current };
  }
  const readback = await readThumbnailBrandSetupOperation({ workspaceId: args.pointer.workspaceId, workpieceId: args.pointer.workpieceId, operationId: args.pointer.operationId });
  return verifyThumbnailBrandSetupReceipt({ receipt: current, readback, pointer: args.pointer });
}

export async function readThumbnailCandidateAuthorityProjection(args: { workpieceId: string; workspaceId: string }): Promise<ThumbnailCandidateAuthorityProjection> {
  const token=await requireThumbnailUserToken(); const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-candidates/projection`,{method:"POST",headers:{"x-forge-user-authorization":`Bearer ${token}`},json:{workspace_id:args.workspaceId}}); const body=await json(response);
  if(!response.ok||!isRecord(body)||!isRecord(body.data)) throw new Error(errorMessage(body,"Unable to read canonical thumbnail candidate set.")); const data=body.data;
  return {candidate_set:isRecord(data.candidate_set)?data.candidate_set:null,active_binding_id:readString(data.active_binding_id),active_binding_revision:typeof data.active_binding_revision==="number"?data.active_binding_revision:null,candidates:Array.isArray(data.candidates)?data.candidates.filter(isRecord):[]};
}

export async function commitThumbnailCandidateSet(args:{workpieceId:string;workspaceId:string;expectedCurrentRevision:number;candidates:Array<Record<string,unknown>>;operationId:string;operationFingerprint:string}):Promise<Record<string,unknown>> {
  const token=await requireThumbnailUserToken(); const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-candidates/commit-set`,{method:"POST",headers:{"x-forge-user-authorization":`Bearer ${token}`},json:{workspace_id:args.workspaceId,expected_current_revision:args.expectedCurrentRevision,candidates:args.candidates,operation_id:args.operationId,operation_fingerprint:args.operationFingerprint}}); const body=await json(response); if(!response.ok||!isRecord(body)||!isRecord(body.data)) throw new Error(errorMessage(body,"Unable to commit canonical thumbnail candidate set.")); return body.data;
}

export async function recoverBrandedThumbnailCandidateSet(args:{workpieceId:string;workspaceId:string}):Promise<Record<string,unknown>> {
  const token=await requireThumbnailUserToken(); const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-candidates/recover-branded-set`,{method:"POST",headers:{"x-forge-user-authorization":`Bearer ${token}`},json:{workspace_id:args.workspaceId}}); const body=await json(response); if(!response.ok||!isRecord(body)||!isRecord(body.data)) throw new Error(errorMessage(body,"Unable to recover the saved branded thumbnails.")); return body.data;
}

export async function decideThumbnailCandidateHistoricalBrand(args:{workpieceId:string;workspaceId:string;candidateRevisionId:string;candidateSetId:string;activeBindingId:string;decision:"approved"|"revoked";reason:string;expectedDecisionId:string|null;expectedDecisionRevision:number}):Promise<Record<string,unknown>> {
  const token=await requireThumbnailUserToken();const operationId=crypto.randomUUID();const intent={workspace_id:args.workspaceId,candidate_revision_id:args.candidateRevisionId,candidate_set_id:args.candidateSetId,active_binding_id:args.activeBindingId,decision:args.decision,reason:args.reason,expected_current_decision_id:args.expectedDecisionId,expected_current_decision_revision:args.expectedDecisionRevision,operation_id:operationId};const operationFingerprint=await sha256Canonical(intent);const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-candidates/brand-decision`,{method:"POST",headers:{"x-forge-user-authorization":`Bearer ${token}`},json:{...intent,operation_fingerprint:operationFingerprint}});const body=await json(response);if(!response.ok||!isRecord(body)||!isRecord(body.data))throw new Error(errorMessage(body,"Unable to record historical-brand authorization."));return body.data;
}

export function projectCanonicalCandidateSet(authority:ThumbnailCandidateAuthorityProjection,projectedAt:string):ThumbnailCandidateSetProjection|null {
  const set=authority.candidate_set;if(!set)return null;const id=readString(set.id),hash=readString(set.content_hash);if(!id||!hash)return null;
  return {candidate_set_id:id,revision:Number(set.revision),previous_candidate_set_id:readString(set.previous_candidate_set_id),content_hash:hash,distinction_contract_version:"forge.thumbnail-candidate-distinction.v1",candidates:authority.candidates.map((c)=>({candidate_revision_id:String(c.id),candidate_ordinal:Number(c.candidate_ordinal),recipe_id:String(c.recipe_id),recipe_revision:Number(c.recipe_revision),recipe_hash:String(c.recipe_hash),title_revision_id:String(c.title_revision_id),concept_revision_id:String(c.concept_revision_id),base_artwork_content_hash:String(c.base_artwork_content_hash),structural_composition_fingerprint:String(c.structural_composition_fingerprint),composite_asset_id:String(c.composite_asset_id),composite_content_hash:String(c.composite_content_hash),candidate_binding_id:String(c.candidate_binding_id),candidate_binding_revision:Number(c.candidate_binding_revision),style_source:c.style_source==="forge_standard"?"forge_standard":"brand_profile",style_provenance_hash:readString(c.style_provenance_hash)??undefined,readability_evidence_hash:String(c.readability_evidence_hash),eligibility_state:String(c.eligibility_state) as ThumbnailCandidateSetProjection["candidates"][number]["eligibility_state"]})),projected_at:projectedAt};
}

export async function commitReadyLaunchesAsCandidateSet(args:{workpieceId:string;workspaceId:string;episodePackage:EpisodePackageV3;expectedMetadataUpdatedAt:string|null;selectedLaunchVariantIds:string[]}):Promise<V3MutationResult> {
  const selectedIds=new Set(args.selectedLaunchVariantIds);
  if(selectedIds.size!==3)return{ok:false,saveState:"error",status:409,error:"Choose exactly three thumbnail revisions before committing a candidate set."};
  const launches=args.episodePackage.thumbnail.launch_variant_revisions.filter((entry)=>selectedIds.has(entry.launch_variant_id)&&entry.status==="ready"&&entry.snapshot.readability_evidence?.passed===true);
  const unique=[...new Map(launches.map((entry)=>[entry.snapshot.asset_id,entry])).values()]; if(unique.length!==3)return{ok:false,saveState:"error",status:409,error:"All three selected thumbnail revisions must be complete, readable, and canonically distinct."};
  const existingByComposite=new Map(args.episodePackage.thumbnail.candidate_sets.flatMap((set)=>set.candidates).map((candidate)=>[candidate.composite_asset_id,candidate.candidate_revision_id]));
  const candidates=unique.map((launch)=>{const existing=existingByComposite.get(launch.snapshot.asset_id);if(existing)return{candidate_revision_id:existing};const base=args.episodePackage.thumbnail.base_versions.find((entry)=>entry.id===launch.base_version_id);const recipe=args.episodePackage.thumbnail.render_recipes.find((entry)=>entry.id===launch.recipe_id&&entry.revision===launch.recipe_revision);const provenance=launch.snapshot.brand_binding_context??launch.snapshot.brand_application_provenance;const evidence=launch.snapshot.readability_evidence;if(!base||!recipe||!provenance||!evidence||!launch.snapshot.style_source||!launch.snapshot.style_provenance_hash)throw new Error("Candidate launch provenance is incomplete.");
    const placement=recipe.treatment.placement,typography=recipe.treatment.typography,treatment=recipe.treatment.treatment;
    return{new_candidate_revision_id:deterministicUuid("thumbnail-candidate-revision",launch.snapshot.asset_id),recipe_id:recipe.id,recipe_revision:recipe.revision,recipe_hash:launch.snapshot.recipe_snapshot_hash,recipe_snapshot:launch.snapshot.recipe_snapshot,title_revision_id:deterministicUuid("thumbnail-title-revision",`${recipe.title_id}:${recipe.title_revision}`),title_revision:recipe.title_revision,concept_revision_id:recipe.concept_revision_id,base_artwork_asset_id:base.asset_id,base_artwork_content_hash:base.content_hash,structural_composition:{layout_family:placement.layout_family??"title-subject",title_block_zone:launch.snapshot.recipe_snapshot.placement,title_alignment:typography.alignment??"center",subject_zone:placement.subject_zone??null,subject_scale_class:placement.subject_scale_class??null,crop_mode:placement.crop_mode??"cover",foreground_layering:treatment.foreground_layering??null,background_treatment:treatment.background_treatment??null},composite_asset_id:launch.snapshot.asset_id,composite_content_hash:launch.snapshot.content_hash,candidate_binding_id:String(provenance.binding_id),candidate_binding_revision:Number(provenance.binding_revision),candidate_binding_content_hash:typeof provenance.profile_content_hash==="string"?provenance.profile_content_hash:null,style_source:launch.snapshot.style_source,style_provenance_hash:launch.snapshot.style_provenance_hash,readability_contract_version:evidence.contract_version,readability_evaluator_version:evidence.evaluator_version,readability_evidence_hash:evidence.evaluation_hash,compositor_version:launch.snapshot.composition_engine_version};});
  const operationFingerprint=await sha256Canonical({workspace_id:args.workspaceId,workpiece_id:args.workpieceId,expected_current_revision:args.episodePackage.thumbnail.candidate_sets.at(-1)?.revision??0,candidates});const operationId=deterministicUuid("thumbnail-candidate-set-operation",operationFingerprint);
  const committed=await commitThumbnailCandidateSet({workpieceId:args.workpieceId,workspaceId:args.workspaceId,expectedCurrentRevision:args.episodePackage.thumbnail.candidate_sets.at(-1)?.revision??0,candidates,operationId,operationFingerprint}); if(committed.disposition!=="committed"&&committed.disposition!=="replayed")return{ok:false,saveState:"error",status:409,error:String(committed.code??committed.disposition)};
  const authority=await readThumbnailCandidateAuthorityProjection({workpieceId:args.workpieceId,workspaceId:args.workspaceId});const projection=projectCanonicalCandidateSet(authority,new Date().toISOString());if(!projection)return{ok:false,saveState:"error",status:502,error:"Committed candidate set was not recovered from Tongs."};
  const next={...args.episodePackage,thumbnail:{...args.episodePackage.thumbnail,candidate_sets:[...args.episodePackage.thumbnail.candidate_sets.filter((entry)=>entry.candidate_set_id!==projection.candidate_set_id),projection],active_candidate_set_id:projection.candidate_set_id}};
  return commitEpisodePackageV3Mutation({workpieceId:args.workpieceId,expectedMetadataUpdatedAt:args.expectedMetadataUpdatedAt,nextEpisodePackage:next,mutation:{kind:"candidate_set",entityId:projection.candidate_set_id,revision:projection.revision},eventName:"hearth.thumbnail.candidate-set.projected.v3",eventPayload:{candidate_set_id:projection.candidate_set_id,revision:projection.revision,content_hash:projection.content_hash}});
}

export async function readCanonicalEpisodePackageV3(workpieceId: string): Promise<CanonicalEpisodePackageV3> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent("metadata.json")}`,
    { method: "GET" },
  );
  const body = await json(response);
  if (!response.ok || !isRecord(body) || body.ok !== true) {
    throw new Error(errorMessage(body, "Unable to read canonical episode package."));
  }
  const metadata = isRecord(body.data) ? body.data : {};
  const fileRow = isRecord(body.file_row) ? body.file_row : null;
  return {
    episodePackage: hydrateEpisodePackageV3(metadata),
    metadata,
    metadataUpdatedAt: readString(fileRow?.updated_at),
  };
}

export async function commitEpisodePackageV3Mutation(args: {
  workpieceId: string;
  expectedMetadataUpdatedAt: string | null;
  nextEpisodePackage: EpisodePackageV3;
  mutation: { kind: ThumbnailMutationKind; entityId: string; revision?: number };
  protectedRelationships?: readonly { versionId: string; conceptRevisionId: string }[];
  eventName: string;
  eventPayload?: Record<string, unknown>;
}): Promise<V3MutationResult> {
  const before = await readCanonicalEpisodePackageV3(args.workpieceId);
  if ((before.metadataUpdatedAt ?? null) !== (args.expectedMetadataUpdatedAt ?? null)) {
    return { ok: false, saveState: "error", status: 409, error: "Thumbnail state changed elsewhere. Reloaded canonical state was preserved.", canonical: before };
  }
  const nextMetadata = {
    ...before.metadata,
    updated_at: new Date().toISOString(),
    episode: serializeEpisodePackageV3(args.nextEpisodePackage),
  };
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: "metadata.json",
      content_type: "application/json",
      json: nextMetadata,
      expected_previous_updated_at: args.expectedMetadataUpdatedAt,
      written_by: { tool: "hearth", tool_version: "3", lane: "canonical" },
      event_name: args.eventName,
      event_payload: { schema: EPISODE_PACKAGE_V3_SCHEMA, ...args.eventPayload },
      correlation_id: crypto.randomUUID(),
    },
  });
  const body = await json(response);
  if (!response.ok) {
    const canonical = await readCanonicalEpisodePackageV3(args.workpieceId).catch(() => undefined);
    return { ok: false, saveState: "error", status: response.status, error: errorMessage(body, "Thumbnail mutation failed."), ...(canonical ? { canonical } : {}) };
  }
  const canonical = await readCanonicalEpisodePackageV3(args.workpieceId);
  const proof: ThumbnailMutationProof = proveThumbnailMutation({
    expected: args.nextEpisodePackage,
    canonical: canonical.episodePackage,
    kind: args.mutation.kind,
    entityId: args.mutation.entityId,
    revision: args.mutation.revision,
    protectedRelationships: args.protectedRelationships,
  });
  if (!proof.ok) return { ok: false, saveState: "error", status: 409, error: proof.reason, canonical };
  return { ok: true, saveState: "saved", ...canonical };
}

export async function requireThumbnailUserToken(): Promise<string> {
  const token = await resolveForgeUserAccessToken();
  if (!token) throw new Error("Sign in required for thumbnail asset operations.");
  return token;
}

export async function readCanonicalThumbnailWorkspaceV3(args: {
  workpieceId: string;
  workspaceId: string;
}): Promise<CanonicalEpisodePackageV3> {
  const token = await requireThumbnailUserToken();
  await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/reconcile`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: { workspace_id: args.workspaceId, operation_id: null },
  });
  const canonical = await readCanonicalEpisodePackageV3(args.workpieceId);
  const resolved = await Promise.all(canonical.episodePackage.thumbnail.base_versions.map(async (base) => {
    const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/${encodeURIComponent(base.asset_id)}`, {
      method: "GET", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    });
    const body = await json(response);
    const asset = isRecord(body) && isRecord(body.data) ? body.data : null;
    const status = readString(asset?.status);
    const hash = readString(asset?.content_hash);
    if (!response.ok || !status || !hash || hash !== base.content_hash) {
      return { ...base, status: "recoverable_error" as const, error_details: { code: "asset_missing_or_hash_mismatch" } };
    }
    return {
      ...base,
      status: status as ThumbnailBaseVersion["status"],
      error_details: status === "failed" ? { code: readString(asset?.failure_code), message: readString(asset?.failure_message) } : null,
    };
  }));
  return {
    ...canonical,
    episodePackage: {
      ...canonical.episodePackage,
      thumbnail: { ...canonical.episodePackage.thumbnail, base_versions: resolved },
    },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

export type BaseArtworkInput = {
  sourceType: "forge_ai" | "outside_tool";
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  providerId: string;
  providerRequestId?: string | null;
  operationId: string;
  preparationEvidence?: Record<string, unknown> | null;
};

export async function commitThumbnailBaseArtwork(args: {
  workpieceId: string;
  workspaceId: string;
  expectedMetadataUpdatedAt: string | null;
  episodePackage: EpisodePackageV3;
  baseVersion: Omit<ThumbnailBaseVersion, "asset_id" | "asset_path" | "content_hash" | "status" | "error_details">;
  artwork: BaseArtworkInput;
}): Promise<V3MutationResult> {
  const token = await requireThumbnailUserToken();
  const recipe = args.episodePackage.thumbnail.render_recipes.find(
    (entry) => entry.id === args.baseVersion.render_recipe_id && entry.revision === args.baseVersion.render_recipe_revision,
  );
  const concept = recipe && args.episodePackage.thumbnail.concept_revisions.find(
    (entry) => entry.concept_revision_id === recipe.concept_revision_id,
  );
  const strategy = recipe ? args.episodePackage.thumbnail.creative_strategies.find((entry) => entry.id === recipe.strategy_id && entry.revision === recipe.strategy_revision) : null;
  const brief = recipe ? args.episodePackage.thumbnail.creative_briefs.find((entry) => entry.id === recipe.creative_brief_id && entry.revision === recipe.creative_brief_revision) : null;
  const promptPack = recipe && concept ? deriveThumbnailPromptPack({ recipe, concept, strategy, brief }) : null;
  if (!recipe || !concept || promptPack?.review_state !== "reviewed") {
    return { ok: false, saveState: "error", status: 409, error: "Review the canonical prompt pack before rendering base artwork." };
  }
  const stageResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/stage`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: {
      workspace_id: args.workspaceId,
      operation_id: args.artwork.operationId,
      asset_kind: "thumbnail_image",
      mime_type: args.artwork.mimeType,
      bytes_base64: bytesToBase64(args.artwork.bytes),
      provider: args.artwork.providerId,
      provider_request_id: args.artwork.providerRequestId ?? null,
      prompt: null,
      metadata: {
        source_type: args.artwork.sourceType,
        concept_revision_id: args.baseVersion.concept_revision_id,
        render_recipe_id: args.baseVersion.render_recipe_id,
        render_recipe_revision: args.baseVersion.render_recipe_revision,
        preparation_evidence: args.artwork.preparationEvidence ?? null,
      },
    },
  });
  const stageBody = await json(stageResponse);
  const staged = isRecord(stageBody) && isRecord(stageBody.data) ? stageBody.data : null;
  const assetId = readString(staged?.id);
  const assetPath = readString(staged?.path);
  const contentHash = readString(staged?.content_hash);
  if (!stageResponse.ok || !assetId || !assetPath || !contentHash) {
    return { ok: false, saveState: "error", status: stageResponse.status, error: errorMessage(stageBody, "Unable to stage thumbnail artwork.") };
  }
  const base: ThumbnailBaseVersion = {
    ...args.baseVersion,
    asset_id: assetId,
    asset_path: assetPath,
    content_hash: contentHash,
    source_type: args.artwork.sourceType,
    provider_id: args.artwork.providerId,
    provider_request_id: args.artwork.providerRequestId ?? null,
    mime_type: args.artwork.mimeType,
    status: "pending",
    error_details: null,
  };
  const nextPackage: EpisodePackageV3 = {
    ...args.episodePackage,
    thumbnail: { ...args.episodePackage.thumbnail, base_versions: [...args.episodePackage.thumbnail.base_versions, base] },
  };
  const index = nextPackage.thumbnail.base_versions.length - 1;
  const metadataBefore = await readCanonicalEpisodePackageV3(args.workpieceId);
  if ((metadataBefore.metadataUpdatedAt ?? null) !== (args.expectedMetadataUpdatedAt ?? null)) {
    return { ok: false, saveState: "error", status: 409, error: "Thumbnail state changed while artwork was staging.", canonical: metadataBefore };
  }
  const nextMetadata = { ...metadataBefore.metadata, updated_at: new Date().toISOString(), episode: nextPackage };
  const pointer = `/episode/thumbnail/base_versions/${index}/asset_id`;
  const referenceResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/commit-reference`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: {
      workspace_id: args.workspaceId, asset_id: assetId,
      expected_metadata_updated_at: args.expectedMetadataUpdatedAt,
      metadata_document: nextMetadata, reference_pointer: pointer,
    },
  });
  if (!referenceResponse.ok) {
    return { ok: false, saveState: "error", status: referenceResponse.status, error: errorMessage(await json(referenceResponse), "Unable to commit the thumbnail package reference.") };
  }
  const readyResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/transition`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: { workspace_id: args.workspaceId, asset_id: assetId, target_status: "ready" },
  });
  const readyBody = await json(readyResponse);
  if (!readyResponse.ok) {
    return { ok: false, saveState: "error", status: readyResponse.status, error: errorMessage(readyBody, "Artwork was referenced but could not be marked ready.") };
  }
  const expected: EpisodePackageV3 = {
    ...nextPackage,
    thumbnail: {
      ...nextPackage.thumbnail,
      base_versions: nextPackage.thumbnail.base_versions.map((entry) => entry.id === base.id ? { ...entry, status: "ready" } : entry),
    },
  };
  // Asset readiness is canonical in Tongs; package metadata deliberately retains
  // its staged record. Reconciliation/readback overlays asset state before proof.
  const canonical = await readCanonicalThumbnailWorkspaceV3({ workpieceId: args.workpieceId, workspaceId: args.workspaceId });
  const persisted = canonical.episodePackage.thumbnail.base_versions.find((entry) => entry.id === base.id);
  if (!persisted || persisted.asset_id !== assetId || persisted.content_hash !== contentHash) {
    return { ok: false, saveState: "error", status: 409, error: "Canonical package readback did not recover the staged base artwork.", canonical };
  }
  const proof = proveThumbnailMutation({ expected, canonical: canonical.episodePackage, kind: "base_version", entityId: base.id });
  if (!proof.ok) return { ok: false, saveState: "error", status: 409, error: proof.reason, canonical };
  return { ok: true, saveState: "saved", ...canonical };
}

export function commitForgeAiBaseArtwork(args: Parameters<typeof commitThumbnailBaseArtwork>[0]) {
  if (args.artwork.sourceType !== "forge_ai") throw new Error("Forge renderer requires forge_ai source authority.");
  return commitThumbnailBaseArtwork(args);
}

export async function generateForgeAiBaseArtwork(args: {
  workpieceId: string;
  workspaceId: string;
  expectedMetadataUpdatedAt: string | null;
  episodePackage: EpisodePackageV3;
  baseVersion: Omit<ThumbnailBaseVersion, "asset_id" | "asset_path" | "content_hash" | "status" | "error_details" | "source_type" | "provider_id" | "provider_request_id" | "mime_type">;
  operationId: string;
  confirmSpend: boolean;
  alwaysApproveAiSpend: boolean;
}): Promise<V3MutationResult> {
  const token = await requireThumbnailUserToken();
  const recipe = args.episodePackage.thumbnail.render_recipes.find(
    (entry) => entry.id === args.baseVersion.render_recipe_id && entry.revision === args.baseVersion.render_recipe_revision,
  );
  const concept = recipe && args.episodePackage.thumbnail.concept_revisions.find((entry) => entry.concept_revision_id === recipe.concept_revision_id);
  if (!recipe || !concept || recipe.prompt_review_state !== "reviewed") {
    return { ok: false, saveState: "error", status: 409, error: "Review the exact canonical prompt pack before Forge rendering." };
  }
  const strategy = args.episodePackage.thumbnail.creative_strategies.find((entry) => entry.id === recipe.strategy_id && entry.revision === recipe.strategy_revision);
  const brief = args.episodePackage.thumbnail.creative_briefs.find((entry) => entry.id === recipe.creative_brief_id && entry.revision === recipe.creative_brief_revision);
  if (!strategy || !brief) return { ok: false, saveState: "error", status: 409, error: "Canonical strategy or creative brief authority is unavailable." };
  const promptPack = deriveThumbnailPromptPack({ recipe, concept, strategy, brief });
  if (promptPack.review_state !== "reviewed") return { ok: false, saveState: "error", status: 409, error: "Prompt template changed and requires review." };
  if (recipe.generation_reference) return { ok: false, saveState: "error", status: 409, error: "Reference-image generation is not certified for the current Thumbnail Base Test product." };
  const operationId = await deriveCustomerOperationId("hearth-thumbnail-base", {
    workspace_id: args.workspaceId, workpiece_id: args.workpieceId,
    render_recipe_id: recipe.id, render_recipe_revision: recipe.revision,
    concept_revision_id: concept.concept_revision_id, prompt_package_hash: promptPack.canonical_hash,
  });
  const requestBody = (spendingAcceptance?: ReturnType<typeof requestCustomerSpendingAcceptance>) => ({
      workspace_id: args.workspaceId, episode_id: args.workpieceId, operation_id: operationId,
      prompt: `${promptPack.positive_prompt}\n\nAvoid: ${promptPack.negative_prompt}`,
      aspect: recipe.intended_aspect_ratio, size: "1536x1024", lane: "forge",
      canonical_stage_only: true, concept_revision_id: concept.concept_revision_id,
      render_recipe_id: recipe.id, render_recipe_revision: recipe.revision,
      prompt_package_hash: promptPack.canonical_hash,
      prompt_serialization_version: promptPack.serialization_version,
      provider_settings: recipe.provider_settings,
      generation_reference: null,
      ...(spendingAcceptance ? { spending_acceptance: spendingAcceptance } : {}),
  });
  let response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/generate-thumbnail`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: requestBody(),
  });
  let body = await json(response);
  if (!response.ok) {
    const quote = readCustomerSpendingQuote(body);
    if (quote) {
      const acceptance = requestCustomerSpendingAcceptance(quote);
      if (!acceptance) return { ok: false, saveState: "error", status: response.status,
        error: quote.funding_eligible ? "The 45 Forge Credit price was not accepted. No funds were reserved and no provider request was sent." : "Not enough Forge Credits for Thumbnail Base generation." };
      response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/generate-thumbnail`, {
        method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` }, json: requestBody(acceptance),
      });
      body = await json(response);
    }
  }
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;
  const asset = data && isRecord(data.asset) ? data.asset : null;
  const assetId = readString(asset?.id);
  const assetPath = readString(asset?.path);
  const contentHash = readString(asset?.content_hash);
  const mimeType = readString(asset?.mime_type);
  const canonicalProvider = readString(asset?.provider);
  const canonicalProviderRequestId = readString(asset?.provider_request_id);
  if (!response.ok || data?.canonical_stage_only !== true || !assetId || !assetPath || !contentHash || !mimeType) {
    return { ok: false, saveState: "error", status: response.status, error: errorMessage(body, "Forge could not stage canonical base artwork.") };
  }
  return attachCanonicalPendingBase({
    workpieceId: args.workpieceId, workspaceId: args.workspaceId,
    expectedMetadataUpdatedAt: args.expectedMetadataUpdatedAt, episodePackage: args.episodePackage,
    base: {
      ...args.baseVersion, asset_id: assetId, asset_path: assetPath, content_hash: contentHash,
      source_type: "forge_ai", provider_id: canonicalProvider ?? "forge", provider_request_id: canonicalProviderRequestId,
      mime_type: mimeType, status: "pending", error_details: null,
    },
    token,
  });
}

async function attachCanonicalPendingBase(args: {
  workpieceId: string;
  workspaceId: string;
  expectedMetadataUpdatedAt: string | null;
  episodePackage: EpisodePackageV3;
  base: ThumbnailBaseVersion;
  token: string;
}): Promise<V3MutationResult> {
  const next: EpisodePackageV3 = {
    ...args.episodePackage,
    thumbnail: { ...args.episodePackage.thumbnail, base_versions: [...args.episodePackage.thumbnail.base_versions, args.base] },
  };
  const before = await readCanonicalEpisodePackageV3(args.workpieceId);
  if ((before.metadataUpdatedAt ?? null) !== (args.expectedMetadataUpdatedAt ?? null)) {
    return { ok: false, saveState: "error", status: 409, error: "Thumbnail state changed while artwork was staging.", canonical: before };
  }
  const index = next.thumbnail.base_versions.length - 1;
  const reference = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/commit-reference`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${args.token}` },
    json: {
      workspace_id: args.workspaceId, asset_id: args.base.asset_id,
      expected_metadata_updated_at: args.expectedMetadataUpdatedAt,
      metadata_document: { ...before.metadata, updated_at: new Date().toISOString(), episode: next },
      reference_pointer: `/episode/thumbnail/base_versions/${index}/asset_id`,
    },
  });
  if (!reference.ok) return { ok: false, saveState: "error", status: reference.status, error: errorMessage(await json(reference), "Unable to attach staged Forge artwork.") };
  const transition = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/transition`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${args.token}` },
    json: { workspace_id: args.workspaceId, asset_id: args.base.asset_id, target_status: "ready" },
  });
  if (!transition.ok) return { ok: false, saveState: "error", status: transition.status, error: errorMessage(await json(transition), "Forge artwork remains recoverable but is not ready.") };
  const canonical = await readCanonicalThumbnailWorkspaceV3({ workpieceId: args.workpieceId, workspaceId: args.workspaceId });
  const expected = {
    ...next,
    thumbnail: { ...next.thumbnail, base_versions: next.thumbnail.base_versions.map((entry) => entry.id === args.base.id ? { ...entry, status: "ready" as const } : entry) },
  };
  const proof = proveThumbnailMutation({ expected, canonical: canonical.episodePackage, kind: "base_version", entityId: args.base.id });
  if (!proof.ok) return { ok: false, saveState: "error", status: 409, error: proof.reason, canonical };
  return { ok: true, saveState: "saved", ...canonical };
}

export function commitOutsideToolBaseArtwork(args: Parameters<typeof commitThumbnailBaseArtwork>[0]) {
  if (args.artwork.sourceType !== "outside_tool") throw new Error("Outside renderer requires outside_tool source authority.");
  return commitThumbnailBaseArtwork(args);
}

export async function applyWorkspaceDefaultThumbnailBrand(args: {
  workpieceId: string;
  workspaceId: string;
  expectedCurrentRevision: number;
  profileId: string;
  profileRevisionId: string;
}): Promise<Record<string, unknown>> {
  const token = await requireThumbnailUserToken();
  const operationId = crypto.randomUUID();
  const intent = { workspace_id: args.workspaceId, workpiece_id: args.workpieceId, intent: "select_profile_revision", expected_current_revision: args.expectedCurrentRevision, profile_id: args.profileId, profile_revision_id: args.profileRevisionId, operation_id: operationId };
  const operationFingerprint = await sha256Canonical(intent);
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/apply-workspace-brand`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: { ...intent, operation_fingerprint: operationFingerprint },
  });
  const body = await json(response);
  if (!response.ok || !isRecord(body) || !isRecord(body.data)) throw new Error(errorMessage(body, "Unable to apply the workspace brand to this episode."));
  return body.data;
}

export async function loadThumbnailCompositePreview(args: {
  workpieceId: string;
  assetPath: string;
}): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  if (!args.assetPath.trim()) return { ok: false, error: "Composite asset path is unavailable." };
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(args.assetPath)}&encoding=base64`,
    { method: "GET" },
  );
  const body = await json(response);
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;
  const bytes = readString(data?.bytes_base64);
  if (!response.ok || !bytes) return { ok: false, error: errorMessage(body, "Thumbnail preview is unavailable.") };
  return { ok: true, dataUrl: `data:${readString(data?.content_type) ?? "image/png"};base64,${bytes}` };
}

function compositorRecipe(recipe: ThumbnailRenderRecipe): ThumbnailCompositeSnapshot["recipe_snapshot"] {
  const typography = isRecord(recipe.treatment.typography) ? recipe.treatment.typography : {};
  const placement = isRecord(recipe.treatment.placement) ? recipe.treatment.placement : {};
  const shadow = isRecord(recipe.treatment.shadow) ? recipe.treatment.shadow : {};
  return {
    ...structuredClone(recipe),
    title_text: recipe.title_text,
    title_revision: recipe.title_revision,
    template_revision: 1,
    text_color: readString(typography.color) ?? "#FFFFFF",
    shadow_color: readString(shadow.color) ?? "#000000",
    shadow_opacity: typeof shadow.opacity === "number" ? shadow.opacity : 0.7,
    placement: placement.vertical === "top" || placement.vertical === "center" ? placement.vertical : "bottom",
    max_lines: typeof typography.max_lines === "number" ? typography.max_lines : 3,
    horizontal_padding_percent: typeof placement.horizontal_padding_percent === "number" ? placement.horizontal_padding_percent : 8,
    presentation_override: recipe.presentation_override ?? null,
  };
}

async function sha256Canonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSerialize(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function commitThumbnailLaunchComposite(args: {
  workpieceId: string;
  workspaceId: string;
  expectedMetadataUpdatedAt: string | null;
  episodePackage: EpisodePackageV3;
  launchVariantId: string;
  baseVersionId: string;
  recipeId?: string;
  recipeRevision?: number;
  operationId: string;
  width: number;
  height: number;
  encoding: { format: "png" | "jpeg" | "webp"; quality: number };
  createdAt: string;
  requestedStyleSource?: ThumbnailRequestedStyleSource;
}): Promise<V3MutationResult> {
  const token = await requireThumbnailUserToken();
  const base = args.episodePackage.thumbnail.base_versions.find((entry) => entry.id === args.baseVersionId);
  if (!base || base.status !== "ready") return { ok: false, saveState: "error", status: 409, error: "Launch requires ready base artwork." };
  const recipe = args.episodePackage.thumbnail.render_recipes.find(
    (entry) => entry.id === (args.recipeId ?? base.render_recipe_id)
      && entry.revision === (args.recipeRevision ?? base.render_recipe_revision),
  );
  if (!recipe) return { ok: false, saveState: "error", status: 409, error: "Exact launch recipe revision is unavailable." };
  if (recipe.concept_revision_id !== base.concept_revision_id) {
    return { ok: false, saveState: "error", status: 409, error: "Edited recipe and base artwork do not share the same canonical concept revision." };
  }
  const recipeSnapshot = compositorRecipe(recipe);
  const recipeHash = await sha256Canonical(recipeSnapshot);
  const renderResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/render-composite`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: {
      workspace_id: args.workspaceId, operation_id: args.operationId, base_asset_id: base.asset_id,
      recipe_snapshot: recipeSnapshot, recipe_snapshot_hash: recipeHash,
      requested_style_source: args.requestedStyleSource ?? "auto",
      width: args.width, height: args.height, encoding: args.encoding,
    },
  });
  const renderBody = await json(renderResponse);
  const asset = isRecord(renderBody) && isRecord(renderBody.data) ? renderBody.data : null;
  const assetId = readString(asset?.id);
  const assetPath = readString(asset?.path);
  const contentHash = readString(asset?.content_hash);
  const assetMetadata = isRecord(asset?.metadata) ? asset.metadata : {};
  if (!renderResponse.ok || !assetId || !assetPath || !contentHash) {
    return { ok: false, saveState: "error", status: renderResponse.status, error: errorMessage(renderBody, "Unable to render launch composite.") };
  }
  const snapshot: ThumbnailCompositeSnapshot = {
    asset_id: assetId, asset_path: assetPath, content_hash: contentHash,
    composition_engine_version: recipe.composition_engine_version,
    recipe_snapshot: recipeSnapshot, recipe_snapshot_hash: recipeHash,
    style_source: assetMetadata.style_source === "forge_standard" ? "forge_standard" : "brand_profile",
    style_application_provenance: isRecord(assetMetadata.style_application_provenance) ? assetMetadata.style_application_provenance : null,
    style_provenance_hash: readString(assetMetadata.style_provenance_hash),
    brand_binding_context: isRecord(assetMetadata.brand_binding_context) ? assetMetadata.brand_binding_context : null,
    brand_application_provenance: isRecord(assetMetadata.brand_application_provenance) ? assetMetadata.brand_application_provenance : null,
    brand_logo_asset_revision_id: readString(assetMetadata.brand_logo_asset_revision_id), exported_at: args.createdAt,
    readability_evidence: isRecord(assetMetadata.readability_evidence) ? assetMetadata.readability_evidence as ThumbnailCompositeSnapshot["readability_evidence"] : null,
  };
  const next = appendLaunchSnapshot({
    episodePackage: args.episodePackage, launchVariantId: args.launchVariantId,
    baseVersionId: base.id, recipeId: recipe.id, recipeRevision: recipe.revision,
    snapshot, createdAt: args.createdAt,
  });
  const launchIndex = next.thumbnail.launch_variant_revisions.length - 1;
  const before = await readCanonicalEpisodePackageV3(args.workpieceId);
  if ((before.metadataUpdatedAt ?? null) !== (args.expectedMetadataUpdatedAt ?? null)) {
    return { ok: false, saveState: "error", status: 409, error: "Thumbnail state changed while the composite was rendering.", canonical: before };
  }
  const pointer = `/episode/thumbnail/launch_variant_revisions/${launchIndex}/snapshot/asset_id`;
  const referenceResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/commit-reference`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: {
      workspace_id: args.workspaceId, asset_id: assetId,
      expected_metadata_updated_at: args.expectedMetadataUpdatedAt,
      metadata_document: { ...before.metadata, updated_at: args.createdAt, episode: next }, reference_pointer: pointer,
    },
  });
  if (!referenceResponse.ok) return { ok: false, saveState: "error", status: referenceResponse.status, error: errorMessage(await json(referenceResponse), "Unable to commit launch snapshot reference.") };
  const readyResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/transition`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: { workspace_id: args.workspaceId, asset_id: assetId, target_status: "ready" },
  });
  if (!readyResponse.ok) return { ok: false, saveState: "error", status: readyResponse.status, error: errorMessage(await json(readyResponse), "Launch snapshot remains recoverable but is not ready.") };
  const canonical = await readCanonicalEpisodePackageV3(args.workpieceId);
  const latest = next.thumbnail.launch_variant_revisions[launchIndex]!;
  const proof = proveThumbnailMutation({ expected: next, canonical: canonical.episodePackage, kind: "launch_revision", entityId: args.launchVariantId, revision: latest.revision });
  if (!proof.ok) return { ok: false, saveState: "error", status: 409, error: proof.reason, canonical };
  const persistedLaunch = canonical.episodePackage.thumbnail.launch_variant_revisions.find(
    (entry) => entry.launch_variant_id === latest.launch_variant_id && entry.revision === latest.revision,
  );
  const persistedRecipe = persistedLaunch && canonical.episodePackage.thumbnail.render_recipes.find(
    (entry) => entry.id === persistedLaunch.recipe_id && entry.revision === persistedLaunch.recipe_revision,
  );
  if (!persistedLaunch || !persistedRecipe
    || persistedRecipe.treatment.placement.vertical !== recipe.treatment.placement.vertical
    || persistedRecipe.presentation_override?.logo_placement !== recipe.presentation_override?.logo_placement
    || persistedLaunch.snapshot.recipe_snapshot.placement !== recipeSnapshot.placement
    || persistedLaunch.snapshot.recipe_snapshot.presentation_override?.logo_placement !== recipeSnapshot.presentation_override?.logo_placement
    || persistedLaunch.snapshot.asset_id !== assetId
    || persistedLaunch.snapshot.asset_path !== assetPath
    || persistedLaunch.snapshot.content_hash !== contentHash) {
    return { ok: false, saveState: "error", status: 409,
      error: "Tongs saved a thumbnail revision, but its canonical recipe, launch, or rendered asset does not match the requested edit.", canonical };
  }
  return { ok: true, saveState: "saved", ...canonical, launchReceipt: {
    launchVariantId: persistedLaunch.launch_variant_id, launchRevision: persistedLaunch.revision,
    recipeId: persistedRecipe.id, recipeRevision: persistedRecipe.revision,
    assetId: persistedLaunch.snapshot.asset_id, assetPath: persistedLaunch.snapshot.asset_path,
    contentHash: persistedLaunch.snapshot.content_hash,
  } };
}

export async function commitThumbnailPublicationSnapshot(args: {
  workpieceId: string;
  workspaceId: string;
  expectedMetadataUpdatedAt: string | null;
  episodePackage: EpisodePackageV3;
  publicationEventId: string;
  launchVariantId: string;
  launchVariantRevision: number;
  destination: string;
  operationId: string;
  width: number;
  height: number;
  encoding: { format: "png" | "jpeg" | "webp"; quality: number };
  publishedAt: string;
}): Promise<V3MutationResult> {
  const launch = args.episodePackage.thumbnail.launch_variant_revisions.find(
    (entry) => entry.launch_variant_id === args.launchVariantId && entry.revision === args.launchVariantRevision,
  );
  if (!launch) return { ok: false, saveState: "error", status: 409, error: "Publish requires an exact launch revision." };
  const recipe = [...args.episodePackage.thumbnail.render_recipes]
    .filter((entry) => entry.id === launch.recipe_id)
    .sort((left, right) => right.revision - left.revision)[0];
  if (!recipe) return { ok: false, saveState: "error", status: 409, error: "Publish recipe authority is unavailable." };
  const token = await requireThumbnailUserToken();
  const launchAssetResponse = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/${encodeURIComponent(launch.snapshot.asset_id)}`,
    { method: "GET", headers: { "x-forge-user-authorization": `Bearer ${token}` } },
  );
  const launchAssetBody = await json(launchAssetResponse);
  const launchAsset = isRecord(launchAssetBody) && isRecord(launchAssetBody.data) ? launchAssetBody.data : null;
  const launchAssetIsCanonical = launchAssetResponse.ok
    && readString(launchAsset?.status) === "ready"
    && readString(launchAsset?.content_hash) === launch.snapshot.content_hash;

  let snapshot = launch.snapshot;
  let stagedNewAsset = false;
  if (!launchAssetIsCanonical || !canReuseLaunchSnapshotForPublish({
    launchRevision: launch,
    recipeRevision: recipe.revision,
    compositionEngineVersion: recipe.composition_engine_version,
    contentHash: launch.snapshot.content_hash,
  })) {
    const base = args.episodePackage.thumbnail.base_versions.find((entry) => entry.id === launch.base_version_id);
    if (!base || base.status !== "ready") return { ok: false, saveState: "error", status: 409, error: "Publish requires hash-verified base artwork." };
    const recipeSnapshot = compositorRecipe(recipe);
    const recipeHash = await sha256Canonical(recipeSnapshot);
    const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/render-composite`, {
      method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` },
      json: { workspace_id: args.workspaceId, operation_id: args.operationId, base_asset_id: base.asset_id,
        recipe_snapshot: recipeSnapshot, recipe_snapshot_hash: recipeHash,
        requested_style_source: launch.snapshot.style_source ?? "auto",
        width: args.width, height: args.height, encoding: args.encoding },
    });
    const body = await json(response);
    const asset = isRecord(body) && isRecord(body.data) ? body.data : null;
    const assetId = readString(asset?.id); const assetPath = readString(asset?.path); const contentHash = readString(asset?.content_hash);
    const assetMetadata = isRecord(asset?.metadata) ? asset.metadata : {};
    if (!response.ok || !assetId || !assetPath || !contentHash) {
      return { ok: false, saveState: "error", status: response.status, error: errorMessage(body, "Unable to render publish snapshot.") };
    }
    snapshot = { asset_id: assetId, asset_path: assetPath, content_hash: contentHash,
      composition_engine_version: recipe.composition_engine_version, recipe_snapshot: recipeSnapshot,
      recipe_snapshot_hash: recipeHash,
      style_source: assetMetadata.style_source === "forge_standard" ? "forge_standard" : "brand_profile",
      style_application_provenance: isRecord(assetMetadata.style_application_provenance) ? assetMetadata.style_application_provenance : null,
      style_provenance_hash: readString(assetMetadata.style_provenance_hash),
      brand_binding_context: isRecord(assetMetadata.brand_binding_context) ? assetMetadata.brand_binding_context : null,
      brand_application_provenance: isRecord(assetMetadata.brand_application_provenance) ? assetMetadata.brand_application_provenance : null,
      brand_logo_asset_revision_id: readString(assetMetadata.brand_logo_asset_revision_id),
      readability_evidence: isRecord(assetMetadata.readability_evidence) ? assetMetadata.readability_evidence as ThumbnailCompositeSnapshot["readability_evidence"] : null,
      exported_at: args.publishedAt };
    stagedNewAsset = true;
  }

  const event: ThumbnailPublicationEvent = { id: args.publicationEventId, launch_variant_id: launch.launch_variant_id,
    launch_variant_revision: launch.revision, snapshot, published_at: args.publishedAt, destination: args.destination };
  const next = appendPublicationEvent({ episodePackage: args.episodePackage, event });
  if (!stagedNewAsset) {
    return commitEpisodePackageV3Mutation({ workpieceId: args.workpieceId,
      expectedMetadataUpdatedAt: args.expectedMetadataUpdatedAt, nextEpisodePackage: next,
      mutation: { kind: "publication_event", entityId: event.id }, eventName: "hearth.thumbnail.publication.recorded.v3" });
  }

  const before = await readCanonicalEpisodePackageV3(args.workpieceId);
  if ((before.metadataUpdatedAt ?? null) !== (args.expectedMetadataUpdatedAt ?? null)) {
    return { ok: false, saveState: "error", status: 409, error: "Thumbnail state changed while the publish snapshot was rendering.", canonical: before };
  }
  const eventIndex = next.thumbnail.publication_events.length - 1;
  const reference = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/commit-reference`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: { workspace_id: args.workspaceId, asset_id: snapshot.asset_id,
      expected_metadata_updated_at: args.expectedMetadataUpdatedAt,
      metadata_document: { ...before.metadata, updated_at: args.publishedAt, episode: next },
      reference_pointer: `/episode/thumbnail/publication_events/${eventIndex}/snapshot/asset_id` },
  });
  if (!reference.ok) return { ok: false, saveState: "error", status: reference.status, error: errorMessage(await json(reference), "Unable to commit publish snapshot reference.") };
  const ready = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/transition`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: { workspace_id: args.workspaceId, asset_id: snapshot.asset_id, target_status: "ready" },
  });
  if (!ready.ok) return { ok: false, saveState: "error", status: ready.status, error: errorMessage(await json(ready), "Publish snapshot remains recoverable but is not ready.") };
  const canonical = await readCanonicalEpisodePackageV3(args.workpieceId);
  const proof = proveThumbnailMutation({ expected: next, canonical: canonical.episodePackage, kind: "publication_event", entityId: event.id });
  if (!proof.ok) return { ok: false, saveState: "error", status: 409, error: proof.reason, canonical };
  return { ok: true, saveState: "saved", ...canonical };
}
