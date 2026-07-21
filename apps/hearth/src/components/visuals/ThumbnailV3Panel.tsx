import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  THUMBNAIL_COMPOSITION_ENGINE_VERSION,
  THUMBNAIL_PROMPT_TEMPLATE_VERSION,
  deriveThumbnailPromptPack,
  type EpisodePackageV3,
  type ThumbnailBrandMode,
  type ThumbnailRenderRecipe,
  type ThumbnailVariationLocks,
  type ThumbnailRequestedStyleSource,
} from "../../lib/episode-package-v3";
import { refineConcept, saveRenderRecipe } from "../../lib/hearth-thumbnail-v3-authority";
import { isValidThumbnailPair, resolveCanonicalThumbnailPair } from "../../lib/hearth-thumbnail-pairing";
import { buildCandidateWorkspaceCards, candidateWorkspaceSummary } from "../../lib/hearth-thumbnail-candidate-workspace";
import { buildThumbnailDirections, creatorBrandStatus, creatorThumbnailError } from "../../lib/hearth-thumbnail-workspace-view-model";
import { readHearthAiRuntimeStatus, writeHearthAiRuntimeStatus } from "../../lib/ai-runtime-status";
import { DEFAULT_VARIATION_LOCKS, appendVariationBatch, createDeterministicVariationBatch, promoteRecipeVariation } from "../../lib/hearth-thumbnail-variations";
import {
  appendThumbnailMemoryInterpretation,
  critiqueThumbnailDirection,
  loadThumbnailMemoryProjection,
  loadThumbnailLedgerProjection,
  applyLedgerObservationAsEditorialRevision,
  projectThumbnailLaunchFacts,
  type ThumbnailMemoryProjection,
  type ThumbnailLedgerProjection,
} from "../../lib/hearth-thumbnail-editorial-memory";
import {
  commitEpisodePackageV3Mutation,
  commitOutsideToolBaseArtwork,
  commitThumbnailLaunchComposite,
  commitReadyLaunchesAsCandidateSet,
  decideThumbnailCandidateHistoricalBrand,
  generateForgeAiBaseArtwork,
  loadThumbnailCompositePreview,
  readCanonicalThumbnailWorkspaceV3,
  readThumbnailBrandAuthorityStatus,
  readThumbnailCandidateAuthorityProjection,
  type ThumbnailCandidateAuthorityProjection,
  type ThumbnailBrandAuthorityStatus,
  type ThumbnailSaveState,
} from "../../lib/hearth-thumbnail-v3-api";

export function CanonicalThumbnailPreview(props: { workpieceId: string; assetPath: string; alt: string; className: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setDataUrl(null);
    void loadThumbnailCompositePreview({ workpieceId: props.workpieceId, assetPath: props.assetPath }).then((result) => {
      if (active && result.ok) setDataUrl(result.dataUrl);
    });
    return () => { active = false; };
  }, [props.assetPath, props.workpieceId]);
  return dataUrl
    ? <img src={dataUrl} alt={props.alt} className={props.className} />
    : <div className={props.className} role="img" aria-label={`${props.alt} loading`} />;
}

type Props = {
  workspaceId: string;
  workpieceId: string;
  approvedScriptVersion: number;
  onGenerateConcepts: () => Promise<{ ok: boolean; reason?: string; entityId?: string; disposition?: "created" | "existing"; stage?: string } | void>;
  onRecoverConcepts: () => Promise<{ ok: boolean; reason?: string; entityId?: string; disposition?: "created" | "existing"; stage?: string } | void>;
  isGeneratingConcepts: boolean;
  onOpenFraming: () => void;
  onCanonicalProgress?: (progress: { conceptRevisionCount: number; baseVersionCount: number; candidateCount: number; eligibleCandidateCount: number; previewAssetPaths: string[] }) => void;
};

export function resolveConceptSetPresentation(sets: EpisodePackageV3["thumbnail"]["concept_sets"]) {
  const available = sets.filter((set) => set.state !== "archived");
  const archived = sets.filter((set) => set.state === "archived");
  return {
    available,
    archived,
    mode: available.length === 0 ? "empty" as const : available.length === 1 ? "label" as const : "selector" as const,
  };
}

const emptyTreatment = {
  typography: { color: "#FFFFFF", max_lines: 3 },
  placement: { vertical: "bottom", horizontal_padding_percent: 8 },
  safe_zone: { enabled: true }, shadow: { color: "#000000", opacity: 0.7 }, treatment: {},
};

