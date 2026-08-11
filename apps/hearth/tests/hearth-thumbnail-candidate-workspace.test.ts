import assert from "node:assert/strict";
import test from "node:test";
import type { EpisodePackageV3, ThumbnailRenderRecipe } from "../src/lib/episode-package-v3";
import type { ThumbnailCandidateAuthorityProjection } from "../src/lib/hearth-thumbnail-v3-api";
import { buildCandidateWorkspaceCards, buildPendingCandidateWorkspaceCards, candidateWorkspaceSummary } from "../src/lib/hearth-thumbnail-candidate-workspace";

const recipe = (id:string, revision:number, concept:string, title:string):ThumbnailRenderRecipe => ({
  id, revision, concept_revision_id:concept, title_id:title, title_revision:1, title_text:`Title ${title}`,
} as ThumbnailRenderRecipe);

function fixture(){
  const recipes=[recipe("recipe-a",1,"concept-a","title-a"),recipe("recipe-b",2,"concept-b","title-a"),recipe("recipe-c",1,"concept-b","title-a")];
  const pkg={thumbnail:{render_recipes:recipes,concept_revisions:[
    {concept_revision_id:"concept-a",headline:"First concept"},{concept_revision_id:"concept-b",headline:"Second concept"},
  ],launch_variant_revisions:[]}} as unknown as EpisodePackageV3;
  const candidate=(id:string,ordinal:number,recipeId:string,recipeRevision:number,eligibility:string,overrides:Record<string,unknown>={})=>({
    id,candidate_ordinal:ordinal,recipe_id:recipeId,recipe_revision:recipeRevision,recipe_hash:`recipe-hash-${id}`,
    title_revision_id:"title-revision-a",concept_revision_id:ordinal===1?"concept-a":"concept-b",
    base_artwork_content_hash:"art-a",structural_composition_fingerprint:"structure-a",composite_asset_id:`asset-${id}`,
    composite_content_hash:`composite-${id}`,candidate_binding_revision:4,readability_evidence_hash:`evidence-${id}`,
    eligibility_state:eligibility,presentation_opacity:ordinal,...overrides,
  });
  const authority={candidate_set:{id:"set-1",revision:1},active_binding_id:"binding-1",active_binding_revision:4,candidates:[
    candidate("a",1,"recipe-a",1,"current"),
    candidate("b",2,"recipe-b",2,"requires_reapproval"),
    candidate("c",3,"recipe-c",1,"approved_historical_brand",{structural_composition_fingerprint:"structure-b"}),
  ]} as ThumbnailCandidateAuthorityProjection;
  return {pkg,authority};
}

test("candidate workspace explains only locked distinction identities",()=>{
  const {pkg,authority}=fixture();const cards=buildCandidateWorkspaceCards(pkg,authority);
  assert.deepEqual(cards[0]?.distinctionReasons,["set baseline"]);
  assert.deepEqual(cards[1]?.distinctionReasons,["concept revision"]);
  assert.deepEqual(cards[2]?.distinctionReasons,["structural composition"]);
  assert.equal(cards[1]?.distinctionReasons.includes("presentation opacity"),false);
});

test("candidate workspace reports Quench readiness only from Tongs eligibility",()=>{
  const {pkg,authority}=fixture();const summary=candidateWorkspaceSummary(buildCandidateWorkspaceCards(pkg,authority));
  assert.deepEqual(summary,{complete:true,quenchEligibleCount:2,blockedCount:0,requiresReapprovalCount:1});
});

test("candidate workspace hydrates previews from the canonical authority asset path",()=>{
  const {pkg,authority}=fixture();
  authority.candidates[0] = { ...authority.candidates[0], asset_path: " thumbnails/candidate-a.png " };
  const cards=buildCandidateWorkspaceCards(pkg,authority);
  assert.equal(cards[0]?.assetPath,"thumbnails/candidate-a.png");
});

test("recovered canonical assets retain branding, title, and readability without a package launch",()=>{
  const {pkg,authority}=fixture();
  pkg.thumbnail.launch_variant_revisions=[];
  pkg.thumbnail.render_recipes=[];
  authority.candidates[0]={...authority.candidates[0],asset_path:"recovered.png",title_text:"The Orange Disappeared",brand_logo_asset_revision_id:"logo-revision",readability_passed:true,readability_score:7.2,readability_treatment:"outline"};
  const card=buildCandidateWorkspaceCards(pkg,authority)[0];
  assert.equal(card?.assetPath,"recovered.png");
  assert.equal(card?.title,"The Orange Disappeared");
  assert.equal(card?.logoApplied,true);
  assert.deepEqual(card?.readability,{passed:true,score:7.2,treatment:"outline",evidenceHash:"evidence-a"});
});

