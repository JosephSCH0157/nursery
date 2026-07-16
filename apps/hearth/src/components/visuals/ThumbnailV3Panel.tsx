import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  THUMBNAIL_COMPOSITION_ENGINE_VERSION,
  THUMBNAIL_PROMPT_TEMPLATE_VERSION,
  deriveThumbnailPromptPack,
  type EpisodePackageV3,
  type ThumbnailRenderRecipe,
} from "../../lib/episode-package-v3";
import { refineConcept, saveRenderRecipe } from "../../lib/hearth-thumbnail-v3-authority";
import {
  commitEpisodePackageV3Mutation,
  commitOutsideToolBaseArtwork,
  commitThumbnailLaunchComposite,
  generateForgeAiBaseArtwork,
  readCanonicalThumbnailWorkspaceV3,
  type ThumbnailSaveState,
} from "../../lib/hearth-thumbnail-v3-api";

type Props = {
  workspaceId: string;
  workpieceId: string;
  approvedScriptVersion: number;
  onGenerateConcepts: () => Promise<void>;
  onRecoverConcepts: () => Promise<void>;
  isGeneratingConcepts: boolean;
  onCanonicalProgress?: (progress: { conceptRevisionCount: number; baseVersionCount: number }) => void;
};

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
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [titleId, setTitleId] = useState<string>("");
  const [titleText, setTitleText] = useState("");
  const [providerId, setProviderId] = useState("forge");
  const [aspect, setAspect] = useState<"16:9" | "1:1" | "9:16">("16:9");
  const [brandTemplateId, setBrandTemplateId] = useState("");
  const [brandTemplateRevision, setBrandTemplateRevision] = useState(1);
  const [textColor, setTextColor] = useState("#FFFFFF");
  const [maxLines, setMaxLines] = useState(3);
  const [verticalPlacement, setVerticalPlacement] = useState<"top" | "center" | "bottom">("bottom");
  const [horizontalPadding, setHorizontalPadding] = useState(8);
  const [shadowColor, setShadowColor] = useState("#000000");
  const [shadowOpacity, setShadowOpacity] = useState(0.7);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const outsideUploadRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    try {
      const canonical = await readCanonicalThumbnailWorkspaceV3({ workpieceId: props.workpieceId, workspaceId: props.workspaceId });
      setPkg(canonical.episodePackage); setToken(canonical.metadataUpdatedAt); setLoadError(null);
      props.onCanonicalProgress?.({
        conceptRevisionCount: canonical.episodePackage.thumbnail.concept_revisions.length,
        baseVersionCount: canonical.episodePackage.thumbnail.base_versions.length,
      });
      setSelectedSetId((current) => current && canonical.episodePackage.thumbnail.concept_sets.some((set) => set.id === current)
        ? current : canonical.episodePackage.thumbnail.active_concept_set_id);
      setTitleId((current) => current || canonical.episodePackage.seo.titles[0]?.id || "");
      setTitleText((current) => current || canonical.episodePackage.seo.titles[0]?.thumbnail_text || canonical.episodePackage.seo.titles[0]?.text || "");
      return canonical;
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Unable to load thumbnail authority."); }
    return null;
  }, [props.onCanonicalProgress, props.workpieceId, props.workspaceId]);

  useEffect(() => { void reload(); }, [reload]);
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
  const activeSet = pkg?.thumbnail.concept_sets.find((set) => set.id === selectedSetId) ?? null;
  const revisions = useMemo(() => activeSet && pkg
    ? pkg.thumbnail.concept_revisions.filter((entry) => entry.concept_set_id === activeSet.id)
      .sort((left, right) => left.concept_lineage_id.localeCompare(right.concept_lineage_id) || left.revision_number - right.revision_number)
    : [], [activeSet, pkg]);
  const selectedConcept = revisions.find((entry) => entry.concept_revision_id === selectedRevisionId)
    ?? revisions[0] ?? null;
  useEffect(() => { if (selectedConcept) setSelectedRevisionId(selectedConcept.concept_revision_id); }, [selectedConcept?.concept_revision_id]);
  const activeRecipe = pkg && selectedConcept
    ? [...pkg.thumbnail.render_recipes].filter((entry) => entry.concept_revision_id === selectedConcept.concept_revision_id).sort((a, b) => b.revision - a.revision)[0] ?? null
    : null;
  useEffect(() => {
    if (!activeRecipe) return;
    const typography = activeRecipe.treatment.typography as Record<string, unknown>;
    const placement = activeRecipe.treatment.placement as Record<string, unknown>;
    const shadow = activeRecipe.treatment.shadow as Record<string, unknown>;
    setTitleId(activeRecipe.title_id); setTitleText(activeRecipe.title_text); setProviderId(activeRecipe.provider_id);
    setAspect(activeRecipe.intended_aspect_ratio); setBrandTemplateId(activeRecipe.brand_template_id ?? "");
    setBrandTemplateRevision(activeRecipe.brand_template_revision ?? 1);
    setTextColor(typeof typography.color === "string" ? typography.color : "#FFFFFF");
    setMaxLines(typeof typography.max_lines === "number" ? typography.max_lines : 3);
    setVerticalPlacement(placement.vertical === "top" || placement.vertical === "center" ? placement.vertical : "bottom");
    setHorizontalPadding(typeof placement.horizontal_padding_percent === "number" ? placement.horizontal_padding_percent : 8);
    setShadowColor(typeof shadow.color === "string" ? shadow.color : "#000000");
    setShadowOpacity(typeof shadow.opacity === "number" ? shadow.opacity : 0.7);
    setSaveState("saved");
  }, [activeRecipe?.id, activeRecipe?.revision]);
  const promptPack = activeRecipe && selectedConcept ? deriveThumbnailPromptPack({ recipe: activeRecipe, concept: selectedConcept }) : null;
  const conceptSaveLabel = pkg?.thumbnail.concept_sets.length === 0 && saveState === "saved" ? "not saved" : saveState;

  const runConceptPersistence = async (action: () => Promise<void>, failureMessage: string) => {
    const beforeIds = new Set(pkg?.thumbnail.concept_sets.map((set) => set.id) ?? []);
    setLoadError(null); setSaveState("saving");
    try { await action(); }
    catch (error) {
      setSaveState("error");
      setLoadError(error instanceof Error ? error.message : failureMessage);
      return;
    }
    const canonical = await reload();
    const created = canonical?.episodePackage.thumbnail.concept_sets.some((set) => !beforeIds.has(set.id)) ?? false;
    if (!created) { setSaveState("error"); setLoadError(failureMessage); return; }
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
    if (!pkg || !selectedConcept) return;
    const title = pkg.seo.titles.find((entry) => entry.id === titleId);
    if (!title) { setLoadError("Choose an exact framing title before saving the recipe."); return; }
    const now = new Date().toISOString();
    const recipe: ThumbnailRenderRecipe = {
      id: activeRecipe?.id ?? crypto.randomUUID(), revision: (activeRecipe?.revision ?? 0) + 1,
      concept_revision_id: selectedConcept.concept_revision_id, title_id: title.id, title_revision: title.revision,
      provider_id: providerId, intended_aspect_ratio: aspect, brand_template_id: brandTemplateId || null,
      brand_template_revision: brandTemplateId ? brandTemplateRevision : null, title_text: titleText.trim(), treatment: {
        ...(activeRecipe?.treatment ?? emptyTreatment),
        typography: { color: textColor, max_lines: maxLines },
        placement: { vertical: verticalPlacement, horizontal_padding_percent: horizontalPadding },
        shadow: { color: shadowColor, opacity: shadowOpacity },
      },
      prompt_template_version: THUMBNAIL_PROMPT_TEMPLATE_VERSION,
      composition_engine_version: THUMBNAIL_COMPOSITION_ENGINE_VERSION,
      prompt_review_state: reviewed ? "reviewed" : "unreviewed",
      last_reviewed_template_version: reviewed ? THUMBNAIL_PROMPT_TEMPLATE_VERSION : null,
      created_at: activeRecipe?.created_at ?? now, updated_at: now,
    };
    const next = saveRenderRecipe({ episodePackage: pkg, recipe }); setSaveState("saving");
    const result = await commitEpisodePackageV3Mutation({ workpieceId: props.workpieceId, expectedMetadataUpdatedAt: token,
      nextEpisodePackage: next, mutation: { kind: "recipe", entityId: recipe.id, revision: recipe.revision },
      eventName: reviewed ? "hearth.thumbnail.prompt.reviewed.v3" : "hearth.thumbnail.recipe.saved.v3" });
    if (!result.ok) { setSaveState("error"); setLoadError(result.error); return; }
    setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSaveState("saved");
  };

  const renameSet = async () => {
    if (!activeSet || !pkg) return;
    const current = pkg;
    const name = window.prompt("Concept set name", activeSet.name)?.trim();
    if (!name || name === activeSet.name) return;
    await commitSetMutation({ ...current, thumbnail: { ...current.thumbnail, concept_sets: current.thumbnail.concept_sets.map((set) => set.id === activeSet.id ? { ...set, name } : set) } }, activeSet.id, "hearth.thumbnail.concept-set.renamed.v3");
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

  const renderBase = async (source: "forge_ai" | "outside_tool", file?: File) => {
    if (!pkg || !selectedConcept || !activeRecipe || promptPack?.review_state !== "reviewed") {
      setLoadError("Review the prompt pack before choosing a renderer."); return;
    }
    setSaveState("saving"); const id = crypto.randomUUID(); const createdAt = new Date().toISOString();
    const base = { id, created_at: createdAt, concept_revision_id: selectedConcept.concept_revision_id,
      render_recipe_id: activeRecipe.id, render_recipe_revision: activeRecipe.revision,
      intended_aspect_ratio: activeRecipe.intended_aspect_ratio };
    const result = source === "forge_ai"
      ? await generateForgeAiBaseArtwork({ workpieceId: props.workpieceId, workspaceId: props.workspaceId,
          expectedMetadataUpdatedAt: token, episodePackage: pkg, baseVersion: base, operationId: crypto.randomUUID(), confirmSpend: true, alwaysApproveAiSpend: false })
      : await commitOutsideToolBaseArtwork({ workpieceId: props.workpieceId, workspaceId: props.workspaceId,
          expectedMetadataUpdatedAt: token, episodePackage: pkg,
          baseVersion: { ...base, source_type: "outside_tool", provider_id: "outside_tool", provider_request_id: null, mime_type: (file?.type || "image/png") as "image/png" },
          artwork: { sourceType: "outside_tool", bytes: new Uint8Array(await file!.arrayBuffer()), mimeType: (file!.type || "image/png") as "image/png", providerId: "outside_tool", operationId: crypto.randomUUID() } });
    if (!result.ok) { setSaveState("error"); setLoadError(result.error); return; }
    setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSelectedBaseId(id); setSaveState("saved");
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
      encoding: { format: "png", quality: 100 }, createdAt: new Date().toISOString() });
    if (!result.ok) { setSaveState("error"); setLoadError(result.error); return; }
    setPkg(result.episodePackage); setToken(result.metadataUpdatedAt); setSaveState("saved");
  };

  if (loadError && !pkg) return <div className="hs-inline-error">{loadError}<button type="button" onClick={() => void reload()}>Retry</button></div>;
  if (!pkg) return <div>Loading canonical thumbnail workspace…</div>;
  return <div className="hs-thumbnail-v3">
    <div className="hs-row"><strong>Concept Brief sets</strong><span aria-live="polite">{conceptSaveLabel}</span>
      <button type="button" disabled={props.isGeneratingConcepts || saveState === "saving"} onClick={() => void runConceptPersistence(props.onGenerateConcepts, "The AI response was not saved as a canonical five-concept set. No saved result is being claimed.")}>{props.isGeneratingConcepts ? "Generating five…" : "Generate five concepts"}</button>
      <button type="button" disabled={props.isGeneratingConcepts || saveState === "saving"} onClick={() => void runConceptPersistence(props.onRecoverConcepts, "No recoverable five-concept generation was found for this approved script version.")}>Recover last generation</button></div>
    {loadError ? <div className="hs-inline-error">{loadError}</div> : null}
    <div className="hs-row">
      <select value={selectedSetId ?? ""} onChange={(event) => setSelectedSetId(event.target.value)} aria-label="Concept set">
        {pkg.thumbnail.concept_sets.map((set) => <option key={set.id} value={set.id}>{set.name}{set.state === "archived" ? " (archived)" : ""}</option>)}
      </select>
      {activeSet ? <><button type="button" onClick={() => void commitSetMutation({ ...pkg, thumbnail: { ...pkg.thumbnail, active_concept_set_id: activeSet.id } }, activeSet.id, "hearth.thumbnail.concept-set.selected.v3")}>Make active</button>
        <button type="button" onClick={() => void renameSet()}>Rename</button>
        <button type="button" onClick={() => void commitSetMutation({ ...pkg, thumbnail: { ...pkg.thumbnail, concept_sets: pkg.thumbnail.concept_sets.map((set) => set.id === activeSet.id ? { ...set, state: set.state === "active" ? "archived" : "active" } : set) } }, activeSet.id, "hearth.thumbnail.concept-set.state.v3")}>{activeSet.state === "active" ? "Archive" : "Restore"}</button></> : null}
    </div>
    <div className="hs-thumb-concept-grid">{revisions.map((concept) => concept ? <button type="button" key={concept.concept_revision_id} className={concept.concept_revision_id === selectedConcept?.concept_revision_id ? "is-selected" : ""} onClick={() => setSelectedRevisionId(concept.concept_revision_id)}><strong>{concept.headline}</strong><span>{concept.image_concept}</span><small>Revision {concept.revision_number}</small></button> : null)}</div>
    {selectedConcept ? <section><h4>Render recipe</h4><button type="button" onClick={() => void refineSelected()}>Refine as new revision</button>
      <label>Title<select value={titleId} onChange={(event) => { setTitleId(event.target.value); const title = pkg.seo.titles.find((entry) => entry.id === event.target.value); setTitleText(title?.thumbnail_text || title?.text || ""); setSaveState("editing"); }}>{pkg.seo.titles.map((title) => <option key={title.id} value={title.id}>{title.text} (r{title.revision})</option>)}</select></label>
      <label>Overlay text<input value={titleText} onChange={(event) => { setTitleText(event.target.value); setSaveState("editing"); }} /></label>
      <label>Provider<input value={providerId} onChange={(event) => { setProviderId(event.target.value); setSaveState("editing"); }} /></label>
      <label>Aspect<select value={aspect} onChange={(event) => { setAspect(event.target.value as typeof aspect); setSaveState("editing"); }}><option>16:9</option><option>1:1</option><option>9:16</option></select></label>
      <label>Brand template<input value={brandTemplateId} onChange={(event) => { setBrandTemplateId(event.target.value); setSaveState("editing"); }} placeholder="Optional template ID" /></label>
      {brandTemplateId ? <label>Brand template revision<input type="number" min={1} value={brandTemplateRevision} onChange={(event) => { setBrandTemplateRevision(Number(event.target.value)); setSaveState("editing"); }} /></label> : null}
      <fieldset><legend>Title treatment</legend>
        <label>Text color<input type="color" value={textColor} onChange={(event) => { setTextColor(event.target.value); setSaveState("editing"); }} /></label>
        <label>Maximum lines<input type="number" min={1} max={5} value={maxLines} onChange={(event) => { setMaxLines(Number(event.target.value)); setSaveState("editing"); }} /></label>
        <label>Placement<select value={verticalPlacement} onChange={(event) => { setVerticalPlacement(event.target.value as typeof verticalPlacement); setSaveState("editing"); }}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label>
        <label>Horizontal safe padding (%)<input type="number" min={0} max={30} value={horizontalPadding} onChange={(event) => { setHorizontalPadding(Number(event.target.value)); setSaveState("editing"); }} /></label>
        <label>Shadow color<input type="color" value={shadowColor} onChange={(event) => { setShadowColor(event.target.value); setSaveState("editing"); }} /></label>
        <label>Shadow opacity<input type="range" min={0} max={1} step={0.05} value={shadowOpacity} onChange={(event) => { setShadowOpacity(Number(event.target.value)); setSaveState("editing"); }} /></label>
      </fieldset>
      <button type="button" onClick={() => void saveRecipe(false)}>Save recipe</button>
      {promptPack ? <div><h4>Derived prompt pack</h4><pre>{promptPack.positive_prompt}</pre><p>Negative: {promptPack.negative_prompt}</p><button type="button" onClick={() => void saveRecipe(true)}>{promptPack.review_state === "reviewed" ? "Reviewed" : "Review and approve prompt"}</button></div> : null}
      <div className="hs-thumbnail-renderer-choices" aria-label="Choose renderer">
        <button type="button" disabled={promptPack?.review_state !== "reviewed"} onClick={() => void renderBase("forge_ai")}>Generate with Forge AI</button>
        <button type="button" disabled={promptPack?.review_state !== "reviewed"} onClick={() => outsideUploadRef.current?.click()}>Use an outside image tool</button>
        <input ref={outsideUploadRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void renderBase("outside_tool", file); }} />
      </div>
    </section> : <p>Generate or select a concept set to begin.</p>}
    <section><h4>Base artwork history</h4>{pkg.thumbnail.base_versions.map((base) => <div key={base.id}><button type="button" onClick={() => setSelectedBaseId(base.id)}>{base.source_type} · {base.intended_aspect_ratio} · {base.status} · {base.content_hash.slice(0, 12)}</button>{base.status === "ready" ? <button type="button" onClick={() => void setPrimaryBase(base.id)}>{pkg.thumbnail.primary_base_version_id === base.id ? "Primary" : "Make primary"}</button> : null}</div>)}</section>
    <section><h4>Launch snapshots</h4><button type="button" onClick={() => void createLaunchSnapshot()}>Commit immutable launch composite</button>{pkg.thumbnail.launch_variant_revisions.map((launch) => <div key={`${launch.launch_variant_id}:${launch.revision}`}>Revision {launch.revision} · {launch.status} · {launch.snapshot.content_hash.slice(0, 12)}</div>)}</section>
  </div>;
}
