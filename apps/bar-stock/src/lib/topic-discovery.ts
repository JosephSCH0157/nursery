import { supabase } from "./supabase";

export type TopicSource = { id:string; title:string; canonical_url:string; publisher:string|null; published_at:string|null; retrieved_at:string };
export type TopicRevision = { id:string; headline:string; summary:string; suggested_angle:string; timeliness_reason:string; evidence_class:"single_authoritative"|"corroborated"|"limited" };
export type TopicCard = { ordinal:number; revision:TopicRevision; story:{id:string}; sources:TopicSource[]; accepted:boolean };
export type DiscoveryPreference = { revision:number; genre:string; topic_interests:string[]; editorial_scope:string|null; language:string|null; region:string|null; enabled:boolean; auto_refresh_authorized:boolean };
export type DiscoveryContext = { outcome:string; preference:DiscoveryPreference|null; run:{id:string;generated_at:string|null;fresh_until:string|null;status:string}|null; stories:TopicCard[] };

async function call(workspaceId:string, payload?:Record<string,unknown>, signal?:AbortSignal):Promise<DiscoveryContext>{
  const session=await supabase?.auth.getSession();
  const token=session?.data.session?.access_token;
  if(!token) throw new Error("Sign in required.");
  const response=await fetch(`/api/hearth/topic-discovery?workspace_id=${encodeURIComponent(workspaceId)}`,{method:payload?"POST":"GET",headers:{authorization:`Bearer ${token}`,...(payload?{"content-type":"application/json"}:{})},body:payload?JSON.stringify({workspace_id:workspaceId,...payload}):undefined,signal});
  const body=await response.json().catch(()=>null) as {ok?:boolean;data?:DiscoveryContext;error?:string}|null;
  if(!response.ok||!body?.ok||!body.data) throw new Error(body?.error||`Discovery request failed (${response.status}).`);
  return body.data;
}
export const readTopicDiscovery=(workspaceId:string,signal?:AbortSignal)=>call(workspaceId,undefined,signal);
export const saveTopicDiscoveryPreference=(workspaceId:string,input:Record<string,unknown>)=>call(workspaceId,{action:"preferences",...input});
export const refreshTopicDiscovery=(workspaceId:string,revision:number,trigger:"manual"|"automatic",operationKey:string,signal?:AbortSignal)=>call(workspaceId,{action:"refresh",preference_revision:revision,trigger,operation_key:operationKey},signal);
export const dismissTopicDiscovery=(workspaceId:string,storyId:string)=>call(workspaceId,{action:"dismiss",story_id:storyId});
export async function acceptTopicDiscovery(workspaceId:string,storyRevisionId:string,operationKey:string):Promise<{spark_id:string;workpiece_id:string;story_revision_id:string}>{
 const session=await supabase?.auth.getSession();const token=session?.data.session?.access_token;if(!token)throw new Error("Sign in required.");
 const response=await fetch(`/api/hearth/topic-discovery`,{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({action:"accept",workspace_id:workspaceId,story_revision_id:storyRevisionId,operation_key:operationKey})});
 const body=await response.json() as {ok?:boolean;data?:{outcome?:string;spark_id?:string;workpiece_id?:string;story_revision_id?:string};error?:string};
 if(!response.ok||!body.ok||!body.data?.workpiece_id)throw new Error(body.error||"Idea could not be saved.");return body.data as {spark_id:string;workpiece_id:string;story_revision_id:string};
}
