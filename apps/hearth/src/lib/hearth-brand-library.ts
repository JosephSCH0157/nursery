import type { BrandBindingProjection, BrandBindingResolutionResult, WorkpieceBrandBinding } from "@forge/shared";
import { canonicalContentHash, canonicalSerialize, type EpisodePackageV3 } from "./episode-package-v3";
import { resolveForgeUserAccessToken } from "./hearth-chat-api";
import { commitEpisodePackageV3Mutation, readCanonicalEpisodePackageV3, type CanonicalEpisodePackageV3 } from "./hearth-thumbnail-v3-api";

function config(){const env=(import.meta as unknown as {env?:Record<string,string|undefined>}).env;const runtime=typeof window==="undefined"?null:window as Window&typeof globalThis&{__forgeSupabaseUrl?:string;__forgeSupabaseAnonKey?:string;__forge_supabase_client__?:{supabaseUrl?:string;supabaseKey?:string}};const url=env?.VITE_SUPABASE_URL??runtime?.__forgeSupabaseUrl??runtime?.__forge_supabase_client__?.supabaseUrl;const key=env?.VITE_SUPABASE_ANON_KEY??runtime?.__forgeSupabaseAnonKey??runtime?.__forge_supabase_client__?.supabaseKey;return url&&key?{url,key}:null;}
async function rpc<T>(name:string,params:Record<string,unknown>):Promise<T>{const c=config();const token=await resolveForgeUserAccessToken();if(!c||!token)throw new Error("Brand Library authority is unavailable.");const response=await fetch(`${c.url}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:c.key,authorization:`Bearer ${token}`,"content-profile":"tongs","accept-profile":"tongs","content-type":"application/json"},body:JSON.stringify(params)});const body=await response.json().catch(()=>null) as T|{message?:string};if(!response.ok)throw new Error(body&&typeof body==="object"&&"message" in body&&body.message?body.message:`Brand authority request failed (${response.status}).`);return body as T;}

export async function ensureCanonicalBrandBinding(args:{workspaceId:string;workpieceId:string;canonical:CanonicalEpisodePackageV3}):Promise<CanonicalEpisodePackageV3>{
  const existing=await rpc<WorkpieceBrandBinding|null>("get_workpiece_brand_binding",{p_workspace_id:args.workspaceId,p_workpiece_id:args.workpieceId});
  let active=existing;
  if(!active){const operationId=crypto.randomUUID();const fingerprint=canonicalContentHash(canonicalSerialize({intent:"resolve_default",workspace_id:args.workspaceId,workpiece_id:args.workpieceId}));const resolved=await rpc<BrandBindingResolutionResult>("resolve_workpiece_brand_default",{p_workspace_id:args.workspaceId,p_workpiece_id:args.workpieceId,p_operation_id:operationId,p_operation_fingerprint:fingerprint});active=resolved.binding;}
  if(args.canonical.episodePackage.brand.binding?.active.id===active.id&&args.canonical.episodePackage.brand.binding.active.revision===active.revision)return args.canonical;
  let canonical=args.canonical;
  for(let attempt=0;attempt<2;attempt+=1){
    const prior=canonical.episodePackage.brand.binding?.history??[];const history=[...prior.filter((entry)=>entry.id!==active!.id),active];
    const projection:BrandBindingProjection={schema_version:"forge.workpiece-brand-binding.v1",active,history,verified_at:new Date().toISOString()};
    const next:EpisodePackageV3={...canonical.episodePackage,brand:{...canonical.episodePackage.brand,binding:projection}};
    const committed=await commitEpisodePackageV3Mutation({workpieceId:args.workpieceId,expectedMetadataUpdatedAt:canonical.metadataUpdatedAt,nextEpisodePackage:next,mutation:{kind:"brand_binding",entityId:active.id},eventName:"hearth.brand.binding.projected.v1",eventPayload:{binding_id:active.id,binding_revision:active.revision}});
    if(committed.ok)return committed;
    if(attempt===0&&committed.error==="File changed since last load"){
      const refreshed=await readCanonicalEpisodePackageV3(args.workpieceId);
      if(refreshed.episodePackage.brand.binding?.active.id===active.id&&refreshed.episodePackage.brand.binding.active.revision===active.revision)return refreshed;
      canonical=refreshed;
      continue;
    }
    throw new Error(committed.error);
  }
  throw new Error("Brand binding projection could not be verified.");
}
