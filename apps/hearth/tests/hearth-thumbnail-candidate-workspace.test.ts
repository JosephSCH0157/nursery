import assert from "node:assert/strict";
import test from "node:test";
import type { EpisodePackageV3, ThumbnailRenderRecipe } from "../src/lib/episode-package-v3";
import type { ThumbnailCandidateAuthorityProjection } from "../src/lib/hearth-thumbnail-v3-api";
import { buildCandidateWorkspaceCards, candidateWorkspaceSummary } from "../src/lib/hearth-thumbnail-candidate-workspace";

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
