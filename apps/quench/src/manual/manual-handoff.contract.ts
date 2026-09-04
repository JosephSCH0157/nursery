import type { ResolvedReleaseAssets } from "../core/asset-resolver";
import type { PlatformPublishOptions, ReleasePacket } from "../core/release-packet.types";

export const RUMBLE_UPLOAD_URL = "https://rumble.com/upload";
export const RUMBLE_MANUAL_CAPABILITIES = Object.freeze({
  provider: "rumble", execution_context: "manual_handoff", release_profiles: ["video_episode"],
  automated_upload: false, credentials_stored: false, automated_retry: false, provider_receipt: false,
  creator_decides_channel: true, creator_decides_licensing: true, creator_decides_monetization: true,
  creator_decides_syndication: true, creator_decides_premiere: true,
});

export type ManualHandoffValidation = { ok: boolean; errors: Array<{code:string;message:string}> };
export type RumbleManualIntent = { category: string; visibility: "private"|"unlisted"|"public"; intended_schedule: string|null };

export function validateRumbleManualHandoff(packet: ReleasePacket, assets: Partial<ResolvedReleaseAssets>, options: PlatformPublishOptions, intent: RumbleManualIntent): ManualHandoffValidation {
  const errors: ManualHandoffValidation["errors"]=[];
  if(!packet.video_export_id||!assets.video?.accessible)errors.push({code:"RUMBLE_VIDEO_REQUIRED",message:"A resolved final video is required."});
  if(!packet.thumbnail_asset_id||!assets.thumbnail?.accessible)errors.push({code:"RUMBLE_THUMBNAIL_REQUIRED",message:"A resolved thumbnail is required."});
  if(!packet.title?.trim())errors.push({code:"RUMBLE_TITLE_REQUIRED",message:"Title is required."});
  if(!packet.description?.trim())errors.push({code:"RUMBLE_DESCRIPTION_REQUIRED",message:"Description is required."});
  if(!packet.tags.length||packet.tags.some((tag)=>!tag.trim()))errors.push({code:"RUMBLE_TAGS_REQUIRED",message:"At least one valid tag is required."});
  if(!intent.category.trim())errors.push({code:"RUMBLE_CATEGORY_REQUIRED",message:"Choose an intended Rumble category."});
  if(options.mode==="premiere")errors.push({code:"RUMBLE_PREMIERE_CREATOR_DECISION",message:"Premiere must be chosen on Rumble, not in Quench."});
  if(options.mode==="schedule"&&!options.scheduled_for)errors.push({code:"RUMBLE_SCHEDULE_REQUIRED",message:"An intended schedule time is required."});
  return{ok:errors.length===0,errors};
}

export function buildRumbleManualHandoffSnapshot(packet: ReleasePacket, assets: Partial<ResolvedReleaseAssets>, options: PlatformPublishOptions, intent: RumbleManualIntent) {
  return {release_profile:"video_episode",provider:"rumble",execution_context:"manual_handoff",official_upload_url:RUMBLE_UPLOAD_URL,
    media:{video_asset_id:packet.video_export_id,video_uri:assets.video?.uri??null,thumbnail_asset_id:packet.thumbnail_asset_id,thumbnail_uri:assets.thumbnail?.uri??null},
    metadata:{title:options.title_override??packet.title,description:options.description_override??packet.description,tags:[...packet.tags],category:intent.category,visibility:intent.visibility,intended_schedule:options.mode==="schedule"?options.scheduled_for??null:null},
    creator_decisions_required:["licensing","monetization","channel","syndication","premiere"] as const};
}

export function isAllowedRumbleResultUrl(value:string):boolean{const match=/^https:\/\/([^/:?#]+)(?:[/:?#]|$)/i.exec(value.trim());return match?.[1]?.toLowerCase()==="rumble.com"||match?.[1]?.toLowerCase()==="www.rumble.com";}
