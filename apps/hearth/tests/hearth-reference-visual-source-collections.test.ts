import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {projectReferenceVisualEvidencePresentation,projectReferenceVisualSourceChoice,validateReferenceVisualSourceSetReceipt,type CollectionEvidenceProposal} from "../src/lib/hearth-reference-visual-collections";

const collection=readFileSync(new URL("../src/lib/hearth-reference-visual-collections.ts",import.meta.url),"utf8");
const visualAuthority=readFileSync(new URL("../src/lib/hearth-reference-visual-authority.ts",import.meta.url),"utf8");
const panel=readFileSync(new URL("../src/components/visuals/CanonicalReferenceVisualPanel.tsx",import.meta.url),"utf8");
const visualStyles=readFileSync(new URL("../src/views/surfaces/VisualsSurface.css",import.meta.url),"utf8");
const shell=readFileSync(new URL("../src/routes/HearthShell.tsx",import.meta.url),"utf8");
const dispositionControl=readFileSync(new URL("../src/components/visuals/VisualOpportunityDispositionControl.tsx",import.meta.url),"utf8");
const migration=readFileSync(new URL("../../../supabase/migrations/20260810130000_tongs_reference_visual_source_sets.sql",import.meta.url),"utf8");
const originMigration=readFileSync(new URL("../../../supabase/migrations/20260811120000_tongs_reference_visual_evidence_extracted_content_origin.sql",import.meta.url),"utf8");
const resetReadbackRepair=readFileSync(new URL("../../../supabase/migrations/20260812150000_tongs_reference_visual_reset_readback_repair.sql",import.meta.url),"utf8");

test("Reference Visual Sources use immutable ordered set authority",()=>{
 for(const table of ["reference_visual_source_set_revisions","reference_visual_source_set_members"])assert.match(migration,new RegExp(`create table tongs\\.${table}`));
 assert.match(migration,/commit_reference_visual_source_set/);assert.match(migration,/p_expected_source_set_revision/);assert.match(migration,/source_set_revision_conflict/);assert.match(migration,/duplicate_source/);assert.match(migration,/reference_visual_source_set_retention/);assert.match(migration,/forge\.reference-visual\.hammer\.v3/);
});

test("Hearth commits and verifies the complete ordered collection",()=>{
 assert.match(collection,/reference-visuals\/source-set/);assert.match(collection,/expected_source_set_revision/);assert.match(collection,/source_set_receipt_invalid/);assert.match(collection,/source_set_readback_mismatch/);assert.match(collection,/sameMembers/);assert.match(collection,/removeReferenceVisualSourceMember/);
});

test("collection receipts reject stale conflicts, malformed members, and wrong ordering",()=>{
 const intended=[{sourceRevisionId:"source-a",sourceLinkRevisionId:"link-a"},{sourceRevisionId:"source-b",sourceLinkRevisionId:"link-b"}],receipt={disposition:"committed",source_set_revision:{revision:2},members:[{source_revision_id:"source-a",workpiece_source_link_revision_id:"link-a"},{source_revision_id:"source-b",workpiece_source_link_revision_id:"link-b"}]};
 assert.deepEqual(validateReferenceVisualSourceSetReceipt(receipt,intended,1),{ok:true,data:{revision:2}});
 assert.equal(validateReferenceVisualSourceSetReceipt({...receipt,members:[...receipt.members].reverse()},intended,1).ok,false);
 assert.equal(validateReferenceVisualSourceSetReceipt({...receipt,source_set_revision:{revision:1}},intended,1).ok,false);
 assert.deepEqual(validateReferenceVisualSourceSetReceipt({disposition:"source_set_revision_conflict"},intended,1),{ok:false,status:409,code:"source_set_revision_conflict",error:"Reference Visual Sources were not committed."});
 assert.equal(validateReferenceVisualSourceSetReceipt({disposition:"committed",members:"bad",source_set_revision:{revision:2}},intended,1).ok,false);
});

test("Source choices distinguish promotion from adding support without dropping members",()=>{
 const primary={sourceRevisionId:"source-a",sourceLinkRevisionId:"link-a"},support={sourceRevisionId:"source-b",sourceLinkRevisionId:"link-b"},newSource={sourceRevisionId:"source-c",sourceLinkRevisionId:"link-c"};
 assert.deepEqual(projectReferenceVisualSourceChoice([primary,support],support,"promote"),[support,primary]);
 assert.deepEqual(projectReferenceVisualSourceChoice([primary,support],newSource,"promote"),[newSource,primary,support]);
 assert.deepEqual(projectReferenceVisualSourceChoice([primary,support],newSource,"support"),[primary,support,newSource]);
 assert.deepEqual(projectReferenceVisualSourceChoice([primary,support],support,"support"),[primary,support]);
});

