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

export type InterpretBrollMotionInput = { request: Record<string, unknown>; model?: string | null };
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
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${this.apiKey}`,"content-type":"application/json"},body:JSON.stringify({model,instructions,input:JSON.stringify(input.request),text:{format:{type:"json_schema",name:"broll_motion_brief",strict:true,schema}}})});
    const rawText=await response.text();let payload:Record<string,unknown>={};try{payload=JSON.parse(rawText) as Record<string,unknown>}catch{}
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
export function synthesizeBrollMotionPrompt(brief:BrollMotionBrief):string{
  const sections=[
    `${clean(brief.visible_subjects.join(", "))} in ${clean(brief.setting)}. ${clean(brief.action_over_time)}.`,
    `Camera: ${clean(brief.camera_behavior)}. Begin on ${clean(brief.start_frame)}; end on ${clean(brief.end_frame)}.`,
    `Mood and pacing: ${clean(brief.mood)}, ${clean(brief.pacing)}. Target usable duration: ${clean(brief.target_duration)}.`,
    `Include ${brief.must_include.map(clean).join(", ")}.`,
    `Continuity: ${clean(brief.continuity)}. Loop behavior: ${clean(brief.loopability)}.`,
    `Avoid ${brief.avoid.map((value)=>clean(value).replace(/^(?:avoid|no|do not)\s+/i,"")).join(", ")}.`
  ];
  return sections.filter(Boolean).join("\n\n");
}
