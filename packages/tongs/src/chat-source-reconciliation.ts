export type ChatUrlEvidence={draftId:string;messageIndex:number;role:string;url:string;normalizedUrl:string;host:string;excerptHash:string};
export type RecoveredChatSource={normalized_url:string;host:string;title:string;source_type:"webpage";message_evidence:Array<{draft_id:string;message_index:number;role:string;excerpt_hash:string}>};
export type VisualSourceMatch={family:"reference_clip"|"reference_visual";opportunity_id:string;opportunity_text:string;normalized_url:string|null;status:"exact"|"ambiguous"|"unmatched";candidate_urls:string[];reason:string};

const URL_RE=/https?:\/\/[^\s<>{}\x5B\]"'`]+/gi;
const TRACKING_KEYS=new Set(["fbclid","gclid","dclid","mc_cid","mc_eid","ref","ref_src","source"]);
const trimEnd=(value:string)=>value.replace(/[),.;!?\]}]+$/g,"");
export function normalizeRecoveredUrl(raw:string):string|null{
 try{const url=new URL(trimEnd(raw));if(url.protocol!=="http:"&&url.protocol!=="https:")return null;url.hash="";for(const key of [...url.searchParams.keys()])if(key.toLowerCase().startsWith("utm_")||TRACKING_KEYS.has(key.toLowerCase()))url.searchParams.delete(key);url.hostname=url.hostname.toLowerCase();if(url.pathname!=="/")url.pathname=url.pathname.replace(/\/+$/,"");url.searchParams.sort();return url.toString();}catch{return null;}
}
const words=(value:string)=>new Set(value.toLowerCase().replace(/https?:\/\/\S+/g," ").replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(word=>word.length>3));
const overlap=(left:Set<string>,right:Set<string>)=>{let count=0;for(const word of left)if(right.has(word))count++;return count;};
export async function extractRecoveredChatSources(snapshot:unknown,hash:(value:string)=>Promise<string>):Promise<RecoveredChatSource[]>{
 if(!snapshot||typeof snapshot!=="object"||Array.isArray(snapshot))return[];const grouped=new Map<string,RecoveredChatSource>();const root=snapshot as Record<string,unknown>;const chatMap=root.chats&&typeof root.chats==="object"&&!Array.isArray(root.chats)?root.chats as Record<string,unknown>:root;
 for(const[draftId,entry]of Object.entries(chatMap)){if(!entry||typeof entry!=="object"||Array.isArray(entry))continue;const messages=(entry as{messages?:unknown}).messages;if(!Array.isArray(messages))continue;
  for(let messageIndex=0;messageIndex<messages.length;messageIndex++){const message=messages[messageIndex];if(!message||typeof message!=="object"||Array.isArray(message))continue;const content=String((message as{content?:unknown}).content??"");const role=String((message as{role?:unknown}).role??"unknown");for(const found of content.matchAll(URL_RE)){const normalized=normalizeRecoveredUrl(found[0]);if(!normalized)continue;const url=new URL(normalized);const evidence={draft_id:draftId,message_index:messageIndex,role,excerpt_hash:await hash(content)};const current=grouped.get(normalized);if(current){if(!current.message_evidence.some(item=>item.draft_id===draftId&&item.message_index===messageIndex))current.message_evidence.push(evidence);}else grouped.set(normalized,{normalized_url:normalized,host:url.hostname.replace(/^www\./,""),title:url.hostname.replace(/^www\./,""),source_type:"webpage",message_evidence:[evidence]});}}
	 }
 return[...grouped.values()].sort((a,b)=>a.normalized_url.localeCompare(b.normalized_url));
}
export function proposeVisualSourceMatches(sources:RecoveredChatSource[],opportunities:Array<{family:"reference_clip"|"reference_visual";id:string;text:string}>):VisualSourceMatch[]{
 return opportunities.map(opportunity=>{const target=words(opportunity.text);const ranked=sources.map(source=>{const url=new URL(source.normalized_url),brand=source.host.split(".")[0]??"";const haystack=words(`${source.host} ${decodeURIComponent(url.pathname)}`),score=overlap(target,haystack),brandMatch=brand.length>3&&opportunity.text.toLowerCase().includes(brand.toLowerCase());return{source,score,brandMatch};}).filter(item=>item.brandMatch||item.score>=2).sort((a,b)=>Number(b.brandMatch)-Number(a.brandMatch)||b.score-a.score||a.source.normalized_url.localeCompare(b.source.normalized_url));
  const opportunityText=opportunity.text.trim();if(!ranked.length)return{family:opportunity.family,opportunity_id:opportunity.id,opportunity_text:opportunityText,normalized_url:null,status:"unmatched",candidate_urls:[],reason:"No recovered URL has unique textual evidence for this opportunity."};
  const top=ranked[0]!,candidates=ranked.filter(item=>item.brandMatch===top.brandMatch&&item.score===top.score).map(item=>item.source.normalized_url);return candidates.length===1?{family:opportunity.family,opportunity_id:opportunity.id,opportunity_text:opportunityText,normalized_url:candidates[0]!,status:"exact",candidate_urls:candidates,reason:"Unique hostname/path evidence matches the opportunity wording."}:{family:opportunity.family,opportunity_id:opportunity.id,opportunity_text:opportunityText,normalized_url:null,status:"ambiguous",candidate_urls:candidates,reason:`Multiple recovered URLs have equal supporting evidence for: ${opportunityText}`};
 });
}
