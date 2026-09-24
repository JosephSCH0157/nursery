import { assertSafeExternalMediaUrl } from "./broll-acquisition.js";

async function loadPdfDocument(bytes: Uint8Array) {
 const runtimeGlobals=globalThis as unknown as Record<string,unknown>;
 if(!runtimeGlobals.DOMMatrix){
  class ServerDomMatrix {
   a=1;b=0;c=0;d=1;e=0;f=0;
   constructor(values?:number[]){if(values&&values.length>=6)[this.a,this.b,this.c,this.d,this.e,this.f]=values.slice(0,6) as [number,number,number,number,number,number];}
   multiplySelf(other:ServerDomMatrix){const{a,b,c,d,e,f}=this;this.a=a*other.a+c*other.b;this.b=b*other.a+d*other.b;this.c=a*other.c+c*other.d;this.d=b*other.c+d*other.d;this.e=a*other.e+c*other.f+e;this.f=b*other.e+d*other.f+f;return this;}
   preMultiplySelf(other:ServerDomMatrix){const current=new ServerDomMatrix([this.a,this.b,this.c,this.d,this.e,this.f]);Object.assign(this,other);return this.multiplySelf(current);}
   translate(tx=0,ty=0){return new ServerDomMatrix([this.a,this.b,this.c,this.d,this.e,this.f]).multiplySelf(new ServerDomMatrix([1,0,0,1,tx,ty]));}
   scale(scaleX=1,scaleY=scaleX){return new ServerDomMatrix([this.a,this.b,this.c,this.d,this.e,this.f]).multiplySelf(new ServerDomMatrix([scaleX,0,0,scaleY,0,0]));}
   inverse(){const determinant=this.a*this.d-this.b*this.c;if(!determinant)return new ServerDomMatrix();return new ServerDomMatrix([this.d/determinant,-this.b/determinant,-this.c/determinant,this.a/determinant,(this.c*this.f-this.d*this.e)/determinant,(this.b*this.e-this.a*this.f)/determinant]);}
  }
  runtimeGlobals.DOMMatrix=ServerDomMatrix;
 }
 const {getDocument}=await import("pdfjs-dist/legacy/build/pdf.mjs");
 return getDocument({data:bytes,useSystemFonts:true,isEvalSupported:false}).promise;
}