test("Evidence presentation prioritizes direct matches while preserving every other finding",()=>{
 const proposal=(label:string,ordinal:number,supports:boolean,matchedTerms:string[]):CollectionEvidenceProposal=>({evidenceIntent:"numeric_stat",sourceSetMemberId:`member-${label}`,ordinal,sourceRevisionId:`source-${label}`,sourceLinkRevisionId:`link-${label}`,sourceTitle:`Source ${label}`,publisher:null,label,rawExcerpt:`Excerpt ${label}`,evidenceDate:null,numericValue:10,unit:"percent",documentLocator:{kind:"csv_cell"},citationAnchor:{exact:`${label}`},editorialRelevance:{supports,matchedTerms},provenance:{extraction_method:"publisher_csv"}});
 const indirect=proposal("indirect",1,false,["gasoline"]),primary=proposal("primary",1,true,["crude"]),strong=proposal("strong",2,true,["crude","oil","component"]),second=proposal("second",2,true,["crude","component"]),presentation=projectReferenceVisualEvidencePresentation([indirect,primary,strong,second],2);
 assert.equal(presentation.totalCount,4);assert.equal(presentation.directCount,3);
 assert.deepEqual(presentation.featured.map(item=>item.label),["strong","second"]);
 assert.deepEqual(presentation.additional.map(item=>item.label),["primary","indirect"]);
});

test("URL-first workflow exposes working, decision, and ready states without requiring fabricated dates",()=>{
 assert.match(panel,/Hearth is working/);assert.match(panel,/Ready/);assert.match(panel,/publicationDateStatus==="not_provided"\?"Not provided"/);for(const action of ["Replace","Skip"])assert.ok(panel.includes(`>${action}<`));assert.match(panel,/Save edits/);assert.match(panel,/readCanonicalReferenceVisualCollections/);assert.match(panel,/Current Source/);assert.match(panel,/Supporting Sources/);assert.doesNotMatch(panel,/Approved Sources/);
 assert.match(panel,/Source title/);assert.match(panel,/Publisher or organization/);assert.match(panel,/setSourceProposal\(\{\.\.\.sourceProposal,title:event\.target\.value\}\)/);
});

test("Source UX distinguishes current-source changes from support additions",()=>{
 for(const copy of ["Change Current Source","Add supporting Source","Make Current","Remove Current Source"])assert.match(panel,new RegExp(copy));
 assert.match(panel,/projectReferenceVisualSourceChoice\(current,chosen,sourceAction==="change"\?"promote":"support"\)/);
 assert.match(panel,/projectReferenceVisualSourceChoice\(current,\{sourceRevisionId:member\.sourceRevisionId,sourceLinkRevisionId:member\.sourceLinkRevisionId\},"promote"\)/);
 assert.match(panel,/sourceAction==="change"&&index===0\?"promote":"support"/);
 assert.match(panel,/every existing Source is retained as support/i);
 assert.match(panel,/Current Source stays current/);
 assert.match(panel,/sources\.filter\(source=>!\(opportunity\.sources\?\?\[\]\)\.some\(member=>member\.sourceRevisionId===source\.sourceRevisionId&&member\.sourceLinkRevisionId===source\.sourceLinkRevisionId\)\)/);
 assert.ok(panel.indexOf("hs-reference-visual-current-source")<panel.indexOf("hs-reference-visual-supporting-sources"));
});

test("Evidence UX keeps the decision compact and technical depth disclosed",()=>{
 for(const copy of ["Why you can’t prepare this design yet","Evidence that directly supports this visual","Show other evidence (","What Forge checked","Review Source inspection details","Evidence provenance","Confirmed evidence remains saved"] )assert.match(panel,new RegExp(copy.replace(/[()]/g,"\\$&")));
 assert.match(panel,/projectReferenceVisualEvidencePresentation\(evidenceProposals\)/);
 assert.match(panel,/evidencePresentation\.featured\.map/);assert.match(panel,/evidencePresentation\.additional\.map/);
 assert.match(panel,/Make Current Source/);assert.match(panel,/existing Current Source stays attached as a Supporting Source/);
 assert.match(panel,/evidenceIntentFor\(opportunity\.subtype\)==="dated_timeline"/);assert.match(panel,/Supported event date/);
});

