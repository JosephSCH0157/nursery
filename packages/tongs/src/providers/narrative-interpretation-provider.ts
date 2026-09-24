import type { BoundedProviderRequest } from "./bounded-provider-request.js";

export type ImagePromptVisualBrief = {
  narrative_purpose: string;
  central_message: string;
  primary_subjects: string[];
  relationship_or_action: string;
  emotional_tone: string;
  visual_mode: "literal"|"documentary"|"editorial"|"metaphorical"|"historical_reconstruction"|"diagrammatic";
  setting: string;
  composition: string;
  essential_visual_evidence: string[];
  avoid: string[];
  source_context: { before: string|null; focus: string; after: string|null };
};
export type InterpretImagePromptInput={request:Record<string,unknown>;model?:string|null;boundedProviderRequest?:BoundedProviderRequest;coordinatedExecution?:<T>(execute:()=>Promise<T>)=>Promise<T>};
export type InterpretImagePromptOutput={brief:ImagePromptVisualBrief;rawResponse:Record<string,unknown>;rawResponseText:string;providerRequestId:string|null;inputTokens:number;outputTokens:number;totalTokens:number;model:string};
export interface NarrativeInterpretationProvider{interpret(input:InterpretImagePromptInput):Promise<InterpretImagePromptOutput>}

export const NARRATIVE_INTERPRETATION_MODEL="gpt-5.6-luna";
export const NARRATIVE_INTERPRETATION_CONTRACT_VERSION="forge.image-prompt-interpretation.v2";
export const NARRATIVE_INTERPRETATION_VALIDATOR_VERSION="forge.image-prompt-validator.v2";
export const NARRATIVE_INTERPRETATION_SYNTHESIS_VERSION="forge.image-prompt-synthesis.v3";
export const NARRATIVE_INTERPRETATION_MAXIMUM_INPUT_TOKENS=4096;
export const NARRATIVE_INTERPRETATION_MAXIMUM_OUTPUT_TOKENS=1024;
export const NARRATIVE_INTERPRETATION_MAXIMUM_RESPONSE_BYTES=16384;
export const NARRATIVE_INTERPRETATION_MAXIMUM_ATTEMPTS=1;

export function buildImagePromptSemanticAuthority(input:{
  imageMomentId:string;scriptApprovalId:string;scriptApprovalRevision:number;
  sourceContext:{before:string|null;focus:string;after:string|null};creatorDirection:string;visualStyle:string|null;
}):Record<string,unknown>{
  return{
    image_moment_id:input.imageMomentId,script_approval_id:input.scriptApprovalId,
    script_approval_revision:input.scriptApprovalRevision,
    source_context:{before:input.sourceContext.before,focus:input.sourceContext.focus,after:input.sourceContext.after},
    creator_direction:input.creatorDirection,visual_style:input.visualStyle,
    contracts:{interpretation:NARRATIVE_INTERPRETATION_CONTRACT_VERSION,validator:NARRATIVE_INTERPRETATION_VALIDATOR_VERSION,synthesis:NARRATIVE_INTERPRETATION_SYNTHESIS_VERSION},
  };
}

