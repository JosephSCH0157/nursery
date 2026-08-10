export type UnifiedVisualPlanResult={
  images:Array<{context_before:string;context_focus:string;context_after:string;description:string;visual_intent:string;creator_direction:string;style:string;placement_hint:string}>;
  broll:Array<{context_before:string;context_focus:string;context_after:string;narrative_purpose:string;placement_hint:string;duration_target_ms:number;shot_type:string;motion_intent:string;mood_pacing:string;asset_category:string}>;
  reference_clips:Array<{context_before:string;context_focus:string;context_after:string;editorial_reason:string;desired_material:string;search_terms:string[];narrative_purpose:string;placement_hint:string;duration_target_ms:number}>;
  reference_visuals:Array<{context_before:string;context_focus:string;context_after:string;visual_subtype:"chart"|"timeline"|"document_excerpt"|"quote_card"|"stat_card"|"comparison"|"archival_still"|"archival_sequence";editorial_reason:string;audience_understanding:string;required_evidence:string;required_source_type:string;desired_material:string;search_terms:string[];placement_hint:string;duration_target_ms:number;creator_direction:string}>;
};
export type UnifiedVisualPlanProviderOutput={plan:UnifiedVisualPlanResult;rawResponse:Record<string,unknown>;providerRequestId:string|null;inputTokens:number;outputTokens:number;totalTokens:number;model:string};
export interface UnifiedVisualPlanProvider{generate(input:{scriptText:string;creatorDirection:string|null;model?:string|null}):Promise<UnifiedVisualPlanProviderOutput>}

const itemContext={context_before:{type:"string"},context_focus:{type:"string"},context_after:{type:"string"}} as const;
const schema={type:"object",additionalProperties:false,required:["images","broll","reference_clips","reference_visuals"],properties:{
  images:{type:"array",minItems:0,maxItems:18,items:{type:"object",additionalProperties:false,required:["context_before","context_focus","context_after","description","visual_intent","creator_direction","style","placement_hint"],properties:{...itemContext,description:{type:"string"},visual_intent:{type:"string"},creator_direction:{type:"string"},style:{type:"string"},placement_hint:{type:"string"}}}},
  broll:{type:"array",minItems:0,maxItems:8,items:{type:"object",additionalProperties:false,required:["context_before","context_focus","context_after","narrative_purpose","placement_hint","duration_target_ms","shot_type","motion_intent","mood_pacing","asset_category"],properties:{...itemContext,narrative_purpose:{type:"string"},placement_hint:{type:"string"},duration_target_ms:{type:"integer",minimum:1000,maximum:30000},shot_type:{type:"string"},motion_intent:{type:"string"},mood_pacing:{type:"string"},asset_category:{type:"string"}}}},
  reference_clips:{type:"array",minItems:0,maxItems:8,items:{type:"object",additionalProperties:false,required:["context_before","context_focus","context_after","editorial_reason","desired_material","search_terms","narrative_purpose","placement_hint","duration_target_ms"],properties:{...itemContext,editorial_reason:{type:"string"},desired_material:{type:"string"},search_terms:{type:"array",minItems:1,maxItems:8,items:{type:"string"}},narrative_purpose:{type:"string"},placement_hint:{type:"string"},duration_target_ms:{type:"integer",minimum:1000,maximum:30000}}}},
  reference_visuals:{type:"array",minItems:0,maxItems:8,items:{type:"object",additionalProperties:false,required:["context_before","context_focus","context_after","visual_subtype","editorial_reason","audience_understanding","required_evidence","required_source_type","desired_material","search_terms","placement_hint","duration_target_ms","creator_direction"],properties:{...itemContext,visual_subtype:{type:"string",enum:["chart","timeline","document_excerpt","quote_card","stat_card","comparison","archival_still","archival_sequence"]},editorial_reason:{type:"string"},audience_understanding:{type:"string"},required_evidence:{type:"string"},required_source_type:{type:"string"},desired_material:{type:"string"},search_terms:{type:"array",minItems:1,maxItems:8,items:{type:"string"}},placement_hint:{type:"string"},duration_target_ms:{type:"integer",minimum:250,maximum:120000},creator_direction:{type:"string"}}}}
}};
const instructions=`Create one mixed editorial visual plan from the exact approved podcast script. Images explain static concepts or moments. B-roll depicts newly produced motion coverage. Reference clips are real-world archival, historical, documentary, advertising, news, interview, or source media whose authenticity strengthens a passage. Reference visuals turn exact evidence into charts, timelines, excerpts, quote cards, stat cards, comparisons, or sourced archival still treatments. Planning is editorial only: never invent a Source, statistic, quote, URL, archive, rights claim, or existing asset. Every context_focus must be an exact nonempty excerpt from the supplied script. Use each class only where it is editorially justified; any category may intentionally be empty. Avoid quota filling and duplicated passages unless treatments are genuinely distinct. Return only the structured result.`;
function outputText(payload:Record<string,unknown>):string|null{const output=payload.output;if(!Array.isArray(output))return null;for(const item of output){if(!item||typeof item!=="object")continue;const content=(item as Record<string,unknown>).content;if(!Array.isArray(content))continue;for(const part of content){if(part&&typeof part==="object"&&typeof(part as Record<string,unknown>).text==="string")return(part as Record<string,string>).text;}}return null;}