export default function ThumbnailV3Panel(props: Props) {
  const [pkg, setPkg] = useState<EpisodePackageV3 | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<ThumbnailSaveState>("saved");
  const [selectedGenerationState, setSelectedGenerationState] = useState<"idle" | "preparing" | "generating">("idle");
  const [selectedGenerationElapsedSec, setSelectedGenerationElapsedSec] = useState(0);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [titleId, setTitleId] = useState<string>("");
  const [titleRevision, setTitleRevision] = useState<number | null>(null);
  const [titleText, setTitleText] = useState("");
  const [providerId, setProviderId] = useState("forge");
  const [aspect, setAspect] = useState<"16:9" | "1:1" | "9:16">("16:9");
  const [brandStatus, setBrandStatus] = useState<ThumbnailBrandAuthorityStatus | null>(null);
  const [styleSource, setStyleSource] = useState<ThumbnailRequestedStyleSource>("auto");
  const [candidateAuthority, setCandidateAuthority] = useState<ThumbnailCandidateAuthorityProjection | null>(null);
  const [candidateEditRecipeIdentity, setCandidateEditRecipeIdentity] = useState<{ id: string; revision: number } | null>(null);
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [maxLines, setMaxLines] = useState(3);
  const [verticalPlacement, setVerticalPlacement] = useState<"top" | "center" | "bottom">("bottom");
  const [horizontalPadding, setHorizontalPadding] = useState(8);
  const [shadowColor, setShadowColor] = useState("#000000");
  const [shadowOpacity, setShadowOpacity] = useState(0.7);
  const [readabilityTreatment, setReadabilityTreatment] = useState<"automatic" | "none" | "outline" | "shadow" | "gradient" | "backing">("automatic");
  const [logoVisible, setLogoVisible] = useState(true);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [memoryProjection, setMemoryProjection] = useState<ThumbnailMemoryProjection>({ launchFacts: [], activeInterpretations: [] });
  const [ledgerProjection, setLedgerProjection] = useState<ThumbnailLedgerProjection | null>(null);
  const [ledgerState, setLedgerState] = useState<"loading" | "loaded" | "unavailable">("loading");
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [memoryState, setMemoryState] = useState<"loading" | "loaded" | "unavailable">("loading");
  const [memoryError, setMemoryError] = useState<string | null>(null);
  const [editorialNote, setEditorialNote] = useState("");
  const [interpretationSaving, setInterpretationSaving] = useState(false);
  const [variationLocks, setVariationLocks] = useState<ThumbnailVariationLocks>(DEFAULT_VARIATION_LOCKS);
  const [variationBrandMode, setVariationBrandMode] = useState<ThumbnailBrandMode>("strict_brand");
  const [variationCount, setVariationCount] = useState(3);
  const [selectedVariationId, setSelectedVariationId] = useState<string | null>(null);
  const outsideUploadRef = useRef<HTMLInputElement | null>(null);
  const styleChoiceRef = useRef<HTMLElement | null>(null);

  const reload = useCallback(async () => {
    try {
      const canonical = await readCanonicalThumbnailWorkspaceV3({ workpieceId: props.workpieceId, workspaceId: props.workspaceId });
      const projected = canonical.episodePackage.brand.binding?.active;
      setBrandStatus(await readThumbnailBrandAuthorityStatus({ workspaceId: props.workspaceId, workpieceId: props.workpieceId,
        projectedBindingId: projected?.id ?? null, projectedBindingRevision: projected?.revision ?? null }));
      const nextCandidateAuthority=await readThumbnailCandidateAuthorityProjection({workspaceId:props.workspaceId,workpieceId:props.workpieceId});
      setCandidateAuthority(nextCandidateAuthority);
      setPkg(canonical.episodePackage); setToken(canonical.metadataUpdatedAt); setLoadError(null);
      const lastStyle = canonical.episodePackage.thumbnail.launch_variant_revisions.at(-1)?.snapshot.style_source;
      setStyleSource((current) => current === "auto" && lastStyle ? lastStyle : current);
      props.onCanonicalProgress?.({
        conceptRevisionCount: canonical.episodePackage.thumbnail.concept_revisions.length,
        baseVersionCount: canonical.episodePackage.thumbnail.base_versions.length,
        candidateCount: nextCandidateAuthority.candidates.length,
        eligibleCandidateCount: nextCandidateAuthority.candidates.filter((candidate)=>candidate.eligibility_state==="current"||candidate.eligibility_state==="approved_historical_brand").length,
        previewAssetPaths: nextCandidateAuthority.candidates.map((candidate) => {
          const launch = canonical.episodePackage.thumbnail.launch_variant_revisions.find((entry) => entry.snapshot.asset_id === candidate.composite_asset_id);
          return launch?.snapshot.asset_path ?? "";
        }).filter(Boolean).slice(0, 3),
      });
      const pair = resolveCanonicalThumbnailPair(canonical.episodePackage);
      const pairSet = pair.concept
        ? canonical.episodePackage.thumbnail.concept_sets.find((set) => set.id === pair.concept?.concept_set_id)
        : null;
      setSelectedSetId(pairSet?.id ?? canonical.episodePackage.thumbnail.active_concept_set_id);
      setSelectedRevisionId(pair.concept?.concept_revision_id ?? null);
      setTitleId(pair.title?.id ?? "");
      setTitleRevision(pair.title?.revision ?? null);
      setTitleText(pair.recipe?.title_text ?? "");
      setMemoryState("loading");
      try {
        await projectThumbnailLaunchFacts({ workspaceId: props.workspaceId, workpieceId: props.workpieceId, episodePackage: canonical.episodePackage });
        setMemoryProjection(await loadThumbnailMemoryProjection(props.workspaceId));
        setMemoryState("loaded"); setMemoryError(null);
      } catch (error) {
        setMemoryState("unavailable");
        setMemoryError(error instanceof Error ? error.message : "Workspace thumbnail memory is unavailable.");
      }
      setLedgerState("loading");
      try {
        setLedgerProjection(await loadThumbnailLedgerProjection(props.workspaceId)); setLedgerState("loaded"); setLedgerError(null);
      } catch (error) {
        setLedgerProjection(null); setLedgerState("unavailable");
        setLedgerError(error instanceof Error ? error.message : "Ledger Intelligence is unavailable.");
      }
      return canonical;
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load thumbnail authority."); }
    return null;
  }, [props.onCanonicalProgress, props.workpieceId, props.workspaceId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (pkg && new URLSearchParams(window.location.search).get("thumbnail_focus") === "style") styleChoiceRef.current?.focus();
  }, [pkg]);
  useEffect(() => {
    if (saveState !== "editing") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const warnOnNavigation = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor && !window.confirm("Discard unsaved thumbnail recipe changes?")) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", warnOnNavigation, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", warnOnNavigation, true); };
  }, [saveState]);
  const conceptSetPresentation = resolveConceptSetPresentation(pkg?.thumbnail.concept_sets ?? []);
  const availableSets = conceptSetPresentation.available;
  const archivedSets = conceptSetPresentation.archived;
  const activeSet = availableSets.find((set) => set.id === selectedSetId) ?? availableSets[0] ?? null;
  const revisions = useMemo(() => activeSet && pkg
    ? pkg.thumbnail.concept_revisions.filter((entry) => entry.concept_set_id === activeSet.id)
      .sort((left, right) => left.concept_lineage_id.localeCompare(right.concept_lineage_id) || left.revision_number - right.revision_number)
    : [], [activeSet, pkg]);
  const selectedConcept = revisions.find((entry) => entry.concept_revision_id === selectedRevisionId)
    ?? revisions[0] ?? null;
  useEffect(() => { if (selectedConcept) setSelectedRevisionId(selectedConcept.concept_revision_id); }, [selectedConcept?.concept_revision_id]);
  const canonicalPair = pkg ? resolveCanonicalThumbnailPair(pkg) : { recipe: null, concept: null, title: null };
  const candidateEditRecipe = candidateEditRecipeIdentity && pkg
    ? pkg.thumbnail.render_recipes.find((recipe) => recipe.id === candidateEditRecipeIdentity.id && recipe.revision === candidateEditRecipeIdentity.revision) ?? null
    : null;
  const activeRecipe = candidateEditRecipe ?? canonicalPair.recipe;
  const candidateCards = useMemo(() => pkg ? buildCandidateWorkspaceCards(pkg, candidateAuthority) : [], [candidateAuthority, pkg]);
  const candidateSummary = useMemo(() => candidateWorkspaceSummary(candidateCards), [candidateCards]);
  const readyLaunchCount = pkg?.thumbnail.launch_variant_revisions.filter((entry) => entry.status === "ready" && entry.snapshot.readability_evidence?.passed === true).length ?? 0;
  const thumbnailSetComplete = Boolean(candidateAuthority?.candidate_set) && candidateSummary.quenchEligibleCount === 3 && candidateCards.length === 3;
  useEffect(() => {
    if (!activeRecipe) return;
    const typography = activeRecipe.treatment.typography as Record<string, unknown>;
    const placement = activeRecipe.treatment.placement as Record<string, unknown>;
    const shadow = activeRecipe.treatment.shadow as Record<string, unknown>;
    setSelectedRevisionId(activeRecipe.concept_revision_id);
    setTitleId(activeRecipe.title_id); setTitleRevision(activeRecipe.title_revision); setTitleText(activeRecipe.title_text); setProviderId(activeRecipe.provider_id);
    setAspect(activeRecipe.intended_aspect_ratio);
    setTextColor(typeof typography.color === "string" ? typography.color : "#FFFFFF");
    setMaxLines(typeof typography.max_lines === "number" ? typography.max_lines : 3);
    setVerticalPlacement(placement.vertical === "top" || placement.vertical === "center" ? placement.vertical : "bottom");
    setHorizontalPadding(typeof placement.horizontal_padding_percent === "number" ? placement.horizontal_padding_percent : 8);
    setShadowColor(typeof shadow.color === "string" ? shadow.color : "#000000");
    setShadowOpacity(typeof shadow.opacity === "number" ? shadow.opacity : 0.7);
    setReadabilityTreatment(activeRecipe.presentation_override?.decision_origin === "explicit_user" && activeRecipe.presentation_override.treatment
      ? activeRecipe.presentation_override.treatment : "automatic");
    setLogoVisible(activeRecipe.presentation_override?.logo_visible !== false);
    setSaveState("saved");
  }, [activeRecipe?.id, activeRecipe?.revision]);
  const selectedTitle = pkg?.seo.titles.find((entry) => entry.id === titleId && entry.revision === titleRevision) ?? null;
  const selectedStrategy = pkg && selectedConcept ? pkg.thumbnail.creative_strategies.find(
    (entry) => entry.id === selectedConcept.strategy_id && entry.revision === selectedConcept.strategy_revision,
  ) ?? null : null;
  const selectedBrief = pkg && selectedConcept ? pkg.thumbnail.creative_briefs.find(
    (entry) => entry.id === selectedConcept.creative_brief_id && entry.revision === selectedConcept.creative_brief_revision,
  ) ?? null : null;
  const editorialCritique = useMemo(() => critiqueThumbnailDirection({ projection: memoryProjection,
    currentBrief: selectedBrief, currentRecipe: activeRecipe }), [activeRecipe, memoryProjection, selectedBrief]);
  const activeVariationBatch = pkg?.thumbnail.variation_batches.find((entry) => entry.id === pkg.thumbnail.active_variation_batch_id)
    ?? pkg?.thumbnail.variation_batches.at(-1) ?? null;
  const selectedVariation = activeVariationBatch?.variations.find((entry) => entry.id === selectedVariationId)
    ?? activeVariationBatch?.variations[0] ?? null;
  const variationConcept = selectedVariation && pkg ? pkg.thumbnail.concept_revisions.find(
    (entry) => entry.concept_revision_id === selectedVariation.candidate_recipe.concept_revision_id) ?? null : null;
  const variationBrief = variationConcept && pkg ? pkg.thumbnail.creative_briefs.find(
    (entry) => entry.id === variationConcept.creative_brief_id && entry.revision === variationConcept.creative_brief_revision) ?? null : null;
  const variationCritique = useMemo(() => critiqueThumbnailDirection({ projection: memoryProjection,
    currentBrief: variationBrief, currentRecipe: selectedVariation?.candidate_recipe ?? null }), [memoryProjection, selectedVariation, variationBrief]);
  const persistedPairIsSelected = Boolean(activeRecipe && selectedConcept && selectedTitle
    && activeRecipe.concept_revision_id === selectedConcept.concept_revision_id
    && activeRecipe.title_id === selectedTitle.id
    && activeRecipe.title_revision === selectedTitle.revision);
  const validSelectedPair = isValidThumbnailPair({ concept: selectedConcept, title: selectedTitle });
  const promptPack = persistedPairIsSelected && activeRecipe && selectedConcept
    ? deriveThumbnailPromptPack({ recipe: activeRecipe, concept: selectedConcept, strategy: selectedStrategy, brief: selectedBrief }) : null;
  const conceptSaveLabel = pkg?.thumbnail.concept_sets.length === 0 && saveState === "saved" ? "not saved" : saveState;
  const directions = useMemo(() => pkg ? buildThumbnailDirections(pkg, activeSet?.id ?? null) : [], [activeSet?.id, pkg]);
  const brandPresentation = creatorBrandStatus(brandStatus);

  useEffect(() => {
    if (selectedGenerationState !== "generating") {
      setSelectedGenerationElapsedSec(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSelectedGenerationElapsedSec(Math.max(1, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [selectedGenerationState]);

  const runConceptPersistence = async (action: () => Promise<unknown>, failureMessage: string, recovery = false) => {
    const beforeIds = new Set(pkg?.thumbnail.concept_sets.map((set) => set.id) ?? []);
    setLoadError(null); setSaveState("saving");
    let outcome: unknown;
    try { outcome = await action(); }
    catch (error) {
      setSaveState("error");
      setLoadError(error instanceof Error ? error.message : failureMessage);
      return;
    }
    const canonical = await reload();
    const result = outcome && typeof outcome === "object" ? outcome as { ok?: boolean; reason?: string; entityId?: string; disposition?: string; stage?: string } : null;
    if (result?.ok === false) {
      setSaveState("error");
      setLoadError(`${result.stage ? `${result.stage}: ` : ""}${result.reason ?? failureMessage}`);
      return;
    }
    const created = canonical?.episodePackage.thumbnail.concept_sets.some((set) => !beforeIds.has(set.id)) ?? false;
    if (recovery && result?.ok && result.disposition === "existing" && result.entityId) {
      setSelectedSetId(result.entityId); setSaveState("saved"); setLoadError("This stored generation was already recovered; the existing canonical concept set is selected."); return;
    }
    if (!created) { setSaveState("error"); setLoadError(failureMessage); return; }
    if (result?.entityId) {
      setSelectedSetId(result.entityId);
      setSelectedRevisionId(canonical?.episodePackage.thumbnail.concept_revisions.find((entry) => entry.concept_set_id === result.entityId)?.concept_revision_id ?? null);
    }
    setSaveState("saved");
  };

  const commitSetMutation = async (next: EpisodePackageV3, setId: string, eventName: string) => {
    setSaveState("saving");
    const result = await commitEpisodePackageV3Mutation({ workpieceId: props.workpieceId, expectedMetadataUpdatedAt: token,
      nextEpisodePackage: next, mutation: { kind: "concept_set", entityId: setId }, eventName });
    if (!result.ok) { setSaveState("error"); setLoadError(result.error); if (result.canonical) { setPkg(result.canonical.episodePackage); setToken(result.canonical.metadataUpdatedAt); } return; }
    setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSaveState("saved");
  };

  const saveRecipe = async (reviewed: boolean) => {
    if (!pkg || !selectedConcept) return null;
    const title = pkg.seo.titles.find((entry) => entry.id === titleId && entry.revision === titleRevision);
    if (!title) { setLoadError("Choose an exact framing title before saving the recipe."); return null; }
    const now = new Date().toISOString();
    const recipe: ThumbnailRenderRecipe = {
      id: activeRecipe?.id ?? crypto.randomUUID(), revision: (activeRecipe?.revision ?? 0) + 1,
      concept_revision_id: selectedConcept.concept_revision_id, title_id: title.id, title_revision: title.revision,
      strategy_id: selectedConcept.strategy_id, strategy_revision: selectedConcept.strategy_revision,
      creative_brief_id: selectedConcept.creative_brief_id, creative_brief_revision: selectedConcept.creative_brief_revision,
      provider_id: providerId, provider_settings: activeRecipe?.provider_settings ?? {},
      intended_aspect_ratio: aspect, brand_template_id: null,
      brand_template_revision: null,
      presentation_override: readabilityTreatment === "automatic" && logoVisible ? null : {
        text_color: readabilityTreatment === "automatic" ? null : textColor,
        treatment: readabilityTreatment === "automatic" ? null : readabilityTreatment,
        logo_visible: logoVisible, logo_placement: null, logo_opacity: null,
        decision_origin: readabilityTreatment === "automatic" ? "automatic" : "explicit_user",
      },
      title_text: (title.thumbnail_text || title.text).trim(), treatment: {
        ...(activeRecipe?.treatment ?? emptyTreatment),
        typography: { color: textColor, max_lines: maxLines },
        placement: { vertical: verticalPlacement, horizontal_padding_percent: horizontalPadding },
        shadow: { color: shadowColor, opacity: shadowOpacity },
      },
      prompt_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
      composition_engine_version: THUMBNAIL_COMPOSITION_ENGINE_VERSION,
      composition_revision: (activeRecipe?.composition_revision ?? 0) + 1,
      prompt_review_state: reviewed ? "reviewed" : "unreviewed",
      last_reviewed_template_version: reviewed ? THUMBNAIL_PROMPT_TEMPLATE_VERSION : null,
      created_at: activeRecipe?.created_at ?? now, updated_at: now,
    };
    const next = saveRenderRecipe({ episodePackage: pkg, recipe }); setSaveState("saving");
    const result = await commitEpisodePackageV3Mutation({ workpieceId: props.workpieceId, expectedMetadataUpdatedAt: token,
      nextEpisodePackage: next, mutation: { kind: "recipe", entityId: recipe.id, revision: recipe.revision },
      eventName: reviewed ? "hearth.thumbnail.prompt.reviewed.v3" : "hearth.thumbnail.recipe.saved.v3" });
    if (!result.ok) { setSaveState("error"); setLoadError(result.error); return null; }
    setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSaveState("saved");
    if (candidateEditRecipeIdentity) setCandidateEditRecipeIdentity({ id: recipe.id, revision: recipe.revision });
    void (async () => { try {
      await projectThumbnailLaunchFacts({ workspaceId: props.workspaceId, workpieceId: props.workpieceId, episodePackage: result.episodePackage });
      setMemoryProjection(await loadThumbnailMemoryProjection(props.workspaceId)); setMemoryState("loaded"); setMemoryError(null);
    } catch (error) { setMemoryState("unavailable"); setMemoryError(error instanceof Error ? error.message : "Workspace thumbnail memory is unavailable."); } })();
    return { episodePackage: result.episodePackage, metadataUpdatedAt: result.metadataUpdatedAt, recipe };
  };

  const renameSet = async () => {
    if (!activeSet || !pkg) return;
    const current = pkg;
    const name = window.prompt("Concept set name", activeSet.name)?.trim();
    if (!name || name === activeSet.name) return;
    await commitSetMutation({ ...current, thumbnail: { ...current.thumbnail, concept_sets: current.thumbnail.concept_sets.map((set) => set.id === activeSet.id ? { ...set, name } : set) } }, activeSet.id, "hearth.thumbnail.concept-set.renamed.v3");
  };

  const latestReadability = pkg?.thumbnail.launch_variant_revisions.at(-1)?.snapshot.readability_evidence ?? null;

  const archiveActiveSet = async () => {
    if (!activeSet || !pkg) return;
    const nextAvailable = availableSets.filter((set) => set.id !== activeSet.id);
    const nextActiveId = pkg.thumbnail.active_concept_set_id === activeSet.id
      ? (nextAvailable[0]?.id ?? null)
      : pkg.thumbnail.active_concept_set_id;
    await commitSetMutation({ ...pkg, thumbnail: {
      ...pkg.thumbnail,
      active_concept_set_id: nextActiveId,
      concept_sets: pkg.thumbnail.concept_sets.map((set) => set.id === activeSet.id ? { ...set, state: "archived" } : set),
    } }, activeSet.id, "hearth.thumbnail.concept-set.state.v3");
    setSelectedSetId(nextActiveId);
  };

  const restoreSet = async (setId: string) => {
    if (!pkg) return;
    await commitSetMutation({ ...pkg, thumbnail: {
      ...pkg.thumbnail,
      active_concept_set_id: pkg.thumbnail.active_concept_set_id ?? setId,
      concept_sets: pkg.thumbnail.concept_sets.map((set) => set.id === setId ? { ...set, state: "active" } : set),
    } }, setId, "hearth.thumbnail.concept-set.state.v3");
    setSelectedSetId(setId);
  };

  const refineSelected = async () => {
    if (!selectedConcept || !pkg) return;
    const current = pkg;
    const imageConcept = window.prompt("Refined image concept", selectedConcept.image_concept)?.trim();
    if (!imageConcept) return;
    const revision = { ...selectedConcept, concept_revision_id: crypto.randomUUID(), revision_number: selectedConcept.revision_number + 1,
      supersedes_revision_id: selectedConcept.concept_revision_id, image_concept: imageConcept,
      normalized_prompt_basis: imageConcept.replace(/\s+/g, " "), created_at: new Date().toISOString(),
      provenance: { source: "manual_refinement", prior_revision_id: selectedConcept.concept_revision_id } };
    const next = refineConcept({ episodePackage: current, revision }); setSaveState("saving");
    const result = await commitEpisodePackageV3Mutation({ workpieceId: props.workpieceId, expectedMetadataUpdatedAt: token,
      nextEpisodePackage: next, mutation: { kind: "concept_revision", entityId: revision.concept_revision_id },
      protectedRelationships: current.thumbnail.base_versions.map((base) => ({ versionId: base.id, conceptRevisionId: base.concept_revision_id })),
      eventName: "hearth.thumbnail.concept.refined.v3" });
    if (!result.ok) { setSaveState("error"); setLoadError(result.error); return; }
    setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSelectedRevisionId(revision.concept_revision_id); setSaveState("saved");
  };

  const renderBase = async (source: "forge_ai" | "outside_tool", file?: File, prepared?: {
    episodePackage: EpisodePackageV3;
    metadataUpdatedAt: string | null;
    recipe: ThumbnailRenderRecipe;
  }) => {
    const renderPackage = prepared?.episodePackage ?? pkg;
    const renderToken = prepared?.metadataUpdatedAt ?? token;
    const renderRecipe = prepared?.recipe ?? activeRecipe;
    const recipeIsReviewed = prepared
      ? prepared.recipe.prompt_review_state === "reviewed"
      : promptPack?.review_state === "reviewed";
    if (!renderPackage || !selectedConcept || !renderRecipe || !recipeIsReviewed) {
      setLoadError("Review the prompt pack before choosing a renderer."); return;
    }
    setSaveState("saving"); const id = crypto.randomUUID(); const createdAt = new Date().toISOString();
    const base = { id, created_at: createdAt, concept_revision_id: selectedConcept.concept_revision_id,
      render_recipe_id: renderRecipe.id, render_recipe_revision: renderRecipe.revision,
      intended_aspect_ratio: renderRecipe.intended_aspect_ratio };
    let result;
    if (source === "forge_ai") {
      const priorAiRuntime = readHearthAiRuntimeStatus();
      writeHearthAiRuntimeStatus({ isAiProcessing: true });
      try {
        result = await generateForgeAiBaseArtwork({ workpieceId: props.workpieceId, workspaceId: props.workspaceId,
          expectedMetadataUpdatedAt: renderToken, episodePackage: renderPackage, baseVersion: base, operationId: crypto.randomUUID(), confirmSpend: true, alwaysApproveAiSpend: false });
      } finally {
        writeHearthAiRuntimeStatus({ isAiProcessing: priorAiRuntime.isAiProcessing });
      }
    } else {
      result = await commitOutsideToolBaseArtwork({ workpieceId: props.workpieceId, workspaceId: props.workspaceId,
        expectedMetadataUpdatedAt: renderToken, episodePackage: renderPackage,
        baseVersion: { ...base, source_type: "outside_tool", provider_id: "outside_tool", provider_request_id: null, mime_type: (file?.type || "image/png") as "image/png" },
        artwork: { sourceType: "outside_tool", bytes: new Uint8Array(await file!.arrayBuffer()), mimeType: (file!.type || "image/png") as "image/png", providerId: "outside_tool", operationId: crypto.randomUUID() } });
    }
    if (!result.ok) { setSaveState("error"); setLoadError(result.error); return; }
    setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSelectedBaseId(id);
    const composite = await commitThumbnailLaunchComposite({
      workpieceId: props.workpieceId,
      workspaceId: props.workspaceId,
      expectedMetadataUpdatedAt: result.metadataUpdatedAt,
      episodePackage: result.episodePackage,
      launchVariantId: crypto.randomUUID(),
      baseVersionId: id,
      operationId: crypto.randomUUID(),
      width: renderRecipe.intended_aspect_ratio === "9:16" ? 1080 : renderRecipe.intended_aspect_ratio === "1:1" ? 1080 : 1280,
      height: renderRecipe.intended_aspect_ratio === "9:16" ? 1920 : renderRecipe.intended_aspect_ratio === "1:1" ? 1080 : 720,
      encoding: { format: "png", quality: 100 },
      createdAt: new Date().toISOString(),
      requestedStyleSource: styleSource,
    });
    if (!composite.ok) { setSaveState("error"); setLoadError(`Base artwork was created, but the finished thumbnail could not be composed: ${composite.error}`); return; }
    setPkg(composite.episodePackage); setToken(composite.metadataUpdatedAt);
    const completedLaunch = composite.episodePackage.thumbnail.launch_variant_revisions.at(-1);
    if (styleSource === "brand_profile" && (
      completedLaunch?.snapshot.style_source !== "brand_profile"
      || !completedLaunch.snapshot.brand_logo_asset_revision_id
    )) {
      setSaveState("error");
      setLoadError("The thumbnail was created, but Tongs did not verify a brand logo overlay. It has not been represented as a My Brand result.");
      return;
    }
    setSaveState("saved");
    void (async () => { try {
      await projectThumbnailLaunchFacts({ workspaceId: props.workspaceId, workpieceId: props.workpieceId, episodePackage: composite.episodePackage });
      setMemoryProjection(await loadThumbnailMemoryProjection(props.workspaceId)); setMemoryState("loaded"); setMemoryError(null);
    } catch (error) { setMemoryState("unavailable"); setMemoryError(error instanceof Error ? error.message : "Workspace thumbnail memory is unavailable."); } })();
  };

  const generateSelectedThumbnail = async () => {
    if (!validSelectedPair || saveState === "saving" || selectedGenerationState !== "idle") return;
    if (styleSource === "brand_profile" && !brandPresentation.ready) {
      setLoadError("My Brand cannot be rendered yet. Tongs must verify an active Brand Profile and ready logo revision for this episode.");
      styleChoiceRef.current?.focus();
      return;
    }
    setLoadError(null);
    setSelectedGenerationState("preparing");
    try {
      if (persistedPairIsSelected && promptPack?.review_state === "reviewed") {
        setSelectedGenerationState("generating");
        await renderBase("forge_ai");
        return;
      }
      const prepared = await saveRecipe(true);
      if (!prepared) return;
      setSelectedGenerationState("generating");
      await renderBase("forge_ai", undefined, prepared);
    } catch (error) {
      setSaveState("error");
      setLoadError(error instanceof Error ? error.message : "Unable to generate the selected thumbnail.");
    } finally {
      setSelectedGenerationState("idle");
    }
  };

  const setPrimaryBase = async (baseId: string) => {
    const next = { ...pkg!, thumbnail: { ...pkg!.thumbnail, primary_base_version_id: baseId } }; setSaveState("saving");
    const result = await commitEpisodePackageV3Mutation({ workpieceId: props.workpieceId, expectedMetadataUpdatedAt: token,
      nextEpisodePackage: next, mutation: { kind: "primary", entityId: baseId }, eventName: "hearth.thumbnail.primary-base.selected.v3" });
    if (!result.ok) { setSaveState("error"); setLoadError(result.error); return; }
    setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSelectedBaseId(baseId); setSaveState("saved");
  };

  const createLaunchSnapshot = async () => {
    const baseId = selectedBaseId ?? pkg?.thumbnail.primary_base_version_id;
    if (!pkg || !baseId) { setLoadError("Choose ready base artwork before creating a launch snapshot."); return; }
    setSaveState("saving");
    const result = await commitThumbnailLaunchComposite({ workpieceId: props.workpieceId, workspaceId: props.workspaceId,
      expectedMetadataUpdatedAt: token, episodePackage: pkg, launchVariantId: crypto.randomUUID(), baseVersionId: baseId,
      operationId: crypto.randomUUID(), width: aspect === "9:16" ? 1080 : aspect === "1:1" ? 1080 : 1280,
      height: aspect === "9:16" ? 1920 : aspect === "1:1" ? 1080 : 720,
      encoding: { format: "png", quality: 100 }, createdAt: new Date().toISOString(), requestedStyleSource: styleSource });
    if (!result.ok) { setSaveState("error"); setLoadError(result.error); return; }
    setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSaveState("saved");
    try {
      await projectThumbnailLaunchFacts({ workspaceId: props.workspaceId, workpieceId: props.workpieceId, episodePackage: result.episodePackage });
      setMemoryProjection(await loadThumbnailMemoryProjection(props.workspaceId)); setMemoryState("loaded"); setMemoryError(null);
    } catch (error) { setMemoryState("unavailable"); setMemoryError(error instanceof Error ? error.message : "Workspace thumbnail memory is unavailable."); }
  };

  const finishThumbnailSet = async () => { if(!pkg)return;setSaveState("saving");setLoadError(null);try{const result=await commitReadyLaunchesAsCandidateSet({workpieceId:props.workpieceId,workspaceId:props.workspaceId,episodePackage:pkg,expectedMetadataUpdatedAt:token});if(!result.ok){setSaveState("error");setLoadError(result.error);return;}const authority=await readThumbnailCandidateAuthorityProjection({workspaceId:props.workspaceId,workpieceId:props.workpieceId});setPkg(result.episodePackage);setToken(result.metadataUpdatedAt);setCandidateAuthority(authority);const eligible=authority.candidates.filter((candidate)=>candidate.eligibility_state==="current"||candidate.eligibility_state==="approved_historical_brand");props.onCanonicalProgress?.({conceptRevisionCount:result.episodePackage.thumbnail.concept_revisions.length,baseVersionCount:result.episodePackage.thumbnail.base_versions.length,candidateCount:authority.candidates.length,eligibleCandidateCount:eligible.length,previewAssetPaths:eligible.map((candidate)=>result.episodePackage.thumbnail.launch_variant_revisions.find((entry)=>entry.snapshot.asset_id===candidate.composite_asset_id)?.snapshot.asset_path??"").filter(Boolean).slice(0,3)});setSaveState("saved");}catch(error){setSaveState("error");setLoadError(error instanceof Error?error.message:"Unable to finish the canonical thumbnail set.");}};
  const decideHistoricalCandidate=async(candidate:Record<string,unknown>,decision:"approved"|"revoked")=>{const setId=candidateAuthority?.candidate_set?.id,activeBindingId=candidateAuthority?.active_binding_id;if(!setId||!activeBindingId)return;const reason=window.prompt(decision==="approved"?"Reason for approving this older-brand candidate":"Reason for revoking this approval")?.trim();if(!reason)return;setSaveState("saving");try{await decideThumbnailCandidateHistoricalBrand({workpieceId:props.workpieceId,workspaceId:props.workspaceId,candidateRevisionId:String(candidate.id),candidateSetId:String(setId),activeBindingId,decision,reason,expectedDecisionId:typeof candidate.current_decision_id==="string"?candidate.current_decision_id:null,expectedDecisionRevision:Number(candidate.current_decision_revision??0)});setCandidateAuthority(await readThumbnailCandidateAuthorityProjection({workspaceId:props.workspaceId,workpieceId:props.workpieceId}));setSaveState("saved");}catch(error){setSaveState("error");setLoadError(error instanceof Error?error.message:"Unable to record historical-brand authorization.");}};

  const saveEditorialInterpretation = async () => {
    const summary = editorialNote.trim();
    if (!summary) return;
    setInterpretationSaving(true);
    try {
      await appendThumbnailMemoryInterpretation({ workspaceId: props.workspaceId, key: "workspace-editorial-note",
        type: "editorial_note", evidence: memoryProjection.launchFacts.slice(0, 5).map((entry) => entry.launch_identity),
        interpretation: { summary } });
      setMemoryProjection(await loadThumbnailMemoryProjection(props.workspaceId));
      setEditorialNote(""); setMemoryState("loaded"); setMemoryError(null);
    } catch (error) { setMemoryState("unavailable"); setMemoryError(error instanceof Error ? error.message : "Unable to save interpretation revision."); }
    finally { setInterpretationSaving(false); }
  };

  const applyLedgerGuidance = async (identity: string) => {
    const observation = ledgerProjection?.historical_observations.find((entry) => entry.identity === identity)
      ?? ledgerProjection?.heuristic_guidance.find((entry) => entry.identity === identity);
    if (!observation) return;
    setInterpretationSaving(true);
    try {
      await applyLedgerObservationAsEditorialRevision({ workspaceId: props.workspaceId, observation });
      setMemoryProjection(await loadThumbnailMemoryProjection(props.workspaceId)); setMemoryState("loaded"); setMemoryError(null);
    } catch (error) { setLedgerError(error instanceof Error ? error.message : "Unable to apply Ledger guidance."); }
    finally { setInterpretationSaving(false); }
  };

  const generateVariationBatch = async () => {
    if (!pkg || !activeRecipe) return;
    setSaveState("saving");
    try {
      const batch = createDeterministicVariationBatch({ episodePackage: pkg, sourceRecipe: activeRecipe,
        brandMode: variationBrandMode, locks: variationLocks, count: variationCount, createdAt: new Date().toISOString() });
      const next = appendVariationBatch(pkg, batch);
      const result = await commitEpisodePackageV3Mutation({ workpieceId: props.workpieceId, expectedMetadataUpdatedAt: token,
        nextEpisodePackage: next, mutation: { kind: "variation_batch", entityId: batch.id },
        eventName: "hearth.thumbnail.variation-batch.created.v3", eventPayload: { batch_id: batch.id, source_recipe_id: activeRecipe.id,
          source_recipe_revision: activeRecipe.revision, estimated_ai_credits: 0 } });
      if (!result.ok) { setSaveState("error"); setLoadError(result.error); return; }
      setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSelectedVariationId(batch.variations[0]?.id ?? null); setSaveState("saved");
    } catch (error) { setSaveState("error"); setLoadError(error instanceof Error ? error.message : "Unable to create controlled variations."); }
  };

  const promoteVariation = async () => {
    if (!pkg || !activeVariationBatch || !selectedVariation) return;
    setSaveState("saving");
    try {
      const next = promoteRecipeVariation({ episodePackage: pkg, batchId: activeVariationBatch.id,
        variationId: selectedVariation.id, createdAt: new Date().toISOString() });
      const promotion = next.thumbnail.variation_promotions.find((entry) => entry.variation_batch_id === activeVariationBatch.id && entry.variation_id === selectedVariation.id);
      if (!promotion) throw new Error("Variation promotion did not create canonical authority.");
      const result = await commitEpisodePackageV3Mutation({ workpieceId: props.workpieceId, expectedMetadataUpdatedAt: token,
        nextEpisodePackage: next, mutation: { kind: "variation_promotion", entityId: promotion.id },
        eventName: "hearth.thumbnail.variation.promoted.v3", eventPayload: { batch_id: activeVariationBatch.id,
          variation_id: selectedVariation.id, recipe_id: promotion.promoted_recipe_id, recipe_revision: promotion.promoted_recipe_revision } });
      if (!result.ok) { setSaveState("error"); setLoadError(result.error); return; }
      setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSaveState("saved");
    } catch (error) { setSaveState("error"); setLoadError(error instanceof Error ? error.message : "Unable to promote variation."); }
  };

  if (loadError && !pkg) return <div className="hs-inline-error">{loadError}<button type="button" onClick={() => void reload()}>Retry</button></div>;
  if (!pkg) return <div>Loading canonical thumbnail workspace…</div>;
  return <div className="hs-thumbnail-v3">
    <main className="hs-thumbnail-workspace" aria-label="Thumbnail creation workspace">
      <header className="hs-thumbnail-workspace-header">
        <div>
          <span className="hs-thumbnail-stage-label">Thumbnails</span>
          <h3>Create a three-thumbnail test set</h3>
          <p>Choose three distinct directions, compare them together, then send the finished set to Quench for testing.</p>
        </div>
        <div className="hs-thumbnail-readiness" aria-label="Episode readiness">
          <span>Script ready</span><span>Media map ready</span><span className={brandPresentation.ready ? "is-ready" : "is-blocked"}>{brandPresentation.label}</span>
        </div>
      </header>

      <section className="hs-thumbnail-friendly-blocker" aria-label="Thumbnail styling" ref={styleChoiceRef} tabIndex={-1}>
        <div><strong>Thumbnail style</strong><p>{brandPresentation.message}</p></div>
        <label>Use
          <select value={styleSource} onChange={(event) => setStyleSource(event.target.value as ThumbnailRequestedStyleSource)}>
            <option value="auto">Automatic</option>
            <option value="brand_profile">My brand</option>
            <option value="forge_standard">Forge standard</option>
          </select>
        </label>
        <a href={`/app/tongs?workspace_id=${encodeURIComponent(props.workspaceId)}&mode=branding&section=style&return_to=${encodeURIComponent(`${window.location.pathname}${window.location.search}${window.location.search ? "&" : "?"}thumbnail_focus=style`)}`}>Edit brand style in Tongs</a>
      </section>
      {loadError ? <div className="hs-inline-error" role="alert">{creatorThumbnailError(loadError)} <button type="button" onClick={() => void reload()}>Retry</button></div> : null}

      <section className="hs-thumbnail-stage" aria-labelledby="thumbnail-directions-heading">
        <div className="hs-thumbnail-stage-heading"><div><span>1</span><h4 id="thumbnail-directions-heading">Choose three directions</h4></div>
          {directions.length < 3 ? <button type="button" className="is-primary" disabled={props.isGeneratingConcepts || saveState === "saving"} onClick={() => void runConceptPersistence(props.onGenerateConcepts, "Hearth could not save the generated thumbnail directions. Your existing work is safe.")}>{props.isGeneratingConcepts ? "Creating directions…" : "Create thumbnail directions"}</button> : <small>Three pairwise-distinct editorial approaches</small>}
        </div>
        {directions.length ? <div className="hs-thumbnail-direction-grid">
          {directions.map((direction) => {
            const selected = direction.conceptRevisionId === selectedConcept?.concept_revision_id && direction.titleId === selectedTitle?.id;
            return <button type="button" key={direction.key} className={`hs-thumbnail-direction${selected ? " is-selected" : ""}`} aria-pressed={selected}
              onClick={() => { setSelectedRevisionId(direction.conceptRevisionId); if (direction.titleId) { setTitleId(direction.titleId); setTitleRevision(direction.titleRevision); setTitleText(direction.thumbnailText); } setSaveState("editing"); }}>
              <span className="hs-thumbnail-direction-name"><b>Direction {direction.key}</b><strong>{direction.name}</strong></span>
              <span><small>Thumbnail text</small><b>{direction.thumbnailText}</b></span>
              <span><small>Visual</small>{direction.visual}</span>
              <span><small>Approach</small>{direction.approach}</span>
              <span className="hs-thumbnail-direction-state">{selected ? "Selected direction" : "Choose direction"}</span>
            </button>;
          })}
        </div> : <p className="hs-thumbnail-calm-empty">Hearth will curate three complete thumbnail directions from the approved episode.</p>}
      </section>

      <section className="hs-thumbnail-stage" aria-labelledby="thumbnail-compare-heading">
        <div className="hs-thumbnail-stage-heading"><div><span>2</span><h4 id="thumbnail-compare-heading">Generate and compare</h4></div>
          <button type="button" className="is-primary" disabled={!validSelectedPair || saveState === "saving" || selectedGenerationState !== "idle" || (styleSource === "brand_profile" && !brandPresentation.ready)} onClick={() => void generateSelectedThumbnail()}>{selectedGenerationState === "preparing" ? "Preparing thumbnail…" : selectedGenerationState === "generating" ? "Generating thumbnail…" : "Generate selected thumbnail"}</button>
        </div>
        {selectedGenerationState === "generating" ? <p className="hs-inline-note" role="status" aria-live="polite">Forge AI is generating the image{selectedGenerationElapsedSec > 0 ? ` · ${selectedGenerationElapsedSec}s elapsed` : ""}. Image generation can take a minute or more; keep this page open.</p> : null}
        {candidateCards.length ? <div className="hs-thumbnail-focused-grid">
          {candidateCards.slice(0, 3).map((card, index) => {
            return <article key={card.id} className="hs-thumbnail-focused-card" aria-label={`Thumbnail ${String.fromCharCode(65 + index)}`}>
              <div className="hs-thumbnail-card-heading"><span className="hs-thumbnail-letter">{String.fromCharCode(65 + index)}</span><div><strong>{index === 0 ? "Recommended" : index === 1 ? "Strong alternate" : "Experimental"}</strong><small>Advisory, you choose the test set</small></div></div>
              <CanonicalThumbnailPreview workpieceId={props.workpieceId} assetPath={card.assetPath} className="hs-thumbnail-candidate-preview" alt={`Thumbnail ${String.fromCharCode(65 + index)}: ${card.title}`} />
              <div className="hs-thumbnail-card-status"><span>{card.styleSource === "forge_standard" ? "Forge standard" : "Brand style"}</span><span>{card.styleSource === "brand_profile" ? card.logoApplied ? "Brand logo applied" : "Brand logo not applied" : "No brand logo requested"}</span><span>Text {card.readability.passed ? "readable" : "needs review"}</span></div>
              <div className="hs-thumbnail-feed-row"><CanonicalThumbnailPreview workpieceId={props.workpieceId} assetPath={card.assetPath} className="hs-thumbnail-feed-preview" alt={`Feed-size thumbnail ${String.fromCharCode(65 + index)}`} /><div><strong>Feed-size preview</strong><p>{ledgerProjection?.historical_observations[0]?.summary ?? "Editorial, branding, and readability evidence"}</p><small>{ledgerProjection?.historical_observations[0]?.confidence ? `${ledgerProjection.historical_observations[0].confidence} confidence` : "Early estimate"}</small></div></div>
              <div className="hs-thumbnail-card-actions"><button type="button" onClick={() => { if (!card.recipe) return; setCandidateEditRecipeIdentity({ id: card.recipe.id, revision: card.recipe.revision }); setSelectedRevisionId(card.recipe.concept_revision_id); setTitleId(card.recipe.title_id); setTitleRevision(card.recipe.title_revision); }}>Edit thumbnail {String.fromCharCode(65 + index)}</button><button type="button" onClick={() => { if (card.recipe) { setCandidateEditRecipeIdentity({ id: card.recipe.id, revision: card.recipe.revision }); } }}>Try more variations</button></div>
            </article>;
          })}
        </div> : <div className="hs-thumbnail-generation-empty">
          <div><strong>No finished thumbnails yet</strong><p>Save and review the selected direction’s image prompt, then create its artwork. Hearth will keep each immutable version as you build the set.</p></div>
          <small>A three-image credit quote is not available from the current operation-cost API, so Hearth will not display or charge a made-up bundle price.</small>
        </div>}
        {ledgerState === "loaded" && !ledgerProjection?.measured_facts.length && !ledgerProjection?.historical_observations.length ? <p className="hs-thumbnail-calm-empty">No channel history yet. Hearth is ranking these using editorial, branding, and readability evidence.</p> : null}
      </section>

      {candidateEditRecipe ? <aside className="hs-thumbnail-editor" aria-label="Thumbnail editor">
        <div className="hs-thumbnail-editor-preview"><span>{selectedBrief?.subject_direction ?? selectedConcept?.image_concept}</span><strong style={{ color: textColor, textShadow: `0 2px 6px ${shadowColor}` }}>{titleText}</strong></div>
        <div className="hs-thumbnail-editor-controls"><div><h4>Edit thumbnail</h4><button type="button" onClick={() => setCandidateEditRecipeIdentity(null)}>Close editor</button></div><label>Thumbnail text<input value={titleText} readOnly /></label><label>Maximum lines<input type="number" min={1} max={5} value={maxLines} onChange={(event) => { setMaxLines(Number(event.target.value)); setSaveState("editing"); }} /></label><label>Text placement<select value={verticalPlacement} onChange={(event) => { setVerticalPlacement(event.target.value as typeof verticalPlacement); setSaveState("editing"); }}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label><label><input type="checkbox" checked={logoVisible} onChange={(event) => { setLogoVisible(event.target.checked); setSaveState("editing"); }} /> Show approved logo</label><button type="button" className="is-primary" onClick={() => void saveRecipe(false)}>Save as new version</button></div>
      </aside> : null}

      <div className="hs-thumbnail-completion" role="status" aria-live="polite">
        <div><strong>{thumbnailSetComplete ? "Thumbnail set complete" : `${Math.min(readyLaunchCount, 3)} of 3 thumbnails ready`}</strong><span>{thumbnailSetComplete ? "Saved with this episode and available for release preparation." : "Style recorded · Text readable · Candidate distinction verified when the set is finished"}</span></div>
        {!thumbnailSetComplete ? <button type="button" className="is-primary" disabled={saveState === "saving" || readyLaunchCount < 3} onClick={() => void finishThumbnailSet()}>Finish thumbnail set</button> : null}
      </div>
    </main>
    <details className="hs-thumbnail-advanced">
      <summary>History and technical details</summary>
      <div className="hs-thumbnail-advanced-body">
    <div className="hs-row"><strong>Concept Brief sets</strong><span aria-live="polite">{conceptSaveLabel}</span>
      <button type="button" disabled={props.isGeneratingConcepts || saveState === "saving"} onClick={() => void runConceptPersistence(props.onGenerateConcepts, "The AI response was not saved as a canonical five-concept set. No saved result is being claimed.")}>{props.isGeneratingConcepts ? "Generating five…" : "Generate five concepts"}</button>
      <button type="button" disabled={props.isGeneratingConcepts || saveState === "saving"} onClick={() => void runConceptPersistence(props.onRecoverConcepts, "No recoverable five-concept generation was found for this approved script version.", true)}>Recover last generation</button></div>
    {loadError ? <div className="hs-inline-error">{loadError}</div> : null}
    <section className="hs-thumbnail-brand-authority" aria-label="Canonical thumbnail branding">
      <div className="hs-row"><h4>Branding</h4><strong>{brandStatus?.state.replaceAll("_", " ") ?? "Loading authority…"}</strong></div>
      {brandStatus ? <><p>{brandStatus.message}</p>{brandStatus.profile_label ? <p><strong>Brand Profile:</strong> {brandStatus.profile_label}</p> : null}
        {brandStatus.binding ? <small>Binding {String(brandStatus.binding.id ?? "unknown")} · revision {String(brandStatus.binding.revision ?? "unknown")}</small> : null}</> : null}
    </section>
    {latestReadability ? <section className="hs-thumbnail-readability" aria-label="Thumbnail readability evidence">
      <div className="hs-row"><h4>Readability correction</h4><strong>{latestReadability.passed ? "Passed" : "Blocked"}</strong></div>
      <p>Applied {latestReadability.applied_color} with {latestReadability.applied_treatment}. Score {Number(latestReadability.aggregate_score).toFixed(2)}:1 against the 4.5:1 threshold.</p>
      {latestReadability.preferred_brand_color !== latestReadability.applied_color || latestReadability.applied_treatment !== "none"
        ? <p>The preferred brand presentation required a deterministic recipe-level correction. The Brand Profile was not changed.</p> : <p>The preferred brand presentation passed without correction.</p>}
      <small>Evidence {latestReadability.evaluation_hash} · {latestReadability.evaluator_version}</small>
    </section> : null}
    <section className="hs-thumbnail-candidates" aria-label="Canonical thumbnail candidate set">
      <div className="hs-row"><h4>Candidate comparison</h4><strong>{candidateAuthority?.candidate_set?`Revision ${String(candidateAuthority.candidate_set.revision)}`:"Uncommitted"}</strong></div>
      <p>Tongs owns completeness, distinction, and eligibility. Hearth explains and curates those canonical results; presentation-only changes never satisfy distinction.</p>
      <p aria-live="polite"><strong>{candidateSummary.quenchEligibleCount} of {candidateCards.length}</strong> candidates are eligible in the current Tongs projection.</p>
      <button type="button" disabled={saveState==="saving"||readyLaunchCount<3} onClick={()=>void finishThumbnailSet()}>Retry canonical set finalization</button>
      <small>Retrying the same complete payload uses the same operation identity and cannot duplicate the set.</small>
      {candidateCards.length ? <div className="hs-thumbnail-candidate-grid" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(16rem, 1fr))",gap:"1rem",marginTop:"1rem"}}>
        {candidateCards.map((card)=><article key={card.id} className="hs-thumbnail-candidate-card" aria-label={`Candidate ${card.ordinal}`} style={{border:"1px solid var(--border-color, #555)",borderRadius:"0.5rem",padding:"0.75rem"}}>
          <div className="hs-row"><h5>Candidate {card.ordinal}</h5><strong>{card.eligibility.replaceAll("_"," ")}</strong></div>
          <p><strong>{card.title}</strong></p><p>{card.concept}</p>
          <p><strong>Distinct by:</strong> {card.distinctionReasons.join(", ")}</p>
          <p><strong>Branding:</strong> binding revision {card.bindingRevision}</p>
          <p><strong>Readability:</strong> {card.readability.passed ? "passed" : "canonical evidence"}{card.readability.score === null ? "" : ` at ${card.readability.score.toFixed(2)}:1`} · {card.readability.treatment}</p>
          <small>Artwork {card.artworkHash}<br/>Recipe {String(card.raw.recipe_hash)}<br/>Final {card.compositeHash}<br/>Readability evidence {card.readability.evidenceHash}</small>
          <p><strong>{card.quenchEligible ? "Eligible in the canonical set" : "Not eligible in the canonical set"}</strong></p>
          {card.recipe ? <button type="button" onClick={()=>{setCandidateEditRecipeIdentity({id:card.recipe!.id,revision:card.recipe!.revision});setSelectedRevisionId(card.recipe!.concept_revision_id);setTitleId(card.recipe!.title_id);setTitleRevision(card.recipe!.title_revision);setLoadError(null);}}>Revise this candidate</button> : <p><small>This immutable recipe is readable from Tongs but is not present in the current Hearth package projection.</small></p>}
          {card.eligibility==="requires_reapproval"?<button type="button" onClick={()=>void decideHistoricalCandidate(card.raw,"approved")}>Approve older brand for this binding</button>:card.eligibility==="approved_historical_brand"?<button type="button" onClick={()=>void decideHistoricalCandidate(card.raw,"revoked")}>Revoke older-brand approval</button>:null}
        </article>)}
      </div> : <p>No canonical candidate set yet. Create and render three distinct immutable recipes first.</p>}
      {candidateEditRecipe ? <div className="hs-inline-notice" role="status"><strong>Editing candidate recipe {candidateEditRecipe.id} revision {candidateEditRecipe.revision}.</strong> Saving creates its next immutable revision without changing sibling candidates or the committed set. <button type="button" onClick={()=>setCandidateEditRecipeIdentity(null)}>Return to canonical recipe</button></div> : null}
      {pkg.thumbnail.candidate_sets.length > 1 ? <details><summary>Historical candidate sets ({pkg.thumbnail.candidate_sets.length - 1})</summary>
        <p>These immutable package projections are retained for audit and reconstruction. Their recorded eligibility is historical, not a substitute for current Tongs eligibility.</p>
        {[...pkg.thumbnail.candidate_sets].sort((a,b)=>b.revision-a.revision).filter((set)=>set.candidate_set_id!==candidateAuthority?.candidate_set?.id).map((set)=><article key={set.candidate_set_id}>
          <strong>Revision {set.revision}</strong> · {set.candidates.length} candidates<br/><small>Set {set.candidate_set_id} · hash {set.content_hash} · projected {set.projected_at}</small>
          <ol>{set.candidates.map((candidate)=><li key={candidate.candidate_revision_id}>Candidate {candidate.candidate_ordinal} · {candidate.candidate_revision_id} · final {candidate.composite_content_hash}</li>)}</ol>
        </article>)}
      </details> : null}
    </section>
    {selectedStrategy ? <section className="hs-thumb-strategy" aria-label="Active thumbnail creative strategy">
      <div className="hs-row"><h4>Creative Strategy</h4><small>Revision {selectedStrategy.revision} · approved script v{selectedStrategy.approved_script_version}</small></div>
      <p><strong>Episode promise:</strong> {selectedStrategy.episode_promise}</p>
      <p><strong>Intended viewer:</strong> {selectedStrategy.intended_viewer}</p>
      <p><strong>Curiosity mechanism:</strong> {selectedStrategy.curiosity_mechanism}</p>
      <p><strong>Editorial positioning:</strong> {selectedStrategy.editorial_positioning}</p>
      <p><strong>Expectation integrity:</strong> {selectedStrategy.expectation_integrity.truthful_connection}</p>
      {selectedStrategy.expectation_integrity.prohibited_exaggerations.length ? <p><strong>Do not imply:</strong> {selectedStrategy.expectation_integrity.prohibited_exaggerations.join(", ")}</p> : null}
    </section> : null}
    <div className="hs-row">
      {conceptSetPresentation.mode === "label" && activeSet ? <span><strong>Concept set:</strong> {activeSet.name}</span> : null}
      {conceptSetPresentation.mode === "selector" ? <label>Concept set<select value={activeSet?.id ?? ""} onChange={(event) => setSelectedSetId(event.target.value)} aria-label="Concept set">
        {availableSets.map((set) => <option key={set.id} value={set.id}>{set.name}</option>)}
      </select></label> : null}
      {activeSet ? <><button type="button" onClick={() => void commitSetMutation({ ...pkg, thumbnail: { ...pkg.thumbnail, active_concept_set_id: activeSet.id } }, activeSet.id, "hearth.thumbnail.concept-set.selected.v3")}>Make active</button>
        <button type="button" onClick={() => void renameSet()}>Rename</button>
        <button type="button" onClick={() => void archiveActiveSet()}>Archive</button></> : null}
    </div>
    {archivedSets.length ? <details><summary>Archived concept sets ({archivedSets.length})</summary>{archivedSets.map((set) => (
      <div key={set.id}><span>{set.name}</span><button type="button" onClick={() => void restoreSet(set.id)}>Restore</button></div>
    ))}</details> : null}
    <div className="hs-thumbnail-authoring-pair" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "1rem" }}>
      <section aria-label="Concept selection"><h4>Concept revisions</h4>
        <div className="hs-thumb-concept-grid">{revisions.map((concept, index) => concept ? <button type="button" key={concept.concept_revision_id} className={`hs-thumb-pair-option${concept.concept_revision_id === selectedConcept?.concept_revision_id ? " is-selected" : ""}`} aria-label={`Concept ${index + 1}: ${concept.headline}`} aria-pressed={concept.concept_revision_id === selectedConcept?.concept_revision_id} onClick={() => { setSelectedRevisionId(concept.concept_revision_id); setSaveState("editing"); }}>
          <span className="hs-thumb-pair-option-heading"><strong>Concept {index + 1}: {concept.headline}</strong><span className="hs-thumb-pair-selected-mark" aria-hidden="true">✓ Selected</span></span>
          <span>{pkg.thumbnail.creative_briefs.find((entry) => entry.id === concept.creative_brief_id && entry.revision === concept.creative_brief_revision)?.subject_direction ?? concept.image_concept}</span>
          <small>Brief {index + 1} · concept revision {concept.revision_number}</small>
        </button> : null)}</div>
      </section>
      <section aria-label="Framing title selection"><h4>Framing title revisions</h4>
        {pkg.seo.titles.length ? <div className="hs-thumb-title-grid">{pkg.seo.titles.map((title, index) => (
          <button type="button" key={`${title.id}:${title.revision}`} className={`hs-thumb-pair-option${title.id === selectedTitle?.id && title.revision === selectedTitle.revision ? " is-selected" : ""}`} aria-label={`Title ${index + 1}: ${title.text}`} aria-pressed={title.id === selectedTitle?.id && title.revision === selectedTitle.revision} onClick={() => { setTitleId(title.id); setTitleRevision(title.revision); setTitleText(title.thumbnail_text || title.text); setSaveState("editing"); }}>
            <span className="hs-thumb-pair-option-heading"><strong>Title {index + 1}: {title.text}</strong><span className="hs-thumb-pair-selected-mark" aria-hidden="true">✓ Selected</span></span>
            <small>Canonical title revision {title.revision}</small>
          </button>
        ))}</div> : <div className="hs-thumb-empty"><p>No canonical framing titles exist for approved script v{props.approvedScriptVersion}.</p><button type="button" onClick={props.onOpenFraming}>Open Framing</button></div>}
      </section>
    </div>
    <section className="hs-thumb-pair-summary" aria-live="polite">
      <strong>Selected render pair</strong>
      {validSelectedPair ? <span>{selectedConcept?.headline} + {selectedTitle?.text}</span> : <span>Select one concept and one title.</span>}
      <span className={`hs-thumb-pair-state is-${saveState}`}>{saveState === "editing" ? "Unsaved pairing" : saveState}</span>
    </section>
    <section className="hs-thumb-editorial-memory" aria-label="Thumbnail editorial memory">
      <div className="hs-row"><h4>Editorial Memory</h4><span>{memoryState === "loading" ? "Loading history…" : memoryState === "loaded" ? `${memoryProjection.launchFacts.length} launch facts` : "Unavailable"}</span></div>
      {memoryState === "unavailable" ? <p className="hs-inline-note">Memory is optional and does not block authoring. {memoryError}</p> : null}
      {memoryState === "loaded" ? <>
        <div className="hs-thumb-memory-measurements">{editorialCritique.measurements.map((entry) => <div key={entry.label}><span>{entry.label}</span><strong>{entry.value}</strong></div>)}</div>
        <div className="hs-thumb-memory-columns">
          <div><h5>Heuristic guidance</h5>{editorialCritique.heuristicGuidance.length
            ? <ul>{editorialCritique.heuristicGuidance.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            : <p>No strong repetition signal in the available launch history.</p>}</div>
          <div><h5>Historical observations</h5>{editorialCritique.historicalObservations.length
            ? <ul>{editorialCritique.historicalObservations.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            : <p>No editable workspace interpretations have been recorded yet.</p>}
            <label>Workspace editorial note<textarea value={editorialNote} onChange={(event) => setEditorialNote(event.target.value)} placeholder="Record an observation; saving creates a new immutable revision." /></label>
            <button type="button" disabled={!editorialNote.trim() || interpretationSaving} onClick={() => void saveEditorialInterpretation()}>{interpretationSaving ? "Saving revision…" : "Save interpretation revision"}</button>
          </div>
        </div>
        <small>Measurements describe history; guidance is heuristic. Forge does not predict CTR.</small>
      </> : null}
    </section>
    <section className="hs-thumb-editorial-memory" aria-label="Ledger thumbnail intelligence">
      <div className="hs-row"><h4>Ledger Intelligence</h4><span>{ledgerState === "loading" ? "Loading evidence…" : ledgerState === "loaded" ? ledgerProjection?.freshness.state : "Unavailable"}</span></div>
      {ledgerState === "unavailable" ? <p className="hs-inline-note">Ledger is advisory and does not block authoring. {ledgerError}</p> : null}
      {ledgerProjection ? <>
        <small>Last collection: {ledgerProjection.freshness.last_collected_at ?? "No provider observations yet"}. Historical evidence only; Forge does not predict CTR.</small>
        <div className="hs-thumb-memory-columns">
          <div><h5>Measured platform facts</h5>{ledgerProjection.measured_facts.length ? <ul>{ledgerProjection.measured_facts.map((entry) => <li key={entry.identity}>{entry.summary}</li>)}</ul> : <p>No measured thumbnail facts are available.</p>}</div>
          <div><h5>Creator-specific observations</h5>{ledgerProjection.historical_observations.length ? <ul>{ledgerProjection.historical_observations.map((entry) => <li key={entry.identity}><span>{entry.summary} ({entry.confidence} confidence)</span> <button type="button" disabled={interpretationSaving} onClick={() => void applyLedgerGuidance(entry.identity)}>Apply as new editorial revision</button></li>)}</ul> : <p>Insufficient comparable launch evidence.</p>}</div>
          <div><h5>Heuristic editorial guidance</h5>{ledgerProjection.heuristic_guidance.length ? <ul>{ledgerProjection.heuristic_guidance.map((entry) => <li key={entry.identity}><span>{entry.summary}</span> <button type="button" disabled={interpretationSaving} onClick={() => void applyLedgerGuidance(entry.identity)}>Apply as new editorial revision</button></li>)}</ul> : <p>No Ledger heuristic guidance.</p>}</div>
          <div><h5>Unknowns and limitations</h5>{ledgerProjection.unknowns_and_limitations.length ? <ul>{ledgerProjection.unknowns_and_limitations.map((entry) => <li key={entry.identity}>{entry.summary}</li>)}</ul> : <p>Provider metrics are unavailable or evidence is not yet mature.</p>}</div>
        </div>
      </> : null}
    </section>
    {persistedPairIsSelected && activeRecipe ? <section className="hs-thumb-variations" aria-label="Controlled creative variations">
      <div className="hs-row"><h4>Controlled Creative Expansion</h4><span>Recipe variations: 0 AI credits</span></div>
      <p>Create reproducible alternatives from recipe revision {activeRecipe.revision}. Artwork generation remains a separate, disclosed provider charge.</p>
      <div className="hs-thumb-variation-controls">
        <label>Brand mode<select value={variationBrandMode} onChange={(event) => { const mode = event.target.value as ThumbnailBrandMode;
          setVariationBrandMode(mode); if (mode === "strict_brand") setVariationLocks((current) => ({ ...current, typography: true, brand_template: true })); }}>
          <option value="strict_brand">Strict brand</option><option value="flexible_brand">Flexible brand</option><option value="editorial_experiment">Editorial experiment</option>
        </select></label>
        <label>Variation count<select value={variationCount} onChange={(event) => setVariationCount(Number(event.target.value))}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={5}>5</option></select></label>
      </div>
      <fieldset><legend>Lock properties</legend><div className="hs-thumb-variation-locks">
        {(Object.keys(variationLocks) as Array<keyof ThumbnailVariationLocks>).map((property) => <label key={property}>
          <input type="checkbox" checked={variationLocks[property]} disabled={variationBrandMode === "strict_brand" && (property === "typography" || property === "brand_template")}
            onChange={(event) => setVariationLocks((current) => ({ ...current, [property]: event.target.checked }))} />{property.replaceAll("_", " ")}
        </label>)}
      </div></fieldset>
      <button type="button" disabled={saveState === "saving"} onClick={() => void generateVariationBatch()}>Generate controlled recipe variations</button>
      {activeVariationBatch ? <>
        <div className="hs-row"><strong>Variation batch</strong><span>{activeVariationBatch.brand_mode.replaceAll("_", " ")} · {activeVariationBatch.variations.length} alternatives · {activeVariationBatch.estimated_ai_credits} AI credits</span></div>
        <div className="hs-thumb-variation-options">{activeVariationBatch.variations.map((variation) => <button type="button" key={variation.id}
          className={variation.id === selectedVariation?.id ? "is-selected" : ""} aria-pressed={variation.id === selectedVariation?.id}
          onClick={() => setSelectedVariationId(variation.id)}><strong>{variation.label}</strong><span>{String(variation.change_specification.changed_properties ?? "")}</span></button>)}</div>
        {selectedVariation ? <div className="hs-thumb-variation-comparison">
          <div><h5>Current recipe</h5><div className="hs-thumb-local-preview is-mobile"><span className="hs-thumb-local-preview-art">{selectedBrief?.subject_direction ?? selectedConcept?.image_concept}</span><strong>{activeRecipe.title_text}</strong></div></div>
          <div><h5>{selectedVariation.label}</h5><div className="hs-thumb-local-preview is-mobile"><span className="hs-thumb-local-preview-art">{variationBrief?.subject_direction ?? variationConcept?.image_concept}</span><strong style={{ color: String(selectedVariation.candidate_recipe.treatment.typography.color ?? "#FFFFFF") }}>{selectedVariation.candidate_recipe.title_text}</strong></div></div>
          <div className="hs-thumb-variation-memory"><h5>Memory guidance</h5>{variationCritique.heuristicGuidance.length
            ? <ul>{variationCritique.heuristicGuidance.map((entry) => <li key={entry}>{entry}</li>)}</ul>
            : <p>No strong repetition signal for this variation.</p>}</div>
        </div> : null}
        {selectedVariation ? <button type="button" disabled={saveState === "saving" || pkg.thumbnail.variation_promotions.some((entry) => entry.variation_id === selectedVariation.id)} onClick={() => void promoteVariation()}>
          {pkg.thumbnail.variation_promotions.some((entry) => entry.variation_id === selectedVariation.id) ? "Promoted" : "Promote as new canonical recipe"}</button> : null}
      </> : null}
    </section> : null}
    {validSelectedPair ? <section className="hs-thumb-preview-workspace" aria-label="Deterministic thumbnail previews">
      <div><h4>Working preview</h4><div className={`hs-thumb-local-preview is-${aspect.replace(":", "-")}`}>
        <span className="hs-thumb-local-preview-art">{selectedBrief?.subject_direction ?? selectedConcept?.image_concept}</span>
        <strong style={{ color: textColor, textShadow: `0 2px 6px ${shadowColor}` }}>{titleText}</strong>
      </div></div>
      <div><h4>Mobile preview</h4><div className="hs-thumb-local-preview is-mobile">
        <span className="hs-thumb-local-preview-art" aria-hidden="true">{selectedBrief?.subject_direction ?? selectedConcept?.image_concept}</span>
        <strong style={{ color: textColor, textShadow: `0 1px 3px ${shadowColor}` }}>{titleText}</strong>
      </div><small>Same canonical composition revision at feed size.</small></div>
    </section> : null}
    {validSelectedPair ? <section><h4>Render recipe pairing</h4><p>Concept revision {selectedConcept?.revision_number} + title revision {selectedTitle?.revision}</p><button type="button" onClick={() => void refineSelected()}>Refine concept as new revision</button>
      {selectedBrief ? <details><summary>Creative Brief {selectedBrief.concept_slot}</summary>
        <p><strong>Subject:</strong> {selectedBrief.subject_direction}</p><p><strong>Focal action:</strong> {selectedBrief.focal_action}</p>
        <p><strong>Composition:</strong> {selectedBrief.composition_direction}</p><p><strong>Emotional tone:</strong> {selectedBrief.emotional_tone}</p>
        <p><strong>Visual hierarchy:</strong> {selectedBrief.visual_hierarchy}</p><p><strong>Title compatibility:</strong> {selectedBrief.title_compatibility}</p>
        <p><strong>Integrity:</strong> {selectedBrief.expectation_integrity_rationale}</p>
      </details> : null}
      <p><strong>Exact title text:</strong> {titleText}</p>
      <label>Provider<input value={providerId} onChange={(event) => { setProviderId(event.target.value); setSaveState("editing"); }} /></label>
      <label>Aspect<select value={aspect} onChange={(event) => { setAspect(event.target.value as typeof aspect); setSaveState("editing"); }}><option>16:9</option><option>1:1</option><option>9:16</option></select></label>
      <fieldset><legend>Title treatment</legend>
        <label>Text color<input type="color" value={textColor} onChange={(event) => { setTextColor(event.target.value); setSaveState("editing"); }} /></label>
        <label>Maximum lines<input type="number" min={1} max={5} value={maxLines} onChange={(event) => { setMaxLines(Number(event.target.value)); setSaveState("editing"); }} /></label>
        <label>Placement<select value={verticalPlacement} onChange={(event) => { setVerticalPlacement(event.target.value as typeof verticalPlacement); setSaveState("editing"); }}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label>
        <label>Horizontal safe padding (%)<input type="number" min={0} max={30} value={horizontalPadding} onChange={(event) => { setHorizontalPadding(Number(event.target.value)); setSaveState("editing"); }} /></label>
        <label>Shadow color<input type="color" value={shadowColor} onChange={(event) => { setShadowColor(event.target.value); setSaveState("editing"); }} /></label>
        <label>Shadow opacity<input type="range" min={0} max={1} step={0.05} value={shadowOpacity} onChange={(event) => { setShadowOpacity(Number(event.target.value)); setSaveState("editing"); }} /></label>
        <label>Readability treatment<select value={readabilityTreatment} onChange={(event) => { setReadabilityTreatment(event.target.value as typeof readabilityTreatment); setSaveState("editing"); }}>
          <option value="automatic">Automatic hierarchy</option><option value="none">No corrective treatment</option><option value="outline">Outline</option><option value="shadow">Shadow</option><option value="gradient">Title-region gradient</option><option value="backing">Title backing</option>
        </select></label>
        <label><input type="checkbox" checked={logoVisible} onChange={(event) => { setLogoVisible(event.target.checked); setSaveState("editing"); }} />Show bound logo</label>
        <small>Choosing a treatment creates a new immutable recipe revision. Tongs accepts it only when it independently passes forge.thumbnail-readability.v1.</small>
      </fieldset>
      <button type="button" onClick={() => void saveRecipe(false)}>Save concept/title pairing</button>
      {promptPack ? <div><h4>Derived prompt pack</h4><pre>{promptPack.positive_prompt}</pre><p>Negative: {promptPack.negative_prompt}</p><button type="button" onClick={() => void saveRecipe(true)}>{promptPack.review_state === "reviewed" ? "Reviewed" : "Review and approve prompt"}</button></div> : null}
      {persistedPairIsSelected ? <div className="hs-thumbnail-renderer-choices" aria-label="Choose renderer">
        <button type="button" disabled={promptPack?.review_state !== "reviewed"} onClick={() => void renderBase("forge_ai")}>Generate with Forge AI</button>
        <button type="button" disabled={promptPack?.review_state !== "reviewed"} onClick={() => outsideUploadRef.current?.click()}>Use an outside image tool</button>
        <input ref={outsideUploadRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void renderBase("outside_tool", file); }} />
      </div> : null}
    </section> : <p>Select one concept revision and one canonical framing title to create a render recipe.</p>}
    {persistedPairIsSelected ? <><section><h4>Base artwork history</h4>{pkg.thumbnail.base_versions.map((base) => <div key={base.id}><button type="button" onClick={() => setSelectedBaseId(base.id)}>{base.source_type} · {base.intended_aspect_ratio} · {base.status} · {base.content_hash.slice(0, 12)}</button>{base.status === "ready" ? <button type="button" onClick={() => void setPrimaryBase(base.id)}>{pkg.thumbnail.primary_base_version_id === base.id ? "Primary" : "Make primary"}</button> : null}</div>)}</section>
      <section><h4>Launch snapshots</h4><button type="button" onClick={() => void createLaunchSnapshot()}>Commit immutable launch composite</button>{pkg.thumbnail.launch_variant_revisions.map((launch) => <div key={`${launch.launch_variant_id}:${launch.revision}`}>Revision {launch.revision} · {launch.status} · {launch.snapshot.content_hash.slice(0, 12)}</div>)}</section></> : null}
      </div>
    </details>
  </div>;
}
