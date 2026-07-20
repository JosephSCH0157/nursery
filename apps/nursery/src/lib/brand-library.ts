import type { BrandAsset, BrandAssetRevision, BrandAssetRole, BrandBindingMutation, BrandBindingMutationResult, BrandBindingResolutionResult, BrandProfile, BrandProfileRevision, BrandRules, WorkpieceBrandBinding } from "@forge/shared";
import { tongsSupabase } from "./supabase";

type RpcClient = { rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const client = tongsSupabase as unknown as RpcClient;
async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> { const { data, error } = await client.rpc(name, params); if (error) throw new Error(error.message); return data as T; }

export type BrandLibraryProjection = { profiles: Array<BrandProfile & { is_default: boolean }>; revisions: BrandProfileRevision[]; assets: BrandAsset[]; asset_revisions: BrandAssetRevision[] };
type BrandRevisionRpcRow = BrandProfileRevision & { rules_json?: BrandRules; validation_json?: BrandProfileRevision["validation"] };

export function normalizeBrandLibraryProjection(projection: BrandLibraryProjection): BrandLibraryProjection {
  return {
    ...projection,
    revisions: projection.revisions.map((revision) => {
      const row = revision as BrandRevisionRpcRow;
      const validation = row.validation ?? row.validation_json;
      return {
        ...revision,
        rules: row.rules ?? row.rules_json,
        validation: validation ?? {
          valid: false,
          bindable: false,
          errors: ["Brand revision validation metadata is unavailable."],
          verified_at: null,
          verification_version: "unavailable",
        },
      } as BrandProfileRevision;
    }),
  };
}
export const defaultBrandRules = (programName = "Untitled Program"): BrandRules => ({ public_identity: { program_name: programName, tagline: null },
  palette: { primary: "#111827", secondary: "#F8FAFC", accent: "#F97316" }, typography: { heading_family: "bold_sans", body_family: "sans-serif", heading_weight: 700, body_weight: 400 },
  logo: { placement: "bottom_right", watermark_opacity: 0.7 }, audio: { music_volume: 0.2, ducking: 0.35 }, asset_revision_ids: {} });

export async function operationFingerprint(value: unknown): Promise<string> {
  const stable = (input: unknown): string => Array.isArray(input) ? `[${input.map(stable).join(",")}]` : input && typeof input === "object"
    ? `{${Object.entries(input as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,entry])=>`${JSON.stringify(key)}:${stable(entry)}`).join(",")}}` : JSON.stringify(input);
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(stable(value))); return [...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,"0")).join("");
}

export const loadBrandLibrary = async (workspaceId: string, includeArchived = true) => normalizeBrandLibraryProjection(
  await rpc<BrandLibraryProjection>("list_workspace_brand_library", { p_workspace_id: workspaceId, p_include_archived: includeArchived }),
);
export const createBrandProfile = (workspaceId: string, label: string, rules: BrandRules) => rpc("create_brand_profile", { p_workspace_id: workspaceId, p_internal_label: label, p_rules: rules, p_operation_id: crypto.randomUUID() });
export const appendBrandProfileRevision = (workspaceId: string, profileId: string, rules: BrandRules) => rpc("append_brand_profile_revision", { p_workspace_id: workspaceId, p_profile_id: profileId, p_rules: rules, p_operation_id: crypto.randomUUID() });
export const setDefaultBrandProfile = (workspaceId: string, profileId: string) => rpc("set_workspace_default_brand_profile", { p_workspace_id: workspaceId, p_profile_id: profileId });
export const clearDefaultBrandProfile = (workspaceId: string) => rpc("clear_workspace_default_brand_profile", { p_workspace_id: workspaceId });
export const renameBrandProfile = (workspaceId: string, profileId: string, label: string) => rpc("rename_brand_profile", { p_workspace_id: workspaceId, p_profile_id: profileId, p_internal_label: label });
export const setBrandProfileArchived = (args: { workspaceId: string; profileId: string; archived: boolean; clearDefault?: boolean; replacementProfileId?: string | null }) => rpc("set_brand_profile_archived", { p_workspace_id: args.workspaceId, p_profile_id: args.profileId, p_archived: args.archived, p_clear_default: args.clearDefault ?? false, p_replacement_profile_id: args.replacementProfileId ?? null });