test("post-action and authority-event refreshes keep the work area mounted",()=>{
 assert.match(panel,/async function refresh\(blocking=false\)/);
 assert.match(panel,/void refresh\(true\)/);
 assert.match(panel,/listener=\(\)=>void refresh\(false\)/);
 assert.match(panel,/await refresh\(false\)/);
 assert.doesNotMatch(panel,/async function refresh\(\)\{setLoading\(true\)/);
 assert.match(panel,/setSelectedId\(current=>/);
});

test("Reference Material completion treats current selections and explicit skips as resolved and receives live progress",()=>{
 assert.match(shell,/selectedRevisionIds\.length > 0 \|\| skippedReferenceClipIds\.has\(opportunity\.id\)/);
 assert.match(shell,/selectedCandidateRevisionId\) \|\| skippedReferenceVisualIds\.has\(opportunity\.id\)/);
 assert.match(shell,/forge:canonical-reference-visuals-progress/);
 assert.match(shell,/forge:visual-opportunity-dispositions-progress/);
 assert.match(panel,/forge:canonical-reference-visuals-progress/);
 assert.match(dispositionControl,/forge:visual-opportunity-dispositions-progress/);
 assert.match(panel,/Boolean\(item\.selectedCandidateRevisionId\)&&!skippedIds\.has\(item\.id\)/);
});

test("confirmed collection evidence uses the canonical extracted-content origin without remapping",()=>{
 assert.match(panel,/origin:"hearth_extracted_source_content"/);
 assert.match(panel,/date:proposal\.evidenceDate/);
 assert.doesNotMatch(panel,/evidence_date:proposal\.evidenceDate/);
 for(const origin of ["ai_extracted","creator_entered","hearth_proposed_source_metadata","hearth_extracted_source_content"])assert.match(originMigration,new RegExp(`'${origin}'`));
 assert.match(originMigration,/reference_visual_evidence_revisions_origin_check/);
});

test("each newly confirmed collection claim starts its own immutable evidence sequence",()=>{
 assert.match(panel,/confirmProposal[\s\S]*?expectedRevision:0/);
 assert.match(panel,/confirmEvidence[\s\S]*?expectedRevision:0/);
 assert.doesNotMatch(panel,/confirmProposal[\s\S]*?expectedRevision:opportunity\.evidenceSequenceRevision/);
});

test("every selected Source exposes evidence coverage and a manual fallback",()=>{
 assert.match(panel,/Evidence coverage by Source/);
 assert.match(panel,/hs-reference-visual-source-coverage-card/);
 assert.match(panel,/hs-reference-visual-source-coverage-copy/);
 assert.match(panel,/No extractable suggestions found/);
 assert.match(panel,/Enter evidence for this Source/);
 assert.match(panel,/Confirm evidence for Source/);
 assert.match(panel,/evidenceMemberId===member\.memberId/);
 assert.match(panel,/event\.key!=="Escape"/);
 assert.match(panel,/function cancelManualEvidence\(\)/);
 assert.match(panel,/manualEvidenceOpen&&evidenceMemberId===memberId/);
 assert.match(panel,/window\.removeEventListener\("keydown",cancel\)/);
 assert.match(visualStyles,/content:"Cancel manual entry"/);
 assert.match(visualStyles,/press Escape to cancel manual entry without saving/i);
});

test("evidence reset readback preserves ordered canonical Source collections",()=>{
 assert.match(resetReadbackRepair,/'source_set',to_jsonb\(ss\)/);
 assert.match(resetReadbackRepair,/'sources',coalesce/);
 assert.match(resetReadbackRepair,/reference_visual_source_set_members sm/);
 assert.match(resetReadbackRepair,/order by sm\.ordinal/);
 assert.match(resetReadbackRepair,/reference_visual_evidence_resets/);
});

test("numeric evidence extraction is explicit, fail closed, and has a complete no-result path",()=>{
 assert.match(collection,/evidence_intent:args\.intent/);
 assert.match(collection,/args\.intent==="numeric_stat"&&\(!Number\.isFinite\(numericValue\)\|\|!unit\|\|relevance\.supports!==true\)/);
 assert.match(panel,/evidenceIntentFor/);
 assert.match(panel,/This stat card needs one supported numeric value\./);
 for(const action of ["Enter supported evidence manually","Add or choose another Source","Change visual type"])assert.match(panel,new RegExp(action));
 assert.match(panel,/evidenceIntentFor\(opportunity\.subtype\)==="numeric_stat"&&\(!evidence\.numeric_value\.trim\(\)\|\|!evidence\.unit\.trim\(\)\)/);
});

test("visual treatment can be changed before any workflow stage is satisfied",()=>{
 assert.match(panel,/hs-reference-visual-treatment-actions/);
 assert.match(panel,/onClick=\{startTypeChange\}>Change visual type/);
 assert.match(panel,/derivedFrom:opportunity\.revisionId/);
});

test("the source collection labels distinguish Current from Supporting counts",()=>{
 assert.match(panel,/Supporting Sources \(\{\(opportunity\.sources\?\.length\?\?1\)-1\}\)/);
 assert.match(panel,/1 Current \+ \{\(opportunity\.sources\?\.length\?\?1\)-1\} Supporting/);
});

test("evidence confirmation accepts canonical replay without relaxing other mutations",()=>{
 assert.match(visualAuthority,/requireEvidenceCommittedOrReplay/);
 assert.match(visualAuthority,/disposition==="committed"\|\|disposition==="replay"/);
 assert.match(visualAuthority,/canonical_evidence_id/);
 assert.match(visualAuthority,/canonical_evidence_revision_id/);
 assert.match(visualAuthority,/clearReferenceVisualEvidence[\s\S]*?requireCommitted/);
});

test("mixed-use attribution remains a distinct blocker after numeric readiness",()=>{
 assert.match(panel,/Attribution is required before design\./);
 assert.match(panel,/evidenceReadiness\?\.evidenceReady&&sourceUse\.classification==="mixed"&&!recipe\.attribution\.trim\(\)/);
});