test("pending replacement uses only the newest ready renders under the active binding",()=>{
  const launches=["old-binding","active-binding","active-binding","active-binding","active-binding"].map((bindingId,index)=>({
    launch_variant_id:`launch-${index}`,base_version_id:`base-${index}`,recipe_id:"recipe-a",recipe_revision:1,status:"ready",
    snapshot:{asset_id:`asset-${index}`,asset_path:`thumbnail-${index}.png`,content_hash:`hash-${index}`,style_source:bindingId==="active-binding"?"brand_profile":"forge_standard",
      brand_binding_context:{binding_id:bindingId,binding_revision:bindingId==="active-binding"?2:1},brand_logo_asset_revision_id:bindingId==="active-binding"?"logo":null,
      readability_evidence:{passed:true,evaluation_hash:`evidence-${index}`,applied_treatment:"none"}},
  }));
  const pkg={thumbnail:{render_recipes:[recipe("recipe-a",1,"concept-a","title-a")],concept_revisions:[{concept_revision_id:"concept-a",headline:"Concept"}],base_versions:[],launch_variant_revisions:launches}} as unknown as EpisodePackageV3;
  const cards=buildPendingCandidateWorkspaceCards(pkg,"active-binding",new Set(["asset-1"]));
  assert.deepEqual(cards.map((card)=>card.id),["launch-2","launch-3","launch-4"]);
  assert.ok(cards.every((card)=>card.styleSource==="brand_profile"&&card.logoApplied));
  const brandedOnly=buildPendingCandidateWorkspaceCards(pkg,"active-binding",new Set(),"brand_profile");
  assert.ok(brandedOnly.every((card)=>card.styleSource==="brand_profile"));
});

test("saved edit replaces the displayed launch lineage while preserving its prior revision",()=>{
  const recipes=[
    {...recipe("recipe-a",1,"concept-a","title-a"),treatment:{placement:{vertical:"top"}},presentation_override:{logo_placement:"bottom_right"}},
    {...recipe("recipe-a",2,"concept-a","title-a"),treatment:{placement:{vertical:"bottom"}},presentation_override:{logo_placement:"top_left"}},
    recipe("recipe-b",1,"concept-a","title-a"),recipe("recipe-c",1,"concept-a","title-a"),
  ] as ThumbnailRenderRecipe[];
  const launch=(id:string,revision:number,recipeId:string,recipeRevision:number,assetId:string,path:string,passed=true)=>({
    launch_variant_id:id,revision,supersedes_revision:revision>1?revision-1:null,base_version_id:`base-${id}`,
    concept_revision_id:"concept-a",title_id:"title-a",title_revision:1,recipe_id:recipeId,recipe_revision:recipeRevision,status:"ready" as const,created_at:`2026-08-02T00:00:0${revision}.000Z`,
    snapshot:{asset_id:assetId,asset_path:path,content_hash:`hash-${assetId}`,style_source:"brand_profile" as const,
      brand_binding_context:{binding_id:"binding-1",binding_revision:4},brand_logo_asset_revision_id:"logo-1",
      readability_evidence:{passed,evaluation_hash:`evidence-${assetId}`,applied_treatment:"none"},
      recipe_snapshot:recipes.find((entry)=>entry.id===recipeId&&entry.revision===recipeRevision)},
  });
  const old=launch("launch-a",1,"recipe-a",1,"asset-old","old.png");
  const edited=launch("launch-a",2,"recipe-a",2,"asset-new","new.png",false);
  const pkg={thumbnail:{render_recipes:recipes,concept_revisions:[{concept_revision_id:"concept-a",headline:"Concept"}],base_versions:[],
    launch_variant_revisions:[old,launch("launch-b",1,"recipe-b",1,"asset-b","b.png"),launch("launch-c",1,"recipe-c",1,"asset-c","c.png"),edited]}} as unknown as EpisodePackageV3;
  const currentAssets=new Set(["asset-old","asset-b","asset-c"]);
  const displayed=buildPendingCandidateWorkspaceCards(pkg,"binding-1",currentAssets,"brand_profile");
  assert.equal(pkg.thumbnail.launch_variant_revisions.includes(old as never),true,"the previous immutable launch remains available");
  assert.equal(displayed.length,1);
  assert.equal(displayed[0]?.id,"launch-a");
  assert.equal(displayed[0]?.assetPath,"new.png");
  assert.equal(displayed[0]?.recipe?.revision,2);
  assert.equal(displayed[0]?.recipe?.treatment.placement.vertical,"bottom");
  assert.equal(displayed[0]?.recipe?.presentation_override?.logo_placement,"top_left");
  const reloaded=buildPendingCandidateWorkspaceCards(structuredClone(pkg),"binding-1",currentAssets,"brand_profile");
  assert.equal(reloaded[0]?.assetPath,"new.png","reload resolves the edited canonical launch revision");
});
