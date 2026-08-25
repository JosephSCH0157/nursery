import { lazy, useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import CollapsibleFocusPanel from "../../components/focus/CollapsibleFocusPanel";
import LazyProductionSurfaceBoundary from "../../components/production/LazyProductionSurfaceBoundary";
import type BrollPlanPanel from "../../components/visuals/BrollPlanPanel";
import type EpisodeMediaMapPanel from "../../components/visuals/EpisodeMediaMapPanel";
import type ImageMapPanel from "../../components/visuals/ImageMapPanel";
import type ReferenceClipPlanPanel from "../../components/visuals/ReferenceClipPlanPanel";
import type ThumbnailPanel from "../../components/visuals/ThumbnailPanel";
import type ThumbnailV3Panel from "../../components/visuals/ThumbnailV3Panel";
import { deriveHearthMediaWorkflow, type HearthMediaStageId, type HearthMediaWorkflowInput } from "../../lib/hearth-media-workflow-view-model";
import { loadHearthProductionSurface } from "./hearth-production-surface-loaders";
import "./VisualsSurface.css";

const LazyBrollPlanPanel = lazy(() => (
  loadHearthProductionSurface("broll") as Promise<{ default: typeof BrollPlanPanel }>
));
const LazyEpisodeMediaMapPanel = lazy(() => (
  loadHearthProductionSurface("visual-plan") as Promise<{ default: typeof EpisodeMediaMapPanel }>
));
const LazyImageMapPanel = lazy(() => (
  loadHearthProductionSurface("episode-images") as Promise<{ default: typeof ImageMapPanel }>
));
const LazyReferenceClipPlanPanel = lazy(() => (
  loadHearthProductionSurface("reference-clips") as Promise<{ default: typeof ReferenceClipPlanPanel }>
));
const LazyThumbnailV3Panel = lazy(() => (
  loadHearthProductionSurface("thumbnails") as Promise<{ default: typeof ThumbnailV3Panel }>
));
const LazyCanonicalThumbnailPreview = lazy(() => (
  loadHearthProductionSurface("thumbnails")
    .then((module) => ({
      default: (module as typeof import("../../components/visuals/ThumbnailV3Panel"))
        .CanonicalThumbnailPreview,
    }))
));

type VisualsSurfaceProps = {
  visible: boolean; hasApprovedScript: boolean; approvedScriptVersion: number | null; workflowKey: string; workflowInput: HearthMediaWorkflowInput;
  activeVisualProviderBanner: string; activeVisualProviderHelperText: string;
  thumbnailPanelProps: ComponentProps<typeof ThumbnailPanel>;
  thumbnailAuthority: { workspaceId: string | null; workpieceId: string | null };
  onGenerateThumbnailConcepts: ComponentProps<typeof ThumbnailV3Panel>["onGenerateConcepts"];
  onRecoverThumbnailConcepts: ComponentProps<typeof ThumbnailV3Panel>["onRecoverConcepts"];
  onOpenThumbnailFraming: ComponentProps<typeof ThumbnailV3Panel>["onOpenFraming"];
  onCanonicalThumbnailProgress: NonNullable<ComponentProps<typeof ThumbnailV3Panel>["onCanonicalProgress"]>;
  onCanonicalThumbnailRefresh: NonNullable<ComponentProps<typeof ThumbnailV3Panel>["onCanonicalRefresh"]>;
  mediaMapPanelProps: ComponentProps<typeof EpisodeMediaMapPanel>; imageMapPanelProps: ComponentProps<typeof ImageMapPanel>;
  brollPlanPanelProps: ComponentProps<typeof BrollPlanPanel>; referenceClipPlanPanelProps: ComponentProps<typeof ReferenceClipPlanPanel>;
};

const panelIds: Record<Exclude<HearthMediaStageId,"review">,string> = { visual_plan:"hearth-media-map-panel", thumbnails:"hearth-thumbnail-panel", images:"hearth-image-map-panel", reference_clips:"hearth-reference-clip-panel", broll:"hearth-broll-plan-panel" };

export default function VisualsSurface(props: VisualsSurfaceProps) {
  const workflow = useMemo(() => deriveHearthMediaWorkflow(props.workflowInput), [props.workflowInput]);
  const [displayedStage, setDisplayedStage] = useState<HearthMediaStageId>(workflow.activeStage);
  const [announcement, setAnnouncement] = useState("");
  const activeRef = useRef(workflow.activeStage); const keyRef = useRef(props.workflowKey); const manualReviewRef = useRef(false);
  const initialResolutionRef = useRef(true);

  const moveToStage = useCallback((stage:HearthMediaStageId, announce:boolean, announcementText?:string) => {
    setDisplayedStage(stage);
    if (announce) setAnnouncement(announcementText ?? `${workflow.stages.find((entry)=>entry.id===stage)?.label ?? "Next stage"} is ready.`);
    const focusStage = () => {
      const target=document.querySelector<HTMLElement>(`[data-media-stage-heading="${stage}"]`); if(!target)return;
      target.focus({preventScroll:true});
      const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({behavior:reduced?"auto":"smooth",block:"start"});
    };
    window.requestAnimationFrame(focusStage);
    window.setTimeout(focusStage, 120);
    window.setTimeout(focusStage, 400);
    window.setTimeout(focusStage, 800);
  }, [workflow.stages]);

  useEffect(() => {
    if (!props.visible) return;
    if(initialResolutionRef.current){initialResolutionRef.current=false;moveToStage(workflow.activeStage,false);return;}
    const changedWorkpiece=keyRef.current!==props.workflowKey;
    const previousActiveStage=activeRef.current; const advanced=previousActiveStage!==workflow.activeStage;
    keyRef.current=props.workflowKey; activeRef.current=workflow.activeStage;
    if(changedWorkpiece){manualReviewRef.current=false;moveToStage(workflow.activeStage,false);return;}
    if(advanced&&!manualReviewRef.current)moveToStage(workflow.activeStage,true,previousActiveStage==="thumbnails"&&workflow.activeStage==="images"?"Thumbnail set complete. Images is ready.":previousActiveStage==="images"&&workflow.activeStage==="reference_clips"?"Episode images complete. Reference Material is ready.":previousActiveStage==="reference_clips"&&workflow.activeStage==="broll"?"Reference Material complete. B-roll is ready.":undefined);
  }, [moveToStage, props.visible, props.workflowKey, workflow.activeStage]);

  if (!props.visible) return null;
  if (!props.hasApprovedScript || !props.approvedScriptVersion) return <section className="hs-visuals-skeleton" aria-live="polite"><strong>Visual workflow is loading.</strong><span>Approve a script version to unlock Visual Plan, Thumbnails, Images, Reference Material, and B-roll.</span></section>;

  const chooseStage=(id:HearthMediaStageId)=>{const stage=workflow.stages.find((entry)=>entry.id===id);if(!stage||stage.status==="unavailable"||(id==="review"&&stage.status==="blocked"))return;manualReviewRef.current=true;setDisplayedStage(id);};
  const preserveInteractedStage=()=>{manualReviewRef.current=true;};
  const current=workflow.stages.find((stage)=>stage.id===displayedStage)??workflow.stages[0];
  const renderWorkspace=()=>{
    if(displayedStage==="visual_plan")return <CollapsibleFocusPanel panelId={panelIds.visual_plan} title="Episode Visual Plan" meta={current.summary} collapsed={false} onToggle={()=>undefined} collapsible={false} priority="primary"><LazyProductionSurfaceBoundary surfaceKey="visual-plan"><LazyEpisodeMediaMapPanel {...props.mediaMapPanelProps}/></LazyProductionSurfaceBoundary></CollapsibleFocusPanel>;
    if(displayedStage==="thumbnails")return <CollapsibleFocusPanel panelId={panelIds.thumbnails} title="Thumbnails" meta={current.summary} collapsed={false} onToggle={()=>undefined} collapsible={false} priority="primary">{props.thumbnailAuthority.workspaceId&&props.thumbnailAuthority.workpieceId?<LazyProductionSurfaceBoundary surfaceKey="thumbnails"><LazyThumbnailV3Panel workspaceId={props.thumbnailAuthority.workspaceId} workpieceId={props.thumbnailAuthority.workpieceId} approvedScriptVersion={props.approvedScriptVersion!} onGenerateConcepts={props.onGenerateThumbnailConcepts} onRecoverConcepts={props.onRecoverThumbnailConcepts} onOpenFraming={props.onOpenThumbnailFraming} isGeneratingConcepts={props.thumbnailPanelProps.isGeneratingConcepts??false} onCanonicalProgress={props.onCanonicalThumbnailProgress} onCanonicalRefresh={props.onCanonicalThumbnailRefresh}/></LazyProductionSurfaceBoundary>:<p>Select an episode before opening its canonical thumbnail workspace.</p>}</CollapsibleFocusPanel>;
    if(displayedStage==="images")return <CollapsibleFocusPanel panelId={panelIds.images} title="Episode Images" meta={current.summary} collapsed={false} onToggle={()=>undefined} collapsible={false} priority="primary"><LazyProductionSurfaceBoundary surfaceKey="episode-images"><LazyImageMapPanel {...props.imageMapPanelProps} canonicalWorkspaceId={props.thumbnailAuthority.workspaceId} canonicalWorkpieceId={props.thumbnailAuthority.workpieceId}/></LazyProductionSurfaceBoundary></CollapsibleFocusPanel>;
    if(displayedStage==="reference_clips")return <CollapsibleFocusPanel panelId={panelIds.reference_clips} title="Reference Material" meta={current.summary} collapsed={false} onToggle={()=>undefined} collapsible={false} priority="primary"><LazyProductionSurfaceBoundary surfaceKey="reference-clips"><LazyReferenceClipPlanPanel {...props.referenceClipPlanPanelProps} canonicalWorkspaceId={props.thumbnailAuthority.workspaceId} canonicalWorkpieceId={props.thumbnailAuthority.workpieceId}/></LazyProductionSurfaceBoundary></CollapsibleFocusPanel>;
    if(displayedStage==="broll")return <CollapsibleFocusPanel panelId={panelIds.broll} title="Create B-roll" meta={current.summary} collapsed={false} onToggle={()=>undefined} collapsible={false} priority="primary"><LazyProductionSurfaceBoundary surfaceKey="broll"><LazyBrollPlanPanel {...props.brollPlanPanelProps}/></LazyProductionSurfaceBoundary></CollapsibleFocusPanel>;
    return <section className="hs-media-review" aria-labelledby="hearth-media-review-heading"><h3 id="hearth-media-review-heading">Review episode visuals</h3><p>This review does not publish, render, or edit the episode.</p><dl>{workflow.stages.slice(0,-1).map((stage)=><div key={stage.id}><dt>{stage.label}</dt><dd>{stage.summary}</dd></div>)}</dl><p><strong>Hammer authority remains unchanged.</strong> Final placement, timing, trimming, and final-media truth are resolved in Hammer.</p></section>;
  };
  return <section className="hs-media-workflow" aria-label="Episode visual production workflow">
    <div className="hs-sr-only" aria-live="polite">{announcement}</div>
    <nav className="hs-media-stage-rail" aria-label="Visual production stages">{workflow.stages.map((stage,index)=><button key={stage.id} type="button" disabled={stage.status==="unavailable"||(stage.id==="review"&&stage.status==="blocked")} className={`is-${stage.status}${displayedStage===stage.id?" is-active":""}`} aria-current={displayedStage===stage.id?"step":undefined} onClick={()=>chooseStage(stage.id)}><span aria-hidden="true">{stage.status==="complete"?"✓":displayedStage===stage.id?"●":"○"}</span><span><strong>{index+1}. {stage.label}</strong><small>{stage.status.replaceAll("_"," ")}</small></span></button>)}</nav>
    <div className={`hs-media-completed-summaries${displayedStage==="broll"?" is-compact":""}`} aria-label="Completed visual stages">
      {workflow.stages.filter((stage)=>stage.status==="complete"&&stage.id!==displayedStage).map((stage)=><section className="hs-media-completed-summary" key={stage.id}><div><strong>✓ {stage.label}</strong><span>{stage.id==="thumbnails"?"Thumbnail set complete · Saved with this episode and available for release preparation.":stage.summary}</span>{displayedStage!=="broll"&&stage.id==="thumbnails"&&props.thumbnailAuthority.workpieceId&&props.workflowInput.thumbnails.previewAssetPaths?.length?<div className="hs-media-thumbnail-summary">{props.workflowInput.thumbnails.previewAssetPaths.slice(0,3).map((path,index)=><LazyProductionSurfaceBoundary key={path} surfaceKey={`thumbnail-preview:${path}`}><LazyCanonicalThumbnailPreview workpieceId={props.thumbnailAuthority.workpieceId!} assetPath={path} alt={`Thumbnail candidate ${String.fromCharCode(65+index)}`} className="hs-media-thumbnail-summary-preview" /></LazyProductionSurfaceBoundary>)}</div>:null}</div><button type="button" onClick={()=>chooseStage(stage.id)}>Review {stage.label.toLowerCase()}</button></section>)}
    </div>
    {props.workflowInput.upstreamChanged?<aside className="hs-media-upstream-warning"><strong>The visual plan changed.</strong><span>Your existing thumbnails, images, Reference Material, and B-roll are preserved. Review whether the updated plan needs additional assets.</span><button type="button" onClick={()=>chooseStage("visual_plan")}>Review changes</button></aside>:null}
    <div className="hs-media-active-stage" onPointerDownCapture={preserveInteractedStage} onKeyDownCapture={preserveInteractedStage}><h2 key={displayedStage} autoFocus={displayedStage===workflow.activeStage} tabIndex={-1} data-media-stage-heading={displayedStage}>{current.label}</h2><p>{current.summary}</p>{renderWorkspace()}</div>
    <details className="hs-media-planning-details"><summary>Planning details</summary><p>{props.activeVisualProviderBanner}</p><p>{props.activeVisualProviderHelperText}</p><p>Canonical state: {props.workflowInput.visualPlan.status??"not created"} · revision {props.workflowInput.visualPlan.version}</p></details>
  </section>;
}
