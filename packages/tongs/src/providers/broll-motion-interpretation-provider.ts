export type BrollMotionBrief = {
  narrative_purpose: string;
  central_message: string;
  visible_subjects: string[];
  action_over_time: string;
  camera_behavior: string;
  start_frame: string;
  end_frame: string;
  target_duration: string;
  pacing: string;
  setting: string;
  mood: string;
  continuity: string;
  must_include: string[];
  avoid: string[];
  loopability: string;
};

export type InterpretBrollMotionInput = { request: Record<string, unknown>; model?: string | null; coordinatedExecution?: <T>(execute: () => Promise<T>) => Promise<T> };
export type InterpretBrollMotionOutput = { brief: BrollMotionBrief; rawResponse: Record<string, unknown>; providerRequestId: string | null; inputTokens: number; outputTokens: number; totalTokens: number; model: string };
export interface BrollMotionInterpretationProvider { interpret(input: InterpretBrollMotionInput): Promise<InterpretBrollMotionOutput> }

const required = ["narrative_purpose","central_message","visible_subjects","action_over_time","camera_behavior","start_frame","end_frame","target_duration","pacing","setting","mood","continuity","must_include","avoid","loopability"];
const schema = { type:"object", additionalProperties:false, required, properties:{
  narrative_purpose:{type:"string"}, central_message:{type:"string"}, visible_subjects:{type:"array",items:{type:"string"},minItems:1,maxItems:5},
  action_over_time:{type:"string"}, camera_behavior:{type:"string"}, start_frame:{type:"string"}, end_frame:{type:"string"}, target_duration:{type:"string"},
  pacing:{type:"string"}, setting:{type:"string"}, mood:{type:"string"}, continuity:{type:"string"}, must_include:{type:"array",items:{type:"string"},minItems:1,maxItems:6},
  avoid:{type:"array",items:{type:"string"},minItems:1,maxItems:6}, loopability:{type:"string"}
} };
const instructions = `Interpret one script-bound B-roll beat as moving footage. Use only the supplied before/focus/after context and canonical beat direction. State what visibly changes across time, what the camera does, distinct start and end frames, usable duration, setting, pacing, continuity, defining evidence, and exclusions. Never return a still-image composition with camera language appended. Never use generic filler such as support the narrative, appropriate environment, relevant visual evidence, make the motion clear, or cinematic movement. Do not request variants or multiple candidates. Return only the structured motion brief.`;

function outputText(payload:Record<string,unknown>):string|null { const output=payload.output;if(!Array.isArray(output))return null;for(const item of output){if(!item||typeof item!=="object")continue;const content=(item as Record<string,unknown>).content;if(!Array.isArray(content))continue;for(const part of content){if(part&&typeof part==="object"&&typeof (part as Record<string,unknown>).text==="string")return (part as Record<string,string>).text;}}return null; }