const MAX_HTML_SOURCE_BYTES=5*1024*1024;
const MAX_PDF_SOURCE_BYTES=25*1024*1024;
const TIMEOUT_MS=20_000;
export type ReferenceSourceImageCandidate={url:string;alt:string|null;ordinal:number;sourcePageUrl:string};
export type ReferenceSourceIngestion={canonicalUrl:string;retrievedAt:string;title:string|null;author:string|null;publisher:string|null;publishedAt:string|null;publicationDateStatus:"verified"|"not_provided";description:string|null;contentType:string;license:{status:"verified"|"inferred"|"not_found";identifier:string|null;url:string|null;findings:string[]};imageCandidates?:ReferenceSourceImageCandidate[];provenance:{requested_url:string;final_url:string;retrieved_at:string;http_status:number;content_type:string;content_hash:string;metadata_sources:string[]}};
export type ReferenceEvidenceIntent="general_support"|"numeric_stat"|"dated_timeline"|"comparison_support";
export type ReferenceSourceEvidenceClaim={evidenceIntent:ReferenceEvidenceIntent;label:string;rawExcerpt:string;evidenceDate:string|null;numericValue:number|null;unit:string|null;documentLocator:{kind:"html_text";ordinal:number}|{kind:"pdf_text";page:number;ordinal:number};citationAnchor:{exact:string};editorialRelevance:{supports:boolean;matchedTerms:string[];contract:string};provenance:{requested_url:string;final_url:string;retrieved_at:string;content_hash:string;extraction_contract:string;extraction_intent:ReferenceEvidenceIntent;historical_date_text?:string|null}};
export type ReferenceSourceEvidenceOptions={intent?:ReferenceEvidenceIntent;editorialFocus?:string;desiredMaterial?:string};
export type ReferenceResearchLead={classification:"derivative_ai_research_lead";citationUrls:string[];accessStatus:"retrieved"|"inaccessible"};
const decode=(value:string)=>value.replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").trim();
const meta=(html:string,key:string)=>{const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");for(const pattern of[new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,`i`),new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,`i`)]){const match=html.match(pattern);if(match?.[1])return decode(match[1]);}return null;};
const link=(html:string,rel:string)=>{const escaped=rel.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");for(const pattern of[new RegExp(`<link[^>]+rel=["'][^"']*${escaped}[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>`,`i`),new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*${escaped}[^"']*["'][^>]*>`,`i`)]){const match=html.match(pattern);if(match?.[1])return decode(match[1]);}return null;};
const isoDate=(value:string|null)=>{if(!value)return null;const date=new Date(value);return Number.isNaN(date.valueOf())?null:date.toISOString();};
const humanizeDocumentName=(value:string|null)=>{if(!value)return null;let name=value.trim().replace(/^.*[\\/]/,"").replace(/\.(?:pdf|docx?|xlsx?|pptx?)$/i,"").replace(/[-_]+/g," ").replace(/\bPDF\b$/i,"").replace(/\s+/g," ").trim();try{name=decodeURIComponent(name);}catch{/* Retain the safe undecoded name. */}return name||null;};
const contentDispositionName=(value:string|null)=>{if(!value)return null;const encoded=value.match(/filename\*=UTF-8''([^;]+)/i)?.[1],plain=value.match(/filename=["']?([^;"']+)/i)?.[1];return humanizeDocumentName(encoded??plain??null);};
const attribute=(tag:string,name:string)=>decode(tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`,"i"))?.[1]??"")||null;
function imageCandidates(html:string,pageUrl:URL):ReferenceSourceImageCandidate[]{
 const candidates=Array.from(html.matchAll(/<img\b[^>]*>/gi)).flatMap((match,index)=>{const tag=match[0],raw=attribute(tag,"data-src")??attribute(tag,"data-original")??attribute(tag,"src");if(!raw||raw.startsWith("data:"))return[];try{const url=new URL(raw,pageUrl);if(url.protocol!=="https:")return[];const path=`${url.hostname}${url.pathname}`.toLowerCase();if(/(?:logo|avatar|icon|badge|spinner|pixel|paypal)/.test(path))return[];return[{url:url.toString(),alt:attribute(tag,"alt"),ordinal:index+1,sourcePageUrl:pageUrl.toString()}];}catch{return[];}}),seen=new Set<string>();return candidates.filter(candidate=>!seen.has(candidate.url)&&Boolean(seen.add(candidate.url))).slice(0,24);
}
async function retrieve(value:string,fetchImpl:typeof fetch){let url=await assertSafeExternalMediaUrl(value),response:Response|null=null;for(let redirects=0;redirects<=3;redirects+=1){response=await fetchImpl(url,{redirect:"manual",headers:{accept:"text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.2","user-agent":"PodcastersForge-Hearth/1.0"},signal:AbortSignal.timeout(TIMEOUT_MS)});if(response.status>=300&&response.status<400){const location=response.headers.get("location");if(!location||redirects===3)throw new Error("reference_source_redirect_invalid");url=await assertSafeExternalMediaUrl(new URL(location,url).toString());continue;}break;}if(!response?.ok)throw new Error(`reference_source_fetch_failed:${response?.status??0}`);const contentType=(response.headers.get("content-type")??"application/octet-stream").split(";")[0]!.trim().toLowerCase(),maxBytes=contentType==="application/pdf"||url.pathname.toLowerCase().endsWith(".pdf")?MAX_PDF_SOURCE_BYTES:MAX_HTML_SOURCE_BYTES,declared=Number(response.headers.get("content-length")??0);if(declared>maxBytes)throw new Error("reference_source_too_large");const bytes=new Uint8Array(await response.arrayBuffer());if(!bytes.length||bytes.length>maxBytes)throw new Error("reference_source_too_large");const retrievedAt=new Date().toISOString(),hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),part=>part.toString(16).padStart(2,"0")).join("");return{url,response,bytes,contentType,retrievedAt,hash};}
export async function ingestReferenceSourceUrl(value:string,fetchImpl:typeof fetch=fetch):Promise<ReferenceSourceIngestion>{
 const{url,response,bytes,contentType,retrievedAt,hash}=await retrieve(value,fetchImpl);
 const html=contentType.includes("html")?new TextDecoder().decode(bytes):"";const htmlTitle=meta(html,"og:title")??meta(html,"twitter:title")??(decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??"")||null),headerTitle=contentDispositionName(response.headers.get("content-disposition")),urlTitle=contentType==="application/pdf"?humanizeDocumentName(url.pathname):null,title=htmlTitle??headerTitle??urlTitle;const author=meta(html,"author")??meta(html,"article:author");const publisher=meta(html,"og:site_name")??url.hostname.replace(/^www\./,"");const rawDate=meta(html,"article:published_time")??meta(html,"datePublished")??meta(html,"date");const publishedAt=isoDate(rawDate);const canonical=link(html,"canonical");const canonicalUrl=canonical?new URL(canonical,url).toString():url.toString();const licenseUrl=link(html,"license")??meta(html,"license");const licenseText=[meta(html,"dc.rights"),meta(html,"dcterms.rights"),meta(html,"copyright")].filter((item):item is string=>!!item);const findings=[...(licenseUrl?[`License link: ${new URL(licenseUrl,url).toString()}`]:[]),...licenseText];
 return{canonicalUrl,retrievedAt,title,author,publisher,publishedAt,publicationDateStatus:publishedAt?"verified":"not_provided",description:meta(html,"og:description")??meta(html,"description"),contentType,license:{status:licenseUrl||licenseText.length?"verified":"not_found",identifier:licenseText[0]??null,url:licenseUrl?new URL(licenseUrl,url).toString():null,findings},imageCandidates:imageCandidates(html,url),provenance:{requested_url:value,final_url:url.toString(),retrieved_at:retrievedAt,http_status:response.status,content_type:contentType,content_hash:hash,metadata_sources:[htmlTitle?"document_metadata:title":headerTitle?"response_header:filename":urlTitle?"url_path:document_name":"",author?"document_metadata:author":"",publishedAt?"document_metadata:published_at":"",licenseUrl||licenseText.length?"document_metadata:license":"",html?"document_content:images":""].filter(Boolean)}};
}

const relevanceStopWords=new Set(["according","administration","based","current","directly","evidence","explainer","information","largest","material","price","source","states","supported","united","visual","with"]);
const relevanceTokens=(value:string)=>[...new Set(value.toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(token=>token.length>=4&&!relevanceStopWords.has(token)))];
export function assessNumericEvidenceEditorialRelevance(rawExcerpt:string,label:string,editorialFocus="",desiredMaterial=""){
 const expected=relevanceTokens(`${editorialFocus} ${desiredMaterial}`),actual=new Set(relevanceTokens(`${label} ${rawExcerpt}`)),matchedTerms=expected.filter(token=>actual.has(token));
 const requested=`${editorialFocus} ${desiredMaterial}`.toLowerCase(),claim=`${label} ${rawExcerpt}`.toLowerCase();
 const componentClaim=/crude\s+oil/.test(requested)&&/(?:component|share|contribution|portion)/.test(requested);
 const componentSupported=!componentClaim||(/crude\s+oil/.test(claim)&&/(?:account(?:ed|s)?\s+for|component|share|contribution|portion|percent|%)/.test(claim));
 return{supports:componentSupported&&(expected.length===0||matchedTerms.length>=2),matchedTerms,contract:"forge.reference-evidence-editorial-relevance.v1"};
}

export async function extractReferenceSourceEvidence(value:string,fetchImpl:typeof fetch=fetch,options:ReferenceSourceEvidenceOptions={}):Promise<ReferenceSourceEvidenceClaim[]>{
 const requested=new URL(value);if(/(^|\.)google\.[a-z.]+$/i.test(requested.hostname)&&requested.pathname==="/search")throw new Error("reference_source_search_results_not_evidence");
 const{url,bytes,contentType,retrievedAt,hash}=await retrieve(value,fetchImpl);
 type EvidenceBlock={text:string;locator:ReferenceSourceEvidenceClaim["documentLocator"]};
 let blocks:EvidenceBlock[]=[];
 if(contentType.includes("html")){
  const html=new TextDecoder().decode(bytes).replace(/<(script|style|nav|footer|header|aside|noscript)[^>]*>[\s\S]*?<\/\1>/gi," ");
  blocks=Array.from(html.matchAll(/<(h[1-6]|p|li|td|th)[^>]*>([\s\S]*?)<\/\1>/gi)).map((match,ordinal)=>({text:decode(match[2]!.replace(/<[^>]+>/g," ")),locator:{kind:"html_text" as const,ordinal:ordinal+1}})).filter(block=>block.text.length>=20&&block.text.length<=1200);
 }else if(contentType==="application/pdf"||url.pathname.toLowerCase().endsWith(".pdf")){
  const document=await loadPdfDocument(bytes);
  for(let pageNumber=1;pageNumber<=document.numPages;pageNumber+=1){
   const page=await document.getPage(pageNumber),content=await page.getTextContent(),rows=new Map<number,Array<{x:number;text:string}>>();
   for(const item of content.items){if(!("str" in item)||!item.str.trim())continue;const y=Math.round(item.transform[5]!*2)/2,row=rows.get(y)??[];row.push({x:item.transform[4]!,text:item.str.trim()});rows.set(y,row);}
   const lines=[...rows.entries()].sort((left,right)=>right[0]-left[0]).map(([,items])=>decode(items.sort((left,right)=>left.x-right.x).map(item=>item.text).join(" "))).filter(Boolean);
   lines.forEach((text,ordinal)=>blocks.push({text,locator:{kind:"pdf_text",page:pageNumber,ordinal:ordinal+1}}));
  }
  await document.destroy();
 }else throw new Error("reference_source_evidence_content_unsupported");
 const datePattern=/\b(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})|(?:1[5-9]\d{2}|20\d{2}|21\d{2})(?:\s*(?:-|–|—|to)\s*(?:1[5-9]\d{2}|20\d{2}|21\d{2}))?)\b/i;
 const numericPattern=/(?:\$\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(%|percent|million|billion|thousand|dollars?|cents?(?:\s+per\s+gallon)?|tons?|acres?|boxes?|people|barrels?|gallons?)?/i;
 const intent=options.intent??"general_support";
 const claims=blocks.flatMap(block=>{const text=block.text,date=text.match(datePattern)?.[0]??null,matches=[...text.matchAll(new RegExp(numericPattern.source,"gi"))],numeric=matches.find(match=>{const token=match[1]??"",numericValue=Number(token.replaceAll(",","")),explicit=/\$|,|\.|%|percent|million|billion|thousand|dollars?|cents?|tons?|acres?|boxes?|people|barrels?|gallons?/i.test(match[0]);return Number.isFinite(numericValue)&&explicit;});if(!date&&!numeric)return[];const rawExcerpt=text.slice(0,600),numericValue=numeric?Number((numeric[1]??"").replaceAll(",","")):null,rawUnit=numeric?.[2]?.toLowerCase()??null,unit=numeric?(numeric[0].includes("$")?"dollars":rawUnit==="%"?"percent":rawUnit?.replace(/\s+/g,"_")??null):null,label=(date?`${date}: `:"")+rawExcerpt.slice(0,120),editorialRelevance=assessNumericEvidenceEditorialRelevance(rawExcerpt,label,options.editorialFocus,options.desiredMaterial);return[{evidenceIntent:intent,label,rawExcerpt,evidenceDate:/^\d{4}-\d{2}-\d{2}$/.test(date??"")?date:null,numericValue,unit,documentLocator:block.locator,citationAnchor:{exact:rawExcerpt},editorialRelevance,provenance:{requested_url:value,final_url:url.toString(),retrieved_at:retrievedAt,content_hash:hash,extraction_contract:"forge.reference-source-evidence.v4",extraction_intent:intent,historical_date_text:date}}];});
 return claims.filter(claim=>{
  if(intent==="numeric_stat")return claim.numericValue!=null&&Number.isFinite(claim.numericValue)&&Boolean(claim.unit&&claim.label&&claim.rawExcerpt&&claim.citationAnchor.exact)&&claim.editorialRelevance.supports;
  if(intent==="dated_timeline")return Boolean(claim.evidenceDate??claim.provenance.historical_date_text);
  return true;
 }).slice(0,24);
}
export async function inspectReferenceResearchLead(value:string,fetchImpl:typeof fetch=fetch):Promise<ReferenceResearchLead>{const requested=new URL(value);if(requested.hostname!=="share.google"||!requested.pathname.startsWith("/aimode/"))throw new Error("reference_source_not_ai_research_lead");try{const{url,bytes,contentType}=await retrieve(value,fetchImpl);if(!contentType.includes("html"))return{classification:"derivative_ai_research_lead",citationUrls:[],accessStatus:"retrieved"};const html=new TextDecoder().decode(bytes),urls=Array.from(html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)).flatMap(match=>{try{const candidate=new URL(decode(match[1]!),url),redirect=candidate.searchParams.get("url")??candidate.searchParams.get("q"),resolved=redirect&&/^https?:\/\//i.test(redirect)?new URL(redirect):candidate;if(resolved.protocol!=="https:"||resolved.hostname.endsWith("google.com")||resolved.hostname==="share.google")return[];return[resolved.toString()];}catch{return[];}});return{classification:"derivative_ai_research_lead",citationUrls:[...new Set(urls)].slice(0,20),accessStatus:"retrieved"};}catch{return{classification:"derivative_ai_research_lead",citationUrls:[],accessStatus:"inaccessible"};}}