const required=["narrative_purpose","central_message","primary_subjects","relationship_or_action","emotional_tone","visual_mode","setting","composition","essential_visual_evidence","avoid","source_context"];
const briefSchema={type:"object",additionalProperties:false,required,properties:{
  narrative_purpose:{type:"string"},central_message:{type:"string"},primary_subjects:{type:"array",items:{type:"string"},minItems:1,maxItems:4},relationship_or_action:{type:"string"},emotional_tone:{type:"string"},visual_mode:{type:"string",enum:["literal","documentary","editorial","metaphorical","historical_reconstruction","diagrammatic"]},setting:{type:"string"},composition:{type:"string"},essential_visual_evidence:{type:"array",items:{type:"string"},minItems:1,maxItems:5},avoid:{type:"array",items:{type:"string"},minItems:1,maxItems:5},source_context:{type:"object",additionalProperties:false,required:["before","focus","after"],properties:{before:{type:["string","null"]},focus:{type:"string"},after:{type:["string","null"]}}}
}};
const systemInstruction=`Interpret one canonical podcast image moment before writing any image prompt. Return concrete, moment-specific visual meaning. Name visible people, products, objects, actions, and supported environments. Interpret rivalry, cooperation, decline, transformation, and figurative language from context. Keep the brief selective: 1-4 primary subjects, one concise action or relationship, a one-sentence setting, a mood phrase, composition in at most two short sentences, 1-5 essential visible details, and 1-5 specific exclusions. Each list item should name one defining detail, not a scene-within-a-scene. Never substitute generic phrases such as appropriate context, supporting the stated narrative idea, clear editorial hierarchy, visual evidence of the idea, or grounded and documentary. Do not write a vendor prompt or request multiple candidates, alternate angles, or multiple interpretations. Return only the structured brief.`;

export function buildNarrativeInterpretationCanonicalInput(input:{
  imageMomentId:string;
  imageMapRevisionId:string;
  imageMapRevision:number;
  scriptApprovalId:string;
  scriptApprovalRevision:number;
  sourceContext:{before:string|null;focus:string;after:string|null};
  creatorDirection:string;
  visualStyle:string|null;
}):Record<string,unknown>{
  return{
    image_moment_id:input.imageMomentId,
    image_map_revision_id:input.imageMapRevisionId,
    image_map_revision:input.imageMapRevision,
    script_approval_id:input.scriptApprovalId,
    script_approval_revision:input.scriptApprovalRevision,
    source_context:input.sourceContext,
    creator_direction:input.creatorDirection,
    visual_style:input.visualStyle,
    output_contract:{
      interpretation:NARRATIVE_INTERPRETATION_CONTRACT_VERSION,
      validator:NARRATIVE_INTERPRETATION_VALIDATOR_VERSION,
      synthesis:NARRATIVE_INTERPRETATION_SYNTHESIS_VERSION,
    },
  };
}

export function buildNarrativeInterpretationProviderRequestBody(input:{request:Record<string,unknown>;model:string}):Record<string,unknown>{
  return{model:input.model,instructions:systemInstruction,input:JSON.stringify(input.request),text:{format:{type:"json_schema",name:"image_prompt_visual_brief",strict:true,schema:briefSchema}}};
}