export class OpenAiBrollMotionInterpretationProvider implements BrollMotionInterpretationProvider {
  private readonly apiKey:string;
  private readonly defaultModel:string;
  constructor(apiKey:string,defaultModel="gpt-5-mini"){if(!apiKey.trim())throw new Error("OpenAI interpretation API key is required");this.apiKey=apiKey;this.defaultModel=defaultModel;}
  async interpret(input:InterpretBrollMotionInput):Promise<InterpretBrollMotionOutput>{
    const model=input.model?.trim()||this.defaultModel;
    const executeLegacy=()=>fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${this.apiKey}`,"content-type":"application/json"},body:JSON.stringify({model,instructions,input:JSON.stringify(input.request),text:{format:{type:"json_schema",name:"broll_motion_brief",strict:true,schema}}})});
    let response:Response;
    try{
      response=await executeOpenAiTextTransport({routeCode:"motion.broll_interpretation",executeLegacy,coordinatedExecution:input.coordinatedExecution?()=>input.coordinatedExecution!(executeLegacy):undefined});
    }catch(error){
      if(error instanceof OpenAiTextBoundaryError||error instanceof OpenAiTextProviderError)throw error;
      throw new OpenAiTextProviderError("OpenAI motion interpretation submission is unresolved and was not retried.",true,null,{phase:"provider_transport",route_code:"motion.broll_interpretation"});
    }
    const rawText=await response.text();let payload:Record<string,unknown>={};try{payload=JSON.parse(rawText) as Record<string,unknown>}catch{/* Invalid JSON is reported through the response status or missing-output checks below. */}
    if(!response.ok)throw new Error((payload.error as {message?:string}|undefined)?.message||rawText||`Motion interpretation failed (${response.status})`);
    const text=outputText(payload);if(!text)throw new Error("Motion interpretation provider returned no structured output");
    const brief=JSON.parse(text) as BrollMotionBrief;const usage=(payload.usage&&typeof payload.usage==="object"?payload.usage:{}) as Record<string,unknown>;
    const inputTokens=typeof usage.input_tokens==="number"?usage.input_tokens:0;const outputTokens=typeof usage.output_tokens==="number"?usage.output_tokens:0;
    return{brief,rawResponse:payload,providerRequestId:response.headers.get("x-request-id"),inputTokens,outputTokens,totalTokens:inputTokens+outputTokens,model};
  }
}

const generic=[/support (?:the|this) narrative/i,/appropriate environment/i,/relevant visual evidence/i,/make the motion clear/i,/cinematic movement/i,/show the idea/i,/visual interest/i];
const motionWords=/\b(move|moves|moving|travel|track|pan|tilt|dolly|push|pull|walk|drive|flow|shift|change|reveal|enter|exit|turn|rise|fall|open|close|focus|transition)\b/i;
function invalidText(value:string|undefined):boolean{return !value?.trim()||generic.some((pattern)=>pattern.test(value));}
export function validateBrollMotionBrief(brief:BrollMotionBrief):string[]{
  const invalid:string[]=[];
  for(const key of ["narrative_purpose","central_message","action_over_time","camera_behavior","start_frame","end_frame","target_duration","pacing","setting","mood","continuity","loopability"] as const)if(invalidText(brief[key]))invalid.push(key);
  for(const [key,value] of Object.entries({visible_subjects:brief.visible_subjects,must_include:brief.must_include,avoid:brief.avoid}))if(!Array.isArray(value)||!value.length||value.some((item)=>invalidText(item)))invalid.push(key);
  if(!motionWords.test(`${brief.action_over_time} ${brief.camera_behavior}`))invalid.push("action_over_time");
  if(brief.start_frame?.trim().toLowerCase()===brief.end_frame?.trim().toLowerCase())invalid.push("end_frame");
  if(!/\d+\s*(?:s|sec|second|ms)/i.test(brief.target_duration??""))invalid.push("target_duration");
  return [...new Set(invalid)];
}

function clean(value:string):string{return value.trim().replace(/\s+/g," ").replace(/[.;:,\s]+$/g,"");}
function finishFragment(value:string):string{return clean(value).replace(/\b(?:and|or|with|where|that|showing|to|from|of|in|on|at|by|for|the|a|an)$/i,"").replace(/[.;:,\s]+$/g,"");}
function firstCompleteClause(value:string):string{
  const normalized=clean(value).replace(/\s*\([^)]{1,100}\)/g,"");
  return finishFragment(normalized.split(/;\s+|(?<=[.!?])\s+/)[0]||normalized);
}
function conciseSubject(value:string):string{
  const normalized=clean(value).replace(/\s*\([^)]{1,100}\)/g,"");
  return finishFragment(normalized.split(/\b(?:with|where|that|showing|brushing|lining|to anchor|by the end)\b|,\s+/i)[0]||normalized);
}
function conciseList(values:string[],maxItems:number):string{return values.slice(0,maxItems).map(conciseSubject).filter(Boolean).join(", ");}
function wordLimit(value:string,maxWords:number):string{
  const words=clean(value).replace(/\s*\([^)]{1,100}\)/g,"").split(/\s+/).filter(Boolean);
  return finishFragment(words.slice(0,maxWords).join(" "));
}
function boundedSubject(value:string,maxWords:number):string{
  const subject=conciseSubject(value);
  return subject.split(/\s+/).length<=maxWords?subject:wordLimit(subject,maxWords);
}
function boundedClause(value:string,maxWords:number):string{
  const clause=firstCompleteClause(value);
  return clause.split(/\s+/).length<=maxWords?clause:wordLimit(clause,maxWords);
}
export function synthesizeBrollMotionPrompt(brief:BrollMotionBrief):string{
  const sections=[
    `Create a ${clean(brief.target_duration)} documentary motion shot showing ${conciseList(brief.visible_subjects,3)}.`,
    `${firstCompleteClause(brief.action_over_time)}.`,
    `Use ${firstCompleteClause(brief.camera_behavior)}.`,
    `Begin on ${firstCompleteClause(brief.start_frame.replace(/^[^:]{1,50}:\s*/,""))}; finish on ${firstCompleteClause(brief.end_frame.replace(/^[^:]{1,50}:\s*/,""))}.`,
    `Set it in ${firstCompleteClause(brief.setting)}, with a ${firstCompleteClause(brief.mood).toLowerCase()} mood and ${firstCompleteClause(brief.pacing).toLowerCase()} pacing.`,
    `The shot should communicate ${firstCompleteClause(brief.central_message).replace(/^[A-Z]/u,(letter)=>letter.toLowerCase())} and support ${firstCompleteClause(brief.narrative_purpose).replace(/^[A-Z]/u,(letter)=>letter.toLowerCase())}.`,
    `Keep ${conciseList(brief.must_include,3)} visible, and do not show ${conciseList(brief.avoid.map((value)=>clean(value).replace(/^(?:avoid|no|do not)\s+/i,"")),4)}.`
  ];
  const prompt=sections.filter(Boolean).join("\n");
  if(prompt.length<=1000)return prompt;
  const strict=[
    `Create a ${boundedSubject(brief.target_duration,4)} documentary motion shot showing ${brief.visible_subjects.slice(0,2).map((value)=>boundedSubject(value,5)).join(", ")}.`,
    `${boundedClause(brief.action_over_time,32)}.`,
    `Use ${boundedClause(brief.camera_behavior,16)}.`,
    `Begin on ${boundedSubject(brief.start_frame.replace(/^[^:]{1,50}:\s*/,""),12)}; finish on ${boundedSubject(brief.end_frame.replace(/^[^:]{1,50}:\s*/,""),12)}.`,
    `Set it in ${boundedSubject(brief.setting,10)}, with a ${boundedClause(brief.mood,8).toLowerCase()} mood and ${boundedClause(brief.pacing,8).toLowerCase()} pacing.`,
    `It should support ${boundedClause(brief.narrative_purpose,14).replace(/^[A-Z]/u,(letter)=>letter.toLowerCase())}.`,
    `Keep ${brief.must_include.slice(0,2).map((value)=>boundedClause(value,10)).join(", ")} visible, and do not show ${brief.avoid.slice(0,3).map((value)=>boundedSubject(clean(value).replace(/^(?:avoid|no|do not)\s+/i,""),6)).join(", ")}.`
  ].join("\n");
  if(strict.length<=1000)return strict;
  const ultra=[
    `Show ${brief.visible_subjects.slice(0,2).map((value)=>boundedSubject(value,4)).join(", ")} in motion.`,
    `${boundedClause(brief.action_over_time,16)}.`,
    `Use ${boundedClause(brief.camera_behavior,12)}.`,
    `Begin on ${boundedSubject(brief.start_frame.replace(/^[^:]{1,50}:\s*/,""),8)}; finish on ${boundedSubject(brief.end_frame.replace(/^[^:]{1,50}:\s*/,""),8)}.`,
    `Keep ${brief.must_include.slice(0,2).map((value)=>boundedClause(value,5)).join(", ")} visible, and do not show ${brief.avoid.slice(0,3).map((value)=>boundedSubject(clean(value).replace(/^(?:avoid|no|do not)\s+/i,""),3)).join(", ")}.`
  ].join("\n");
  if(ultra.length>1000)throw new Error(`Runway-ready B-roll prompt synthesis exceeded 1000 UTF-16 code units (${ultra.length}).`);
  return ultra;
}
import { OpenAiTextBoundaryError, executeOpenAiTextTransport } from "./openai-text-paid-boundary.js";
import { OpenAiTextProviderError } from "./paid-openai-text-execution-coordinator.js";