export class OpenAiUnifiedVisualPlanProvider implements UnifiedVisualPlanProvider{
  private readonly apiKey:string;private readonly defaultModel:string;
  constructor(apiKey:string,defaultModel="gpt-5-mini"){if(!apiKey.trim())throw new Error("OpenAI visual-plan API key is required");this.apiKey=apiKey;this.defaultModel=defaultModel;}
  async generate(input:{scriptText:string;creatorDirection:string|null;model?:string|null}):Promise<UnifiedVisualPlanProviderOutput>{
    const model=input.model?.trim()||this.defaultModel;const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{authorization:`Bearer ${this.apiKey}`,"content-type":"application/json"},body:JSON.stringify({model,instructions,input:JSON.stringify({approved_script:input.scriptText,creator_direction:input.creatorDirection}),text:{format:{type:"json_schema",name:"unified_visual_plan",strict:true,schema}}})});
    const rawText=await response.text();let payload:Record<string,unknown>={};try{payload=JSON.parse(rawText)as Record<string,unknown>}catch{/* Invalid JSON is reported through the response status or missing-output checks below. */}
    if(!response.ok)throw new Error((payload.error as{message?:string}|undefined)?.message||rawText||`Visual planning failed (${response.status})`);const text=outputText(payload);if(!text)throw new Error("Visual-plan provider returned no structured output");const plan=JSON.parse(text)as UnifiedVisualPlanResult;const usage=(payload.usage&&typeof payload.usage==="object"?payload.usage:{})as Record<string,unknown>;const inputTokens=typeof usage.input_tokens==="number"?usage.input_tokens:0;const outputTokens=typeof usage.output_tokens==="number"?usage.output_tokens:0;return{plan,rawResponse:payload,providerRequestId:response.headers.get("x-request-id"),inputTokens,outputTokens,totalTokens:inputTokens+outputTokens,model};
  }
}

function escapeRegExp(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function exactScriptSpan(scriptText:string,candidate:string):string|null{
  const trimmed=candidate.trim();
  if(!trimmed)return null;
  if(scriptText.includes(trimmed))return trimmed;
  const tokens=trimmed.split(/\s+/).filter(Boolean);
  if(!tokens.length)return null;
  const matcher=new RegExp(tokens.map(escapeRegExp).join("\\s+"),"g");
  const matches=[...scriptText.matchAll(matcher)];
  if(matches.length===1&&typeof matches[0].index==="number")return scriptText.slice(matches[0].index,matches[0].index+matches[0][0].length);
  const exactSegments=trimmed.split(/\n+|(?<=[.!?])\s+/).map((part)=>part.trim()).filter((part)=>part.length>=12&&scriptText.indexOf(part)>=0&&scriptText.indexOf(part)===scriptText.lastIndexOf(part)).sort((left,right)=>right.length-left.length);
  return exactSegments[0]??null;
}

export function normalizeUnifiedVisualPlanContextAnchors(plan:UnifiedVisualPlanResult,scriptText:string):UnifiedVisualPlanResult{
  for(const kind of["images","broll","reference_clips","reference_visuals"]as const){
    for(const item of plan[kind]??[]){const exact=exactScriptSpan(scriptText,String(item.context_focus??""));if(exact)item.context_focus=exact;}
  }
  return plan;
}

export function validateUnifiedVisualPlan(plan:UnifiedVisualPlanResult,scriptText:string):string[]{const errors:string[]=[];for(const kind of["images","broll","reference_clips","reference_visuals"]as const){const items=plan[kind];if(!Array.isArray(items)){errors.push(`${kind}:array_required`);continue;}for(const[index,item]of items.entries()){if(!item||typeof item!=="object"){errors.push(`${kind}[${index}]:object_required`);continue;}const focus=String((item as{context_focus?:unknown}).context_focus??"").trim();if(!focus||!scriptText.includes(focus))errors.push(`${kind}[${index}]:context_focus_not_exact`);for(const[field,value]of Object.entries(item))if(field!=="context_before"&&field!=="context_after"&&typeof value==="string"&&!value.trim())errors.push(`${kind}[${index}]:${field}_required`);}}for(const kind of["reference_clips","reference_visuals"]as const)for(const[index,item]of(plan[kind]??[]).entries())if(!item.search_terms?.length||item.search_terms.some((term)=>!term.trim()))errors.push(`${kind}[${index}]:search_terms_required`);return[...new Set(errors)];}