export async function uploadBrandAssetRevision(args:{workspaceId:string;profileId:string;assetId?:string|null;role:BrandAssetRole;label:string;file:File}):Promise<BrandAssetRevision>{
  const operationId=crypto.randomUUID(); const bytes=new Uint8Array(await args.file.arrayBuffer()); const digest=await crypto.subtle.digest("SHA-256",bytes); const hash=[...new Uint8Array(digest)].map((byte)=>byte.toString(16).padStart(2,"0")).join("");
  const fingerprint=await operationFingerprint({profileId:args.profileId,assetId:args.assetId??null,role:args.role,name:args.file.name,type:args.file.type,bytes:bytes.length,hash});
  const reserved=await rpc<BrandAssetRevision>("reserve_brand_asset_revision",{p_workspace_id:args.workspaceId,p_profile_id:args.profileId,p_asset_id:args.assetId??null,p_role:args.role,p_internal_label:args.label,p_filename:args.file.name,p_mime_type:args.file.type,p_operation_id:operationId,p_operation_fingerprint:fingerprint});
  if(reserved.state!=="ready"){
    const uploaded=await tongsSupabase.storage.from(reserved.storage_bucket).upload(reserved.storage_key,args.file,{contentType:args.file.type,upsert:false}); if(uploaded.error)throw new Error(uploaded.error.message);
    const readback=await tongsSupabase.storage.from(reserved.storage_bucket).download(reserved.storage_key); if(readback.error)throw new Error(readback.error.message);
    const actual=new Uint8Array(await readback.data.arrayBuffer()); const actualDigest=await crypto.subtle.digest("SHA-256",actual); const actualHash=[...new Uint8Array(actualDigest)].map((byte)=>byte.toString(16).padStart(2,"0")).join(""); if(actualHash!==hash||actual.length!==bytes.length)throw new Error("Canonical brand asset readback did not match uploaded bytes.");
    if(args.role==="video_intro"||args.role==="video_outro")return inspectBrandVideoRevision(reserved.id);
    return rpc("finalize_brand_asset_revision",{p_workspace_id:args.workspaceId,p_revision_id:reserved.id,p_operation_id:operationId,p_content_hash:hash,p_bytes:bytes.length,p_width:null,p_height:null,p_duration_ms:null,p_has_audio:null});
  } return reserved;
}

export async function inspectBrandVideoRevision(revisionId:string):Promise<BrandAssetRevision>{
  const {data,error}=await tongsSupabase.functions.invoke("inspect-brand-media",{body:{revision_id:revisionId}});
  if(error)throw new Error("Video inspection could not be completed. The uploaded file is safe and inspection can be retried.");
  const root=data as {ok?:boolean;revision?:BrandAssetRevision;error?:{message?:string}};
  if(root?.ok!==true||!root.revision)throw new Error(root?.error?.message??"Video inspection could not be completed. The uploaded file is safe and inspection can be retried.");
  return root.revision;
}

export async function resolveWorkpieceBrandDefault(args: { workspaceId: string; workpieceId: string; operationId: string }): Promise<BrandBindingResolutionResult> {
  const fingerprint=await operationFingerprint({ intent:"resolve_default",workspaceId:args.workspaceId,workpieceId:args.workpieceId });
  return rpc("resolve_workpiece_brand_default", { p_workspace_id:args.workspaceId,p_workpiece_id:args.workpieceId,p_operation_id:args.operationId,p_operation_fingerprint:fingerprint });
}
export async function mutateWorkpieceBrandBinding(args: { workspaceId:string;workpieceId:string;mutation:BrandBindingMutation }): Promise<BrandBindingMutationResult> {
  const fingerprint=await operationFingerprint({ workspaceId:args.workspaceId,workpieceId:args.workpieceId,...args.mutation });
  return rpc("mutate_workpiece_brand_binding", { p_workspace_id:args.workspaceId,p_workpiece_id:args.workpieceId,p_intent:args.mutation.intent,p_operation_id:args.mutation.operation_id,p_operation_fingerprint:fingerprint,p_expected_current_revision:args.mutation.expected_current_revision,p_profile_id:args.mutation.profile_id??null,p_profile_revision_id:args.mutation.profile_revision_id??null });
}
export const getWorkpieceBrandBinding=(workspaceId:string,workpieceId:string)=>rpc<WorkpieceBrandBinding|null>("get_workpiece_brand_binding",{p_workspace_id:workspaceId,p_workpiece_id:workpieceId});
