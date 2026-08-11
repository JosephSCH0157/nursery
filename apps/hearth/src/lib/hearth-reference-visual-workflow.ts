export type ReferenceVisualWorkflowState="hearth_is_working"|"needs_your_decision"|"ready";
export type ReferenceVisualDecisionReason="ingestion_failure"|"missing_metadata"|"conflicting_metadata"|"uncertain_licensing"|"conflicting_evidence"|"creator_edits";
export type ReferenceVisualWorkflowInput={ingestion:"idle"|"pending"|"failed"|"succeeded";title:string|null;provider:string|null;publicationDateStatus:"verified"|"not_provided";intendedUse:"facts_data_only"|"third_party_media"|null;licenseStatus:"verified"|"inferred"|"not_found";metadataConflicts?:string[];evidenceConflicts?:string[];creatorEditing?:boolean};
export function resolveReferenceVisualWorkflow(input:ReferenceVisualWorkflowInput){
 if(input.ingestion==="pending")return{state:"hearth_is_working" as const,reasons:[] as ReferenceVisualDecisionReason[]};
 const reasons:ReferenceVisualDecisionReason[]=[];
 if(input.ingestion==="failed")reasons.push("ingestion_failure");
 if(input.ingestion==="succeeded"&&(!input.title?.trim()||!input.provider?.trim()))reasons.push("missing_metadata");
 if(input.metadataConflicts?.length)reasons.push("conflicting_metadata");
 if(input.evidenceConflicts?.length)reasons.push("conflicting_evidence");
 if(input.creatorEditing)reasons.push("creator_edits");
 // An absent publication date is honest metadata, not a blocker. Unknown licensing
 // requires a decision only if the proposal would reproduce third-party media.
 if(input.ingestion==="succeeded"&&input.intendedUse==="third_party_media"&&input.licenseStatus==="not_found")reasons.push("uncertain_licensing");
 return reasons.length?{state:"needs_your_decision" as const,reasons}:{state:"ready" as const,reasons};
}
export const referenceVisualWorkflowLabel=(state:"hearth_is_working"|"needs_your_decision"|"ready")=>state==="hearth_is_working"?"Hearth is working":state==="needs_your_decision"?"Needs your decision":"Ready";
