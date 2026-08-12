import type { EpisodePackageV3, ThumbnailCandidateEligibility, ThumbnailRenderRecipe } from "./episode-package-v3";
import type { ThumbnailCandidateAuthorityProjection } from "./hearth-thumbnail-v3-api";

export type CandidateWorkspaceCard = {
  id: string; ordinal: number; eligibility: ThumbnailCandidateEligibility; quenchEligible: boolean;
  recipe: ThumbnailRenderRecipe | null; title: string; concept: string; artworkHash: string; compositeHash: string;
  bindingRevision: number; styleSource: "brand_profile" | "forge_standard"; readability: { passed: boolean; score: number | null; treatment: string; evidenceHash: string };
  distinctionReasons: string[]; raw: Record<string, unknown>; assetPath: string; logoApplied: boolean;
};

function text(value:unknown){return typeof value==="string"?value:"";}
export function buildCandidateWorkspaceCards(pkg:EpisodePackageV3,authority:ThumbnailCandidateAuthorityProjection|null):CandidateWorkspaceCard[]{
  const authoritativeCandidates=authority?.candidates??[];
  if(!authoritativeCandidates.length){
    const launches=pkg.thumbnail.launch_variant_revisions.filter((entry)=>entry.status==="ready").slice(-3);
    return launches.map((launch,index)=>{const recipe=pkg.thumbnail.render_recipes.find((entry)=>entry.id===launch.recipe_id&&entry.revision===launch.recipe_revision)??null;const concept=recipe?pkg.thumbnail.concept_revisions.find((entry)=>entry.concept_revision_id===recipe.concept_revision_id):null;const base=pkg.thumbnail.base_versions.find((entry)=>entry.id===launch.base_version_id);const evidence=launch.snapshot.readability_evidence;return{id:launch.launch_variant_id,ordinal:index+1,eligibility:"blocked",quenchEligible:false,recipe,title:recipe?.title_text??"Recipe unavailable",concept:concept?.headline??"Concept unavailable",artworkHash:base?.content_hash??"",compositeHash:launch.snapshot.content_hash,bindingRevision:Number(launch.snapshot.brand_binding_context?.binding_revision??0),styleSource:launch.snapshot.style_source==="forge_standard"?"forge_standard":"brand_profile",readability:{passed:evidence?.passed===true,score:typeof evidence?.aggregate_score==="number"?evidence.aggregate_score:null,treatment:evidence?.applied_treatment??"pending evidence",evidenceHash:String(evidence?.evidence_hash??"")},distinctionReasons:[index===0?"set baseline":"new canonical launch"],raw:{launch_variant_id:launch.launch_variant_id},assetPath:launch.snapshot.asset_path,logoApplied:Boolean(launch.snapshot.brand_logo_asset_revision_id)};});
  }
  const ordered=[...authoritativeCandidates].sort((a,b)=>Number(a.candidate_ordinal)-Number(b.candidate_ordinal));
  return ordered.map((candidate,index)=>{const recipe=pkg.thumbnail.render_recipes.find((r)=>r.id===candidate.recipe_id&&r.revision===candidate.recipe_revision)??null;const concept=pkg.thumbnail.concept_revisions.find((c)=>c.concept_revision_id===candidate.concept_revision_id);const launch=pkg.thumbnail.launch_variant_revisions.find((l)=>l.snapshot.asset_id===candidate.composite_asset_id);const evidence=launch?.snapshot.readability_evidence;const previous=ordered[index-1];const reasons:string[]=[];
    if(!previous)reasons.push("set baseline");else{if(candidate.title_revision_id!==previous.title_revision_id)reasons.push("title revision");if(candidate.concept_revision_id!==previous.concept_revision_id)reasons.push("concept revision");if(candidate.base_artwork_content_hash!==previous.base_artwork_content_hash)reasons.push("base artwork");if(candidate.structural_composition_fingerprint!==previous.structural_composition_fingerprint)reasons.push("structural composition");}
    const eligibility=text(candidate.eligibility_state) as ThumbnailCandidateEligibility;return{id:text(candidate.id),ordinal:Number(candidate.candidate_ordinal),eligibility,quenchEligible:eligibility==="current"||eligibility==="approved_historical_brand",recipe,title:recipe?.title_text||(text(candidate.title_text)||"Recovered canonical thumbnail"),concept:concept?.headline??text(candidate.concept_revision_id),artworkHash:text(candidate.base_artwork_content_hash),compositeHash:text(candidate.composite_content_hash),bindingRevision:Number(candidate.candidate_binding_revision),styleSource:candidate.style_source==="forge_standard"?"forge_standard":"brand_profile",readability:{passed:evidence?.passed===true||candidate.readability_passed===true,score:typeof evidence?.aggregate_score==="number"?evidence.aggregate_score:typeof candidate.readability_score==="number"?candidate.readability_score:null,treatment:evidence?.applied_treatment||(text(candidate.readability_treatment)||"evidence on canonical candidate"),evidenceHash:text(candidate.readability_evidence_hash)},distinctionReasons:reasons,raw:candidate,assetPath:text(candidate.asset_path).trim()||launch?.snapshot.asset_path?.trim()||"",logoApplied:Boolean(launch?.snapshot.brand_logo_asset_revision_id||candidate.brand_logo_asset_revision_id)};});
}

export function buildPendingCandidateWorkspaceCards(
  pkg: EpisodePackageV3,
  _activeBindingId: string | null,
  currentCompositeAssetIds: ReadonlySet<string>,
  requiredStyleSource: "brand_profile" | "forge_standard" | null = null,
): CandidateWorkspaceCard[] {
  const eligible = pkg.thumbnail.launch_variant_revisions.filter((entry) => {
    return entry.status === "ready"
      && (!requiredStyleSource || entry.snapshot.style_source === requiredStyleSource)
      && !currentCompositeAssetIds.has(entry.snapshot.asset_id);
  });
  const latestByLaunch = new Map<string, (typeof eligible)[number]>();
  for (const launch of eligible) {
    const prior = latestByLaunch.get(launch.launch_variant_id);
    if (!prior || launch.revision > prior.revision) latestByLaunch.set(launch.launch_variant_id, launch);
  }
  const launches = [...latestByLaunch.values()].slice(-3);
  if (!launches.length) return [];
  const pendingPackage = { ...pkg, thumbnail: { ...pkg.thumbnail, launch_variant_revisions: launches } };
  return buildCandidateWorkspaceCards(pendingPackage, null);
}

export function candidateWorkspaceSummary(cards:CandidateWorkspaceCard[]){return{complete:cards.length>=3,quenchEligibleCount:cards.filter((c)=>c.quenchEligible).length,blockedCount:cards.filter((c)=>c.eligibility==="blocked").length,requiresReapprovalCount:cards.filter((c)=>c.eligibility==="requires_reapproval").length};}