function outputText(payload:Record<string,unknown>):string|null{
  const output=payload.output;if(!Array.isArray(output))return null;
  for(const item of output){if(!item||typeof item!=="object")continue;const content=(item as Record<string,unknown>).content;if(!Array.isArray(content))continue;for(const part of content){if(part&&typeof part==="object"&&typeof (part as Record<string,unknown>).text==="string")return (part as Record<string,string>).text;}}
  return null;
}
export class OpenAiNarrativeInterpretationProvider implements NarrativeInterpretationProvider{
  private readonly apiKey:string;
  private readonly defaultModel:string;
  constructor(apiKey:string,defaultModel=NARRATIVE_INTERPRETATION_MODEL){
    if(!apiKey.trim())throw new Error("OpenAI interpretation API key is required");
    this.apiKey=apiKey;
    this.defaultModel=defaultModel;
  }
  async interpret(input:InterpretImagePromptInput):Promise<InterpretImagePromptOutput>{
    const model=input.model?.trim()||this.defaultModel;
    let response:Response;
    try{const executeLegacy=()=>fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${this.apiKey}`,"content-type":"application/json"},body:input.boundedProviderRequest?.serializedBody??JSON.stringify(buildNarrativeInterpretationProviderRequestBody({request:input.request,model}))});response=await executeOpenAiTextTransport({routeCode:"visual.narrative_interpretation",executeLegacy,coordinatedExecution:input.coordinatedExecution?()=>input.coordinatedExecution!(executeLegacy):undefined});}
    catch(error){
      if(error instanceof OpenAiTextBoundaryError||error instanceof OpenAiTextProviderError)throw error;
      const cause=error instanceof Error&&error.cause&&typeof error.cause==="object"?error.cause as {code?:unknown;message?:unknown}:null;
      const detail=typeof cause?.code==="string"?cause.code:typeof cause?.message==="string"?cause.message:null;
      throw new OpenAiTextProviderError(`OpenAI could not be reached while creating the detailed image prompt${detail?` (${detail})`:""}; no prompt or image was lost. The submission is unresolved and was not retried.`,true,null,{phase:"provider_transport",route_code:"visual.narrative_interpretation"});
    }
    const rawText=await response.text();
    if(new TextEncoder().encode(rawText).byteLength>NARRATIVE_INTERPRETATION_MAXIMUM_RESPONSE_BYTES)throw new Error("Interpretation provider response exceeds the certified byte ceiling");
    let payload:Record<string,unknown>={};try{payload=JSON.parse(rawText) as Record<string,unknown>}catch{/* Invalid JSON is reported through the response status or missing-output checks below. */}
    if(!response.ok)throw new Error((payload.error as {message?:string}|undefined)?.message||rawText||`Interpretation failed (${response.status})`);
    const text=outputText(payload);
    let brief:ImagePromptVisualBrief;
    try{brief=(text?JSON.parse(text):{}) as ImagePromptVisualBrief;}catch{brief={} as ImagePromptVisualBrief;}
    const usage=(payload.usage&&typeof payload.usage==="object"?payload.usage:{}) as Record<string,unknown>;
    const inputTokens=typeof usage.input_tokens==="number"?usage.input_tokens:0;const outputTokens=typeof usage.output_tokens==="number"?usage.output_tokens:0;
    return{brief,rawResponse:payload,rawResponseText:rawText,providerRequestId:response.headers.get("x-request-id"),inputTokens,outputTokens,totalTokens:inputTokens+outputTokens,model};
  }
}

const genericPhrases=[/supporting the stated narrative idea/i,/contextually accurate environment/i,/clear editorial hierarchy/i,/visual evidence of (the idea|supporting)/i,/clear, grounded,? and documentary/i,/appropriate context/i,/make the relationship clear/i,/show the same story through .*different editorial reads/i,/offer alternate angles/i,/create multiple interpretations/i];
export function validateSubstantiveVisualBrief(brief:ImagePromptVisualBrief):string[]{
  const invalid:string[]=[];
  if(!brief||typeof brief!=="object"||new TextEncoder().encode(JSON.stringify(brief)).byteLength>NARRATIVE_INTERPRETATION_MAXIMUM_RESPONSE_BYTES)return["response"];
  const row=brief as unknown as Record<string,unknown>;
  const strings={narrative_purpose:row.narrative_purpose,central_message:row.central_message,relationship_or_action:row.relationship_or_action,emotional_tone:row.emotional_tone,setting:row.setting,composition:row.composition};
  for(const [key,value] of Object.entries(strings))if(typeof value!=="string"||!value.trim()||genericPhrases.some((pattern)=>pattern.test(value)))invalid.push(key);
  for(const [key,value,minimum,maximum] of [
    ["primary_subjects",row.primary_subjects,1,4],
    ["essential_visual_evidence",row.essential_visual_evidence,1,5],
    ["avoid",row.avoid,1,5],
  ] as const)if(!Array.isArray(value)||value.length<minimum||value.length>maximum||value.some((entry)=>typeof entry!=="string"||!entry.trim()||genericPhrases.some((pattern)=>pattern.test(entry))))invalid.push(key);
  if(!["literal","documentary","editorial","metaphorical","historical_reconstruction","diagrammatic"].includes(String(row.visual_mode??"")))invalid.push("visual_mode");
  const source=row.source_context;
  if(!source||typeof source!=="object"||Array.isArray(source)||typeof (source as Record<string,unknown>).focus!=="string"||!(source as Record<string,string>).focus.trim())invalid.push("source_context");
  return [...new Set(invalid)];
}
function cleanPromptFragment(value:string):string{
  return value.trim().replace(/\s+/g," ").replace(/[.;:,\s]+$/g,"");
}
function promptMeaningKey(value:string):string{
  return cleanPromptFragment(value).toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
}
function meaningAlreadyPresent(value:string,accepted:readonly string[],overlapThreshold=0.8):boolean{
  const candidate=promptMeaningKey(value);
  if(!candidate)return true;
  return accepted.some((existing)=>{
    const key=promptMeaningKey(existing);
    if(!key)return false;
    if(key.includes(candidate)||candidate.includes(key))return true;
    const words=new Set(candidate.split(" ").filter((word)=>word.length>3));
    const existingWords=new Set(key.split(" ").filter((word)=>word.length>3));
    if(words.size<3||existingWords.size<3)return false;
    let shared=0;for(const word of words)if(existingWords.has(word))shared+=1;
    return shared/Math.min(words.size,existingWords.size)>=overlapThreshold;
  });
}
function uniquePromptDetails(values:readonly string[],context:readonly string[]):string[]{
  const accepted:string[]=[];
  for(const value of values){
    const clean=cleanPromptFragment(value);
    if(clean&&!meaningAlreadyPresent(clean,[...context,...accepted]))accepted.push(clean);
  }
  return accepted;
}
function cleanExclusion(value:string):string{
  return cleanPromptFragment(value).replace(/^(?:avoid|exclude|do not show|don't show|do not|don't|no)\s+/i,"");
}
function sentence(value:string):string{
  const clean=cleanPromptFragment(value);
  return clean?`${clean}.`:"";
}
function compactSentences(value:string,maximum:number):string{
  const clean=cleanPromptFragment(value);
  if(!clean)return "";
  return clean.split(/(?<=[.!?])\s+/).slice(0,maximum).join(" ");
}
export function synthesizeConcreteVendorPrompt(brief:ImagePromptVisualBrief,style:string|null):string{
  const subjects=uniquePromptDetails(brief.primary_subjects,[]).slice(0,3);
  const action=compactSentences(brief.relationship_or_action,2);
  const opening=`Create a realistic ${brief.visual_mode.replaceAll("_"," ")} scene showing ${subjects.join(", ")}: ${action}.`;
  const accepted=[opening];
  const sceneParts:string[]=[];
  const setting=compactSentences(brief.setting,1);
  if(setting&&!meaningAlreadyPresent(setting,accepted)){sceneParts.push(`Set it in ${setting}.`);accepted.push(setting);}
  const centralMessage=compactSentences(brief.central_message,1);
  if(centralMessage&&!meaningAlreadyPresent(centralMessage,accepted,0.3)){sceneParts.push(sentence(centralMessage));accepted.push(centralMessage);}
  const directionParts:string[]=[];
  const mood=cleanPromptFragment(brief.emotional_tone).split(/\s+[—–]\s+/)[0]??"";
  if(mood&&!meaningAlreadyPresent(mood,accepted)){directionParts.push(`Keep the mood ${mood}.`);accepted.push(mood);}
  const composition=compactSentences(brief.composition,2);
  if(composition&&!meaningAlreadyPresent(composition,accepted)){directionParts.push(sentence(composition));accepted.push(composition);}
  const include=uniquePromptDetails(brief.essential_visual_evidence,accepted).slice(0,5);
  const avoid=uniquePromptDetails(brief.avoid.map(cleanExclusion),[]).slice(0,5);
  const sections=[opening,sceneParts.join(" "),directionParts.join(" "),include.length?`Include ${include.join(", ")}.`:null,avoid.length?`Avoid ${avoid.join(", ")}.`:null,style?`Style: ${cleanPromptFragment(style)}.`:null];
  return sections.filter((value):value is string=>Boolean(value?.trim())).join("\n\n");
}
import { OpenAiTextBoundaryError, executeOpenAiTextTransport } from "./openai-text-paid-boundary.js";
import { OpenAiTextProviderError } from "./paid-openai-text-execution-coordinator.js";
