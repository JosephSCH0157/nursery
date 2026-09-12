import { useCallback, useEffect, useMemo, useState } from "react";
import type { EpisodeWorkspaceReadModel } from "@forge/shared/episode-workspace";
import { useLocation, useOutletContext } from "react-router-dom";
import {
  type AdapterPublishResult,
  type AdapterValidationResult,
  type PlatformCapabilities,
  type PlatformPublishOptions,
  type PublishContext,
  type QuenchMockReleaseCase,
  type QuenchPlatform,
  type QuenchReleaseReadinessVerdict,
  type ReleaseMode,
  type ReleaseReadinessCheckKey,
  type ResolvedAsset,
  type ResolvedReleaseAssets,
  deriveReleasePacketReadinessVerdict,
  canExecuteQuenchPublish,
  TransistorAdapter,
  StaticAssetResolver,
  YouTubeAdapter,
  listQuenchMockReleaseCases,
  resolveReleaseAssets,
  type QuenchCanonicalReleaseProjection,
  isQuenchOpenAuthority,
  type QuenchOpenAuthority,
  isQuenchCandidateSelectable,
  getQuenchExperimentCapability,
  buildRumbleManualHandoffSnapshot,
  validateRumbleManualHandoff,
  RUMBLE_UPLOAD_URL,
} from "@forge/quench";
import type { HammerPreparedReleasePackage } from "../../../hammer/src/lib/hammerPreparedReleasePackage";
import { tongsFetch } from "../../../hammer/src/lib/tongsFetch";
import { requestQuenchMetadataAssist } from "./quenchMetadataAssistApi";
import { parseForgeRouteContext } from "../lib/forge-route-context";
import { useWorkspaceBootstrap } from "../hooks/useWorkspaceBootstrap";
import EpisodeContinuityStrip from "../shell/EpisodeContinuityStrip";
import {
  useEpisodeWorkspaceLoading,
  useEpisodeWorkspaceReadModel,
} from "../workspace/useEpisodeWorkspaceReadModel";
import type { AppShellContext } from "./AppShell";
import "./Quench.css";

// The inventory supplies the concrete show id for live execution. This
// unbound instance drives capability and packet validation only.
const QUENCH_ADAPTERS = [new YouTubeAdapter(), new TransistorAdapter()];
type PublicationDestination = { executable_destination_id:string;external_destination_id:string;display_label:string;provider:string;destination_kind:string;capability_revision_id:string;capability_revision:number;capability_content_hash:string };

const PLATFORM_LABELS: Record<QuenchPlatform, string> = {
  youtube: "YouTube",
  rumble: "Rumble",
  podcast_host: "Podcast host",
};

const READINESS_LABELS: Record<ReleaseReadinessCheckKey, string> = {
  workspace_id: "Workspace",
  workpiece_id: "Workpiece",
  episode_id: "Episode",
  title: "Title",
  description: "Description",
  thumbnail: "Thumbnail",
  video_export: "Video export",
  audio_export: "Audio export",
  podcast_host_connection: "Linked podcast show",
};

const MODE_LABELS: Record<ReleaseMode, string> = {
  publish: "Publish now",
  schedule: "Schedule",
  premiere: "Premiere",
};

const QUENCH_OPEN_PREPARED_RELEASE = "prepared_release";

type QuenchPreparedReleaseHandoff = {
  mode: "prepared_release";
  workspaceId: string | null;
  workpieceId: string | null;
  packagePath: string | null;
  expectedVersion: number | null;
  expectedFingerprint: string | null;
  expectedPreparedAt: string | null;
  expectedState: string | null;
};

type QuenchPreparedReleaseState = {
  status: "idle" | "loading" | "ready" | "error";
  handoff: QuenchPreparedReleaseHandoff | null;
  message: string | null;
  warning: string | null;
  loadedFingerprint: string | null;
  loadedPreparedAt: string | null;
};

type QuenchReleaseConsoleCase = QuenchMockReleaseCase & { authority: "canonical"|"fixture"; canonical_projection?: QuenchCanonicalReleaseProjection };

function getQuenchOpenOperationId(workspaceId:string,workpieceId:string):string{
  const key=`forge.quench.open-authority.v1:${workspaceId}:${workpieceId}`;
  try{const existing=window.sessionStorage.getItem(key);if(existing)return existing;const created=crypto.randomUUID();window.sessionStorage.setItem(key,created);return created;}catch{return crypto.randomUUID();}
}

function resetQuenchOpenOperationId(workspaceId:string,workpieceId:string):void{
  try{window.sessionStorage.removeItem(`forge.quench.open-authority.v1:${workspaceId}:${workpieceId}`);}catch{/* recovery hint only */}
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseOptionalNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function stableHashToken(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function buildPreparedPackageIdentityFingerprint(pkg: HammerPreparedReleasePackage): string {
  const basis = [
    `v:${String(pkg.version)}`,
    `ws:${pkg.workspaceId ?? ""}`,
    `wp:${pkg.workpieceId}`,
    `at:${pkg.preparedAt}`,
    `ts:${pkg.transcript.fingerprint ?? ""}`,
    `srt:${pkg.subtitles.srt.fingerprint ?? ""}`,
    `vtt:${pkg.subtitles.vtt.fingerprint ?? ""}`,
    `m:${pkg.media.fingerprint ?? ""}`,
    `tl:${pkg.provenance.timelineRevision ?? ""}`,
  ].join("|");
  return `hppkg:${stableHashToken(basis)}`;
}

function parsePreparedReleaseHandoff(search: string): QuenchPreparedReleaseHandoff | null {
  const params = new URLSearchParams(search);
  const mode = readString(params.get("quench_open"));
  if (mode !== QUENCH_OPEN_PREPARED_RELEASE) return null;
  const routeContext = parseForgeRouteContext(search);
  return {
    mode: "prepared_release",
    workspaceId: routeContext.workspaceId,
    workpieceId: routeContext.workpieceId,
    packagePath: readString(params.get("prepared_package_path")),
    expectedVersion: parseOptionalNumber(readString(params.get("prepared_package_version"))),
    expectedFingerprint: readString(params.get("prepared_package_fingerprint")),
    expectedPreparedAt: readString(params.get("prepared_package_prepared_at")),
    expectedState: readString(params.get("prepared_package_state")),
  };
}

function normalizePreparedReleasePackage(value: unknown): HammerPreparedReleasePackage | null {
  const row = readJsonObject(value);
  if (!row) return null;
  const version = row.version;
  if (version !== 1) return null;
  if (!readString(row.workpieceId)) return null;
  if (!readString(row.preparedAt)) return null;
  return row as unknown as HammerPreparedReleasePackage;
}

function buildCanonicalReleaseCase(projection:QuenchCanonicalReleaseProjection):QuenchReleaseConsoleCase{
  const manifest=projection.hammer.manifest;const episode=projection.metadata.episode;const seo=readJsonObject(episode.seo);const titles=Array.isArray(seo?.titles)?seo.titles.map(readJsonObject).filter(Boolean):[];const primary=titles.find((entry)=>entry?.is_primary===true)??titles[0];
  const title=readString(primary?.text)??readString(manifest.episode_title)??`Release ${projection.workpiece_id.slice(0,8)}`;const description=readString(seo?.description_long)??readString(seo?.description_short)??"Canonical release metadata is incomplete.";const tags=Array.isArray(seo?.tags)?seo.tags.map(readString).filter((value):value is string=>Boolean(value)):[];
  const audio=readJsonObject(manifest.audio);const video=readJsonObject(manifest.video);const audioId=readString(audio?.media_id);const videoId=readString(video?.canonical_asset_id)??readString(video?.media_id);const videoPath=readString(video?.workpiece_path)??readString(video?.local_relpath);return{authority:"canonical",canonical_projection:projection,case_id:`canonical:${projection.workpiece_id}:${projection.hammer.manifest_snapshot_id}`,label:"Canonical Hammer Release",summary:`Tongs-verified manifest ${projection.hammer.manifest_content_hash.slice(0,12)}…`,packet:{release_packet_id:projection.hammer.manifest_snapshot_id,workspace_id:projection.workspace_id,workpiece_id:projection.workpiece_id,episode_id:projection.workpiece_id,title,description,tags,thumbnail_asset_id:null,video_export_id:videoId,audio_export_id:audioId,shorts:[],asset_source:"cloud",rss_ready:projection.hammer.readiness.ready_for_quench===true,platform_overrides:{},seo_metadata:null},resolved_assets:{video:videoId?{asset_id:videoId,kind:"video",source:"cloud",uri:videoPath??"",mime_type:readString(video?.mime_type)??undefined,duration_sec:typeof manifest.duration_seconds==="number"?manifest.duration_seconds:undefined,accessible:Boolean(videoPath)}:null,audio:audioId?{asset_id:audioId,kind:"audio",source:"cloud",uri:readString(audio?.workpiece_path)??readString(audio?.local_relpath)??`workpiece-media://${projection.workpiece_id}/${audioId}`,mime_type:readString(audio?.mime_type)??undefined,duration_sec:typeof manifest.duration_seconds==="number"?manifest.duration_seconds:undefined,accessible:true}:null,shorts:[]},default_platforms:[],default_publish_options:{}};
}

async function readResponseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  const raw = readString(text);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function getDefaultPublishOptions(platform: QuenchPlatform): PlatformPublishOptions {
  if (platform === "podcast_host") {
    return {
      enabled: true,
      mode: "publish",
    };
  }

  return {
    enabled: true,
    mode: "publish",
    visibility: "private",
  };
}

function clonePublishOptions(
  options: Partial<Record<QuenchPlatform, PlatformPublishOptions>>,
): Partial<Record<QuenchPlatform, PlatformPublishOptions>> {
  const next: Partial<Record<QuenchPlatform, PlatformPublishOptions>> = {};
  for (const [platform, option] of Object.entries(options) as [QuenchPlatform, PlatformPublishOptions][]) {
    next[platform] = { ...option };
  }
  return next;
}

function formatDate(value: string | undefined): string {
  if (!value) return "none";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDuration(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "n/a";
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function buildPublishContext(
  runMode: "stub" | "live",
  resolvedAssets: Partial<ResolvedReleaseAssets>,
  readiness: Pick<QuenchReleaseReadinessVerdict, "status" | "ready">,
): PublishContext {
  return {
    run_mode: runMode,
    now_iso: new Date().toISOString(),
    resolved_assets: resolvedAssets,
    request_id: `quench_console_${runMode}`,
    readiness,
  };
}

function getAssetStatusLabel(accessible: boolean | undefined): string {
  if (accessible === true) return "accessible";
  if (accessible === false) return "blocked";
  return "unknown";
}

type ResolvedAssetCard = {
  kind: "video" | "audio" | "thumbnail";
  asset: ResolvedAsset | null | undefined;
};

function getVerdictTone(status: QuenchReleaseReadinessVerdict["status"] | "invalid"): "is-good" | "is-warn" | "is-bad" {
  switch (status) {
    case "ready":
      return "is-good";
    case "needs_review":
      return "is-warn";
    case "blocked":
    case "invalid":
      return "is-bad";
  }
}

function getVerdictLabel(status: QuenchReleaseReadinessVerdict["status"]): string {
  switch (status) {
    case "ready":
      return "ready";
    case "needs_review":
      return "needs review";
    case "blocked":
      return "blocked";
  }
}

function getVerdictSummary(verdict: QuenchReleaseReadinessVerdict): string {
  switch (verdict.status) {
    case "ready":
      return "ready for handoff";
    case "needs_review":
      return "needs review before publish";
    case "blocked":
      return "blocked for publish";
  }
}

function QuenchCandidatePreview({workpieceId,path,mimeType,ordinal}:{workpieceId:string;path?:string;mimeType?:string;ordinal:number}){
  const [preview,setPreview]=useState<{path:string;src:string}|null>(null);useEffect(()=>{let cancelled=false;if(!path)return;void(async()=>{try{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(path)}&encoding=base64`,{method:"GET"});const payload=await response.json() as {data?:{bytes_base64?:string;content_type?:string}};if(!cancelled&&response.ok&&payload.data?.bytes_base64)setPreview({path,src:`data:${payload.data.content_type??mimeType??"image/png"};base64,${payload.data.bytes_base64}`});}catch{if(!cancelled)setPreview(null);}})();return()=>{cancelled=true;};},[mimeType,path,workpieceId]);
  const src=path&&preview?.path===path?preview.src:null;return src?<img src={src} alt={`Canonical thumbnail candidate ${ordinal}`} style={{width:"100%",aspectRatio:"16 / 9",objectFit:"cover",borderRadius:"0.4rem"}}/>:<div className="quench-console__empty-note">Verified preview unavailable.</div>;
}

function QuenchMediaPreview({workpieceId,asset,label}:{workpieceId:string;asset:ResolvedAsset|null|undefined;label:string}){
  const previewKey=asset?.uri&&asset.accessible?`${workpieceId}\n${asset.uri}\n${asset.mime_type??""}`:null;
  const [preview,setPreview]=useState<{key:string;src:string}|null>(null);useEffect(()=>{let cancelled=false;if(!previewKey||!asset?.uri)return;void(async()=>{try{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(asset.uri)}&encoding=base64`,{method:"GET",timeoutMs:45_000});const payload=await response.json() as{data?:{bytes_base64?:string;content_type?:string}};if(!cancelled&&response.ok&&payload.data?.bytes_base64)setPreview({key:previewKey,src:`data:${payload.data.content_type??asset.mime_type??"application/octet-stream"};base64,${payload.data.bytes_base64}`});}catch{if(!cancelled)setPreview(null);}})();return()=>{cancelled=true};},[asset?.mime_type,asset?.uri,previewKey,workpieceId]);
  const src=previewKey&&preview?.key===previewKey?preview.src:null;
  if(!src)return <div className="quench-flow__media-empty">{label} preview is unavailable. The canonical asset remains selected.</div>;
  return asset?.kind==="audio"?<audio controls preload="metadata" src={src} aria-label={label}/>:<video controls preload="metadata" poster={undefined} src={src} aria-label={label}/>;
}

async function downloadWorkpieceFile(workpieceId:string,path:string,filename:string):Promise<void>{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(path)}&encoding=base64`,{method:"GET",timeoutMs:45_000});const payload=await response.json() as{data?:{bytes_base64?:string;content_type?:string}};if(!response.ok||!payload.data?.bytes_base64)throw new Error("Canonical file download is unavailable.");const binary=atob(payload.data.bytes_base64);const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index+=1)bytes[index]=binary.charCodeAt(index);const url=URL.createObjectURL(new Blob([bytes],{type:payload.data.content_type??"application/octet-stream"}));const link=document.createElement("a");link.href=url;link.download=filename;link.click();URL.revokeObjectURL(url);}

export default function QuenchRoute() {
  const shell = useOutletContext<AppShellContext>();
  const location = useLocation();
  const routeCtx = useMemo(() => parseForgeRouteContext(location.search), [location.search]);
  useWorkspaceBootstrap({ episodeId: routeCtx.workpieceId ?? undefined });
  const mockReleaseCases = useMemo<QuenchMockReleaseCase[]>(
    () => listQuenchMockReleaseCases({ workspaceId: shell.workspaceId }),
    [shell.workspaceId],
  );
  const [handoffPreparedCase, setHandoffPreparedCase] = useState<QuenchReleaseConsoleCase | null>(null);
  const [preparedHandoffState, setPreparedHandoffState] = useState<QuenchPreparedReleaseState>({
    status: "idle",
    handoff: null,
    message: null,
    warning: null,
    loadedFingerprint: null,
    loadedPreparedAt: null,
  });
  const releaseCases = useMemo<QuenchReleaseConsoleCase[]>(() => {
    if (!handoffPreparedCase) return import.meta.env.DEV ? mockReleaseCases.map((entry)=>({...entry,authority:"fixture" as const})) : [];
    return [handoffPreparedCase];
  }, [handoffPreparedCase, mockReleaseCases]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>(() =>
    listQuenchMockReleaseCases({ workspaceId: shell.workspaceId })[0]?.case_id ?? "",
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<QuenchPlatform[]>(
    releaseCases[0]?.default_platforms ?? [],
  );
  const [publishOptions, setPublishOptions] = useState<Partial<Record<QuenchPlatform, PlatformPublishOptions>>>(
    releaseCases[0] ? clonePublishOptions(releaseCases[0].default_publish_options) : {},
  );
  const [runMode, setRunMode] = useState<"stub" | "live">("stub");
  const [resolvedAssets, setResolvedAssets] = useState<Partial<ResolvedReleaseAssets>>({});
  const [capabilities, setCapabilities] = useState<Partial<Record<QuenchPlatform, PlatformCapabilities>>>({});
  const [validations, setValidations] = useState<Partial<Record<QuenchPlatform, AdapterValidationResult>>>({});
  const [publishResults, setPublishResults] = useState<Partial<Record<QuenchPlatform, AdapterPublishResult>>>({});
  const [boardUpdatedAt, setBoardUpdatedAt] = useState<string | null>(null);
  const [publicationDestinations,setPublicationDestinations]=useState<PublicationDestination[]>([]);
  const [selectedPublicationDestinationId,setSelectedPublicationDestinationId]=useState<string>("");
  const [publicationCommandState,setPublicationCommandState]=useState<"idle"|"establishing"|"reserved"|"recorded"|"error">("idle");
  const [publicationCommandMessage,setPublicationCommandMessage]=useState<string|null>(null);
  const [publicationOperationId,setPublicationOperationId]=useState<string|null>(null);
  const [publicationOperationKey,setPublicationOperationKey]=useState<string|null>(null);
  const [metadataAssistState, setMetadataAssistState] = useState<"idle" | "running" | "ready" | "error">("idle");
  const [metadataAssistError, setMetadataAssistError] = useState<string | null>(null);
  const [metadataAssistDraft, setMetadataAssistDraft] = useState<{
    title: string;
    description: string;
    tags: string[];
  } | null>(null);
  const [experimentControlId,setExperimentControlId]=useState<string|null>(null);
  const [experimentVariantIds,setExperimentVariantIds]=useState<string[]>([]);
  const [experimentState, setExperimentState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [experimentMessage, setExperimentMessage] = useState<string | null>(null);
  const [thumbnailSelectionState,setThumbnailSelectionState]=useState<"idle"|"saving"|"saved"|"conflict"|"error">("idle");
  const [thumbnailSelectionMessage,setThumbnailSelectionMessage]=useState<string|null>(null);
  const [openAuthority,setOpenAuthority]=useState<QuenchOpenAuthority|null>(null);
  const [openRevision,setOpenRevision]=useState(0);
  const [rumbleCategory,setRumbleCategory]=useState("");
  const [rumbleResultUrl,setRumbleResultUrl]=useState("");
  const [manualHandoffId,setManualHandoffId]=useState<string|null>(null);
  const [manualReceiptId,setManualReceiptId]=useState<string|null>(null);
  const [manualHandoffMessage,setManualHandoffMessage]=useState<string|null>(null);
  const [flowStep,setFlowStep]=useState<1|2|3|4>(1);
  const [selectedTitleIndex,setSelectedTitleIndex]=useState(0);
  const [descriptionKind,setDescriptionKind]=useState<"short"|"long">("long");
  const [includeCaptions,setIncludeCaptions]=useState(true);
  const [includeSources,setIncludeSources]=useState(false);
  const [youtubeCategory,setYoutubeCategory]=useState("22");
  const [notifySubscribers,setNotifySubscribers]=useState(true);
  const [publicationProgress,setPublicationProgress]=useState<Record<string,unknown>|null>(null);

  useEffect(() => {
    let cancelled = false;
    const handoff = parsePreparedReleaseHandoff(location.search);
    const workspaceId=routeCtx.workspaceId;const workpieceId=routeCtx.workpieceId;
    queueMicrotask(()=>setPreparedHandoffState({status:"loading",handoff,message:null,warning:null,loadedFingerprint:null,loadedPreparedAt:null}));
    async function loadReviewAuthority():Promise<void>{
      try {
        if(!workspaceId||!workpieceId)throw new Error("Source Conflict: Quench requires explicit route workspace and workpiece identity.");
        let loadedFingerprint:string|null=null;let loadedPreparedAt:string|null=null;
        if(handoff){
          if(!handoff.workspaceId||!handoff.workpieceId||!handoff.packagePath)throw new Error("Source Conflict: this prepared release handoff is incomplete.");
          if(handoff.workspaceId!==workspaceId||handoff.workpieceId!==workpieceId)throw new Error("Source Conflict: route and Hammer handoff identities disagree.");
          const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(handoff.packagePath)}`,{method:"GET",timeoutMs:45_000});const payload=await readResponseJson(response);const root=readJsonObject(payload);
          if(!response.ok||root?.exists!==true)throw new Error("Manifest Missing: the prepared release package cannot be retrieved.");
          const pkg=normalizePreparedReleasePackage(root.data);if(!pkg)throw new Error("Source Conflict: the prepared release package is incompatible.");
          if(pkg.workspaceId!==workspaceId||pkg.workpieceId!==workpieceId)throw new Error("Source Conflict: route, handoff, and package identities disagree.");
          if(handoff.expectedVersion!=null&&pkg.version!==handoff.expectedVersion)throw new Error("Source Conflict: the prepared release package version changed.");
          loadedFingerprint=buildPreparedPackageIdentityFingerprint(pkg);loadedPreparedAt=pkg.preparedAt;
          if(handoff.expectedFingerprint&&handoff.expectedFingerprint!==loadedFingerprint)throw new Error("Source Conflict: the prepared release package changed after Hammer created this handoff.");
        }
        const openOperationId=getQuenchOpenOperationId(workspaceId,workpieceId);
        const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/quench/open-authority`,{method:"POST",json:{workspace_id:workspaceId,open_operation_id:openOperationId},timeoutMs:45_000});const payload=await readResponseJson(response);const root=readJsonObject(payload);const authority=root?.ok===true?root.data:null;
        if(!response.ok||!isQuenchOpenAuthority(authority))throw new Error(readString(readJsonObject(root?.error)?.message)??"Quench could not establish immutable open authority.");
        if(authority.workspace_id!==workspaceId||authority.workpiece_id!==workpieceId||authority.review_projection.hammer.manifest_snapshot_id!==authority.manifest_snapshot_id||authority.review_projection.hammer.manifest_content_hash!==authority.manifest_content_hash)throw new Error("Source Conflict: Tongs returned disagreeing Quench authority.");
        if(cancelled)return;setOpenAuthority(authority);setHandoffPreparedCase(buildCanonicalReleaseCase(authority.review_projection));setPreparedHandoffState({status:"ready",handoff,message:null,warning:authority.newer_manifest_available?"New Package Available: this review remains on its original manifest until you explicitly review the new package.":null,loadedFingerprint:loadedFingerprint??authority.manifest_content_hash,loadedPreparedAt:loadedPreparedAt??authority.opened_at});
      }catch(error){if(cancelled)return;setOpenAuthority(null);setHandoffPreparedCase(null);setPreparedHandoffState({status:"error",handoff,message:error instanceof Error?error.message:"Quench could not open this review.",warning:null,loadedFingerprint:null,loadedPreparedAt:null});
      }
    }
    void loadReviewAuthority();return()=>{cancelled=true;};
  },[location.search,openRevision,routeCtx.workspaceId,routeCtx.workpieceId]);

  const applySelectedCaseDefaults = useCallback((nextCase: QuenchReleaseConsoleCase) => {
    setSelectedCaseId(nextCase.case_id);
    setSelectedPlatforms([...nextCase.default_platforms]);
    setPublishOptions(clonePublishOptions(nextCase.default_publish_options));
    setMetadataAssistState("idle");
    setMetadataAssistError(null);
    setMetadataAssistDraft(null);
  }, []);

  useEffect(() => {
    if (!handoffPreparedCase) return;
    queueMicrotask(() => {
      applySelectedCaseDefaults(handoffPreparedCase);
    });
  }, [applySelectedCaseDefaults, handoffPreparedCase]);

  useEffect(() => {
    if (!releaseCases.length) return;
    const nextCase = releaseCases.find((entry) => entry.case_id === selectedCaseId) ?? releaseCases[0];
    queueMicrotask(() => {
      applySelectedCaseDefaults(nextCase);
    });
  }, [applySelectedCaseDefaults, releaseCases, selectedCaseId]);

  const selectedCase = releaseCases.find((entry) => entry.case_id === selectedCaseId) ?? releaseCases[0] ?? null;
  const canonicalThumbnails=selectedCase?.canonical_projection?.thumbnails??null;
  const canonicalThumbnailStyleSources=new Set(canonicalThumbnails?.candidates.map((candidate)=>String(candidate.style_source??"brand_profile"))??[]);
  const canonicalProjection=selectedCase?.canonical_projection??null;
  const canonicalSeo=readJsonObject(canonicalProjection?.metadata.episode.seo);
  const canonicalTitleChoices=(Array.isArray(canonicalSeo?.titles)?canonicalSeo.titles:[]).map(readJsonObject).filter((entry):entry is Record<string,unknown>=>Boolean(entry&&readString(entry.text))).slice(0,3);
  const selectedTitleChoice=canonicalTitleChoices[selectedTitleIndex]??canonicalTitleChoices[0]??{id:"manifest-title",text:selectedCase?.packet.title??"Untitled episode",revision:canonicalProjection?.metadata.revision??1,is_primary:true};
  const selectedDescription=descriptionKind==="long"?(readString(canonicalSeo?.description_long)??readString(canonicalSeo?.description_short)??selectedCase?.packet.description??""):(readString(canonicalSeo?.description_short)??readString(canonicalSeo?.description_long)??selectedCase?.packet.description??"");
  const thumbnailSelectionScope=canonicalProjection?.destination_capabilities.find((scope)=>scope.platform==="youtube"&&scope.state==="active")??canonicalProjection?.destination_capabilities.find((scope)=>scope.state==="active")??null;
  const thumbnailSelectionDecision=thumbnailSelectionScope?canonicalProjection?.current_decisions.find((decision)=>decision.destination_scope_id===thumbnailSelectionScope.id)??null:null;
  const rumbleScope=canonicalProjection?.destination_capabilities.find((scope)=>scope.platform==="rumble"&&scope.execution_context==="manual_handoff"&&scope.state==="active")??null;
  const rumbleDecision=rumbleScope?canonicalProjection?.current_decisions.find((decision)=>decision.destination_scope_id===rumbleScope.id)??null:null;
  const rumbleCandidate=canonicalThumbnails?.candidates.find((entry)=>rumbleDecision?.assignments?.some((assignment)=>assignment.candidate_revision_id===entry.id))??null;
  const experimentCapability=getQuenchExperimentCapability(thumbnailSelectionScope);
  useEffect(()=>{let cancelled=false;async function load(){if(!openAuthority){setPublicationDestinations([]);setSelectedPublicationDestinationId("");return;}try{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/publication-destinations`,{method:"POST",json:{workspace_id:openAuthority.workspace_id},timeoutMs:45_000});const payload=await readResponseJson(response);const root=readJsonObject(payload);const rows=Array.isArray(root?.data)?root.data.filter((entry):entry is PublicationDestination=>!!entry&&typeof entry==="object"&&typeof (entry as Record<string,unknown>).executable_destination_id==="string"&&typeof (entry as Record<string,unknown>).capability_revision_id==="string"):[];if(cancelled)return;setPublicationDestinations(rows);setSelectedPublicationDestinationId((current)=>rows.some((row)=>row.executable_destination_id===current)?current:rows[0]?.executable_destination_id??"");}catch{if(!cancelled){setPublicationDestinations([]);setSelectedPublicationDestinationId("");}}}void load();return()=>{cancelled=true;};},[openAuthority]);
  useEffect(()=>{let cancelled=false;async function recover(){if(!openAuthority)return;try{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/publication-operations`,{method:"POST",json:{workspace_id:openAuthority.workspace_id,manifest_snapshot_id:openAuthority.manifest_snapshot_id},timeoutMs:45_000});const payload=await readResponseJson(response);const rows=readJsonObject(payload)?.data;if(cancelled||!Array.isArray(rows)||!rows.length)return;const latest=readJsonObject(rows[0]);const operationId=readString(latest?.publication_operation_id);if(!operationId)return;setPublicationOperationId(operationId);setSelectedPublicationDestinationId(readString(latest?.executable_destination_id)??"");setPublicationCommandState(readString(latest?.operation_state)==="reserved"?"reserved":"recorded");setPublicationCommandMessage(`Recovered durable publication operation ${operationId}; refresh did not rebuild its authority.`);}catch{/* recovery failure does not manufacture authority */}}void recover();return()=>{cancelled=true;};},[openAuthority]);
  useEffect(()=>{let cancelled=false;async function recover(){if(!openAuthority)return;try{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/manual-handoffs`,{method:"POST",json:{workspace_id:openAuthority.workspace_id},timeoutMs:45_000});const rows=readJsonObject(await readResponseJson(response))?.data;if(cancelled||!Array.isArray(rows)||!rows.length)return;const latest=readJsonObject(rows[0]);const snapshot=readJsonObject(latest?.snapshot);const receipts=Array.isArray(latest?.receipts)?latest.receipts.map(readJsonObject).filter(Boolean):[];const receipt=receipts.at(-1);setManualHandoffId(readString(snapshot?.id));setManualReceiptId(readString(receipt?.id));setRumbleResultUrl(readString(receipt?.result_url)??"");setManualHandoffMessage(readString(latest?.freshness)==="stale"?"Prepared manual handoff is stale; prepare again from the current release authority.":receipt?"Recovered creator-confirmed manual handoff history.":"Recovered prepared manual handoff.");}catch{/* read failure does not manufacture confirmation */}}void recover();return()=>{cancelled=true;};},[openAuthority]);
  useEffect(()=>{if(thumbnailSelectionDecision?.decision?.decision_kind!=="experiment_intent"||thumbnailSelectionDecision.decision.intent_state!=="experiment_planned")return;const control=thumbnailSelectionDecision.assignments?.find((entry)=>entry.assignment_role==="control")?.candidate_revision_id;const variants=thumbnailSelectionDecision.assignments?.filter((entry)=>entry.assignment_role==="variant").map((entry)=>String(entry.candidate_revision_id))??[];setExperimentControlId(typeof control==="string"?control:null);setExperimentVariantIds(variants);},[thumbnailSelectionDecision]);
  const selectCanonicalThumbnail=useCallback(async(candidateId:string)=>{if(!canonicalProjection||!thumbnailSelectionScope||!openAuthority)return;setThumbnailSelectionState("saving");setThumbnailSelectionMessage(null);try{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(canonicalProjection.workpiece_id)}/quench/select-candidate`,{method:"POST",json:{workspace_id:canonicalProjection.workspace_id,destination_scope_id:thumbnailSelectionScope.id,candidate_revision_id:candidateId,manifest_snapshot_id:openAuthority.manifest_snapshot_id,expected_decision_id:thumbnailSelectionDecision?.current_decision_id??null,expected_revision:thumbnailSelectionDecision?.current_revision??0,operation_id:crypto.randomUUID()},timeoutMs:45_000});const payload=await readResponseJson(response);const root=readJsonObject(payload);const result=readJsonObject(root?.data);const disposition=readString(result?.disposition);if(!response.ok)throw new Error(readString(readJsonObject(root?.error)?.message)??"Selection failed.");if(disposition==="revision_conflict"){setThumbnailSelectionState("conflict");setThumbnailSelectionMessage("The canonical decision advanced. Reload this same review authority before retrying.");}else if(!["committed","replayed","no_change"].includes(disposition??"")){throw new Error(`Selection was not committed: ${(disposition??"blocked").replaceAll("_"," ")}.`);}else{setThumbnailSelectionState("saved");setThumbnailSelectionMessage(disposition==="no_change"?"That candidate is already the canonical selection.":disposition==="replayed"?"The original canonical selection was restored from its operation receipt.":"Canonical thumbnail selection committed.");}setOpenRevision((value)=>value+1);}catch(error){setThumbnailSelectionState("error");setThumbnailSelectionMessage(error instanceof Error?error.message:"Selection failed.");}},[canonicalProjection,openAuthority,thumbnailSelectionDecision,thumbnailSelectionScope]);
  const readinessVerdict = selectedCase
    ? deriveReleasePacketReadinessVerdict(selectedCase.packet, resolvedAssets, selectedPlatforms)
    : null;
  const quenchEpisodeReadModel = useMemo(() => {
    const episodeId = routeCtx.workpieceId ?? selectedCase?.packet.workpiece_id ?? null;
    const title = selectedCase?.packet.title?.trim() ?? "";
    if (!episodeId || !title) return null;
    return {
      episodeId,
      title,
      phase: "release",
      displayStatus: readinessVerdict?.status === "ready" ? "releasing" : "edited",
    } satisfies EpisodeWorkspaceReadModel;
  }, [readinessVerdict?.status, routeCtx.workpieceId, selectedCase?.packet.title, selectedCase?.packet.workpiece_id]);
  useEpisodeWorkspaceLoading(
    routeCtx.workpieceId ?? null,
    Boolean(routeCtx.workpieceId && preparedHandoffState.status === "loading" && !quenchEpisodeReadModel),
  );
  useEpisodeWorkspaceReadModel(quenchEpisodeReadModel);
  const resolvedAssetCards: ResolvedAssetCard[] = [
    { kind: "video", asset: resolvedAssets.video },
    { kind: "audio", asset: resolvedAssets.audio },
    { kind: "thumbnail", asset: resolvedAssets.thumbnail },
  ];

  useEffect(() => {
    let cancelled = false;

    async function loadCapabilities() {
      const nextEntries = await Promise.all(
        QUENCH_ADAPTERS.map(async (adapter) => [adapter.platform, await adapter.getCapabilities()] as const),
      );
      if (cancelled) return;
      setCapabilities(Object.fromEntries(nextEntries) as Partial<Record<QuenchPlatform, PlatformCapabilities>>);
    }

    void loadCapabilities();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAssets() {
      if (!selectedCase) {
        setResolvedAssets({});
        return;
      }

      const resolver = new StaticAssetResolver(selectedCase.resolved_assets);
      const assets = await resolveReleaseAssets(selectedCase.packet, resolver);
      if(selectedCase.authority==="canonical"&&assets.video?.asset_id&&!assets.video.accessible){
        const manifestVideo=readJsonObject(selectedCase.canonical_projection?.hammer.manifest.video);
        const response=await tongsFetch(`/tongs/workspaces/${encodeURIComponent(selectedCase.packet.workspace_id)}/assets/${encodeURIComponent(assets.video.asset_id)}/resolve-authority`,{method:"POST",json:{expected_workpiece_id:selectedCase.packet.workpiece_id,expected_content_hash:readString(manifestVideo?.canonical_content_hash)},timeoutMs:45_000});
        const root=readJsonObject(await readResponseJson(response));const authority=readJsonObject(readJsonObject(root?.data)?.authority);const path=readString(authority?.path);
        if(response.ok&&readString(authority?.state)==="ready"&&path)assets.video={...assets.video,uri:path,mime_type:readString(authority?.mimeType)??assets.video.mime_type,accessible:true};
      }
      if (cancelled) return;
      setResolvedAssets(assets);
      setPublishResults({});
      setBoardUpdatedAt(null);
    }

    void loadAssets();
    return () => {
      cancelled = true;
    };
  }, [selectedCase]);

  useEffect(() => {
    let cancelled = false;

    async function loadValidations() {
      if (!selectedCase) {
        setValidations({});
        return;
      }

      const context = buildPublishContext(runMode, resolvedAssets, readinessVerdict ?? { status: "blocked", ready: false });
      const nextEntries = await Promise.all(
        QUENCH_ADAPTERS.map(async (adapter) => {
          const options = publishOptions[adapter.platform] ?? getDefaultPublishOptions(adapter.platform);
          const validation = await adapter.validate(selectedCase.packet, options, context);
          return [adapter.platform, validation] as const;
        }),
      );

      if (cancelled) return;
      setValidations(Object.fromEntries(nextEntries) as Partial<Record<QuenchPlatform, AdapterValidationResult>>);
    }

    void loadValidations();
    return () => {
      cancelled = true;
    };
  }, [publishOptions, readinessVerdict?.ready, readinessVerdict?.status, resolvedAssets, runMode, selectedCase]);

  async function establishAndRunPublicationStub():Promise<void>{
    if(!selectedCase||!openAuthority||!readinessVerdict||!canExecuteQuenchPublish(readinessVerdict))return;
    const destination=publicationDestinations.find((row)=>row.executable_destination_id===selectedPublicationDestinationId);const decision=thumbnailSelectionDecision?.decision;const decisionId=thumbnailSelectionDecision?.current_decision_id;const decisionRevision=thumbnailSelectionDecision?.current_revision??0;
    if(!destination||!decisionId||decisionRevision<1||!decision){setPublicationCommandState("error");setPublicationCommandMessage("An exact release decision and executable destination are required before publication can be established.");return;}
    const platform:QuenchPlatform=destination.provider==="google"?"youtube":destination.provider==="rss_host"?"podcast_host":selectedPlatforms[0]??"youtube";const adapter=platform==="podcast_host"?new TransistorAdapter(destination.external_destination_id):QUENCH_ADAPTERS.find((entry)=>entry.platform===platform);if(!adapter){setPublicationCommandState("error");setPublicationCommandMessage("No reviewed adapter exists for this executable destination.");return;}
    const operationKey=publicationOperationKey??crypto.randomUUID();setPublicationOperationKey(operationKey);setPublicationCommandState("establishing");setPublicationCommandMessage(null);
    try{
      const options=publishOptions[platform]??getDefaultPublishOptions(platform);const chosenThumbnail=canonicalThumbnails?.candidates.find((candidate)=>thumbnailSelectionDecision?.assignments?.some((assignment)=>assignment.assignment_role==="selected"&&assignment.candidate_revision_id===candidate.id))??canonicalThumbnails?.candidates.find(isQuenchCandidateSelectable)??null;const video=canonicalProjection?.hammer.manifest.video;const assets=[{kind:"video",ref:{id:readString(video?.canonical_asset_id)??readString(video?.media_id)??"video",revision:1,content_hash:readString(video?.canonical_content_hash)??openAuthority.manifest_content_hash},delivery:"youtube_resumable_video",canonical_path:readString(video?.workpiece_path)??readString(video?.local_relpath)??resolvedAssets.video?.uri??null,required:true},...(chosenThumbnail?[{kind:"thumbnail",ref:{id:chosenThumbnail.id,revision:chosenThumbnail.candidate_binding_revision,content_hash:chosenThumbnail.composite_content_hash},delivery:"youtube_thumbnail",canonical_path:chosenThumbnail.asset_path??null,required:true}]:[]),...(includeCaptions&&canonicalProjection?.hammer.manifest.captions.vtt_path?[{kind:"caption",ref:{id:"canonical-vtt",revision:1,content_hash:openAuthority.manifest_content_hash},delivery:"youtube_caption",canonical_path:canonicalProjection.hammer.manifest.captions.vtt_path,required:false}]:[])];const finalizedPackage={contract_version:"forge.finalized-destination-package.v1",workspace_id:openAuthority.workspace_id,workpiece_id:openAuthority.workpiece_id,manifest_snapshot_id:openAuthority.manifest_snapshot_id,manifest_content_hash:openAuthority.manifest_content_hash,metadata_revision:canonicalProjection?.metadata.revision??1,metadata_content_hash:canonicalProjection?.metadata.content_hash??openAuthority.manifest_content_hash,destination_capability_revision_id:destination.capability_revision_id,destination_capability_content_hash:destination.capability_content_hash,executable_destination_id:destination.executable_destination_id,platform,mode:options.mode,visibility:options.visibility??"private",scheduled_for:options.scheduled_for??null,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,category_id:youtubeCategory,notify_subscribers:notifySubscribers,title:{id:readString(selectedTitleChoice.id)??`title-${selectedTitleIndex+1}`,revision:typeof selectedTitleChoice.revision==="number"?selectedTitleChoice.revision:canonicalProjection?.metadata.revision??1,content_hash:canonicalProjection?.metadata.content_hash??openAuthority.manifest_content_hash,text:readString(selectedTitleChoice.text)??selectedCase.packet.title,rank:selectedTitleIndex+1},description:{id:`description-${descriptionKind}`,revision:canonicalProjection?.metadata.revision??1,content_hash:canonicalProjection?.metadata.content_hash??openAuthority.manifest_content_hash,text:selectedDescription,kind:descriptionKind},assets,include_sources:includeSources,finalized_at:new Date().toISOString()};const packageKey=crypto.randomUUID();const finalizeResponse=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/finalize-destination-package`,{method:"POST",json:{workspace_id:openAuthority.workspace_id,operation_key:packageKey,executable_destination_id:destination.executable_destination_id,manifest_snapshot_id:openAuthority.manifest_snapshot_id,manifest_content_hash:openAuthority.manifest_content_hash,metadata_revision:canonicalProjection?.metadata.revision??1,metadata_content_hash:canonicalProjection?.metadata.content_hash??openAuthority.manifest_content_hash,destination_capability_revision_id:destination.capability_revision_id,resolved_package:finalizedPackage},timeoutMs:45_000});const finalized=readJsonObject(readJsonObject(await readResponseJson(finalizeResponse))?.data);const finalizedPackageId=readString(finalized?.finalized_package_id);if(!finalizeResponse.ok||!finalizedPackageId)throw new Error(`Destination package could not be frozen: ${readString(finalized?.code)??readString(finalized?.disposition)??"blocked"}.`);const establishResponse=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/establish-publication`,{method:"POST",json:{workspace_id:openAuthority.workspace_id,operation_key:operationKey,manifest_snapshot_id:openAuthority.manifest_snapshot_id,manifest_content_hash:openAuthority.manifest_content_hash,release_decision_id:decisionId,release_decision_revision:decisionRevision,executable_destination_id:destination.executable_destination_id,destination_capability_revision_id:destination.capability_revision_id,publication_intent_contract_version:"forge.publication-intent.v2",publication_intent_snapshot:{platform,finalized_package_id:finalizedPackageId,package_content_hash:finalized?.package_content_hash}},timeoutMs:45_000});const establishPayload=await readResponseJson(establishResponse);const establishRoot=readJsonObject(establishPayload);const established=readJsonObject(establishRoot?.data);const operationId=readString(established?.publication_operation_id);if(!establishResponse.ok||!operationId||!["established","replayed"].includes(readString(established?.disposition)??""))throw new Error(`Publication authority was not established: ${readString(established?.code)??readString(established?.disposition)??"blocked"}.`);setPublicationOperationId(operationId);
      const claimResponse=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/claim-publication-attempt`,{method:"POST",json:{workspace_id:openAuthority.workspace_id,publication_operation_id:operationId,retry:false},timeoutMs:45_000});const claimPayload=await readResponseJson(claimResponse);const claim=readJsonObject(readJsonObject(claimPayload)?.data);const attemptId=readString(claim?.publication_attempt_id);if(!claimResponse.ok||!attemptId||readString(claim?.disposition)!=="claimed")throw new Error(`Publication attempt was not reserved: ${readString(claim?.code)??"blocked"}.`);setPublicationCommandState("reserved");
      const enqueueResponse=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/enqueue-youtube-publication`,{method:"POST",json:{workspace_id:openAuthority.workspace_id,publication_operation_id:operationId,publication_attempt_id:attemptId,finalized_package_id:finalizedPackageId},timeoutMs:45_000});if(!enqueueResponse.ok)throw new Error("The YouTube publication job could not be queued.");void fetch("/.netlify/functions/youtube-publication-background",{method:"POST"}).catch(()=>undefined);setPublicationCommandState("recorded");setPublicationCommandMessage("The frozen package is queued for a recoverable YouTube upload.");setBoardUpdatedAt(new Date().toISOString());setFlowStep(4);
    }catch(error){setPublicationCommandState("error");setPublicationCommandMessage(error instanceof Error?error.message:"Publication authority failed.");}
  }

  async function selectRumbleThumbnail(candidateId:string):Promise<void>{
    if(!canonicalProjection||!rumbleScope||!openAuthority)return;const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(canonicalProjection.workpiece_id)}/quench/select-candidate`,{method:"POST",json:{workspace_id:canonicalProjection.workspace_id,destination_scope_id:rumbleScope.id,candidate_revision_id:candidateId,manifest_snapshot_id:openAuthority.manifest_snapshot_id,expected_decision_id:rumbleDecision?.current_decision_id??null,expected_revision:rumbleDecision?.current_revision??0,operation_id:crypto.randomUUID()},timeoutMs:45_000});const data=readJsonObject(readJsonObject(await readResponseJson(response))?.data);if(!response.ok||!["committed","replayed","no_change"].includes(readString(data?.disposition)??"")){setManualHandoffMessage(`Rumble thumbnail decision failed: ${readString(data?.code)??"blocked"}.`);return;}setManualHandoffMessage("Rumble handoff thumbnail selected.");setOpenRevision((value)=>value+1);
  }

  useEffect(()=>{if(!publicationOperationId||!openAuthority)return;let cancelled=false;const load=async()=>{try{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/youtube-publication-progress`,{method:"POST",json:{workspace_id:openAuthority.workspace_id,publication_operation_id:publicationOperationId}});const data=readJsonObject(readJsonObject(await readResponseJson(response))?.data);if(!cancelled&&response.ok&&data)setPublicationProgress(data);}catch{/* preserve the last sanitized projection */}};void load();const timer=window.setInterval(()=>void load(),3000);return()=>{cancelled=true;window.clearInterval(timer)}},[openAuthority,publicationOperationId]);

  async function prepareRumbleManualHandoff():Promise<void>{
    if(!selectedCase||!openAuthority||!rumbleScope||!rumbleDecision?.current_decision_id)return;
    const candidate=canonicalThumbnails?.candidates.find((entry)=>rumbleDecision.assignments?.some((assignment)=>assignment.candidate_revision_id===entry.id))??null;
    const thumbnail=candidate?{asset_id:candidate.composite_asset_id,kind:"thumbnail" as const,source:"cloud" as const,uri:candidate.asset_path??`workpiece-media://${openAuthority.workpiece_id}/${candidate.composite_asset_id}`,accessible:candidate.authority_verified}:null;
    const assets={...resolvedAssets,thumbnail};const options=publishOptions.rumble??getDefaultPublishOptions("rumble");const intent={category:rumbleCategory,visibility:options.visibility??"private" as const,intended_schedule:options.mode==="schedule"?options.scheduled_for??null:null};const validation=validateRumbleManualHandoff({...selectedCase.packet,thumbnail_asset_id:thumbnail?.asset_id??null},assets,options,intent);
    if(!validation.ok){setManualHandoffMessage(validation.errors.map((entry)=>entry.message).join(" "));return;}
    const capability=readJsonObject(rumbleScope.current_capability);const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/prepare-manual-handoff`,{method:"POST",json:{workspace_id:openAuthority.workspace_id,prepare_key:crypto.randomUUID(),manifest_snapshot_id:openAuthority.manifest_snapshot_id,manifest_content_hash:openAuthority.manifest_content_hash,release_decision_id:rumbleDecision.current_decision_id,release_decision_revision:rumbleDecision.current_revision,destination_scope_id:rumbleScope.id,destination_capability_revision_id:readString(capability?.id),handoff_contract_version:"forge.manual-handoff.v1",handoff_snapshot:buildRumbleManualHandoffSnapshot({...selectedCase.packet,thumbnail_asset_id:thumbnail?.asset_id??null},assets,options,intent)},timeoutMs:45_000});const root=readJsonObject(await readResponseJson(response));const data=readJsonObject(root?.data);const id=readString(data?.manual_handoff_snapshot_id);if(!response.ok||!id){setManualHandoffMessage(`Manual handoff was not prepared: ${readString(data?.code)??"blocked"}.`);return;}setManualHandoffId(id);setManualHandoffMessage("Canonical manual handoff prepared. Download and upload remain creator actions.");setFlowStep(4);
  }

  async function confirmRumbleManualHandoff():Promise<void>{if(!openAuthority||!manualHandoffId)return;const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/confirm-manual-handoff`,{method:"POST",json:{workspace_id:openAuthority.workspace_id,manual_handoff_snapshot_id:manualHandoffId,result_url:rumbleResultUrl,supersedes_receipt_id:manualReceiptId},timeoutMs:45_000});const data=readJsonObject(readJsonObject(await readResponseJson(response))?.data);const id=readString(data?.receipt_id);if(!response.ok||!id){setManualHandoffMessage(`Confirmation was not recorded: ${readString(data?.code)??"blocked"}.`);return;}setManualReceiptId(id);setManualHandoffMessage(`Creator-confirmed receipt r${String(data?.revision??1)} recorded. This is not provider verification.`);}

  async function retryYoutubeStage():Promise<void>{if(!openAuthority||!publicationOperationId)return;setPublicationCommandMessage("Queueing the failed stage…");const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(openAuthority.workpiece_id)}/quench/retry-youtube-publication-stage`,{method:"POST",json:{workspace_id:openAuthority.workspace_id,publication_operation_id:publicationOperationId}});const data=readJsonObject(readJsonObject(await readResponseJson(response))?.data);if(!response.ok||readString(data?.disposition)!=="retry_queued"){setPublicationCommandMessage("This stage could not be retried.");return;}setPublicationProgress((current)=>current?{...current,state:readString(data?.stage)??"queued",stage:readString(data?.stage)??"queued",retryable:false,user_action_code:null}:current);setPublicationCommandMessage("Retry queued against the existing YouTube video.");void fetch("/.netlify/functions/youtube-publication-background",{method:"POST"}).catch(()=>undefined);}

  const requestMetadataAssist = useCallback(async () => {
    if (!selectedCase) return;
    const workspaceId = readString(shell.workspaceId) ?? readString(selectedCase.packet.workspace_id);
    const workpieceId = readString(routeCtx.workpieceId) ?? readString(selectedCase.packet.workpiece_id);
    if (!workspaceId || !workpieceId) {
      setMetadataAssistState("error");
      setMetadataAssistError("Workspace and workpiece context are required before metadata assist can run.");
      return;
    }

    setMetadataAssistState("running");
    setMetadataAssistError(null);
    try {
      const draft = await requestQuenchMetadataAssist({
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        title: selectedCase.packet.title,
        description: selectedCase.packet.description,
        tags: selectedCase.packet.tags,
      });
      setMetadataAssistDraft(draft);
      setMetadataAssistState("ready");
    } catch (error) {
      setMetadataAssistDraft(null);
      setMetadataAssistState("error");
      setMetadataAssistError(
        error instanceof Error && error.message.trim()
          ? error.message
          : "Quench metadata assist failed.",
      );
    }
  }, [routeCtx.workpieceId, selectedCase, shell.workspaceId]);

  function togglePlatform(platform: QuenchPlatform) {
    setSelectedPlatforms((current) => (
      current.includes(platform)
        ? current.filter((entry) => entry !== platform)
        : [...current, platform]
    ));
    setPublishOptions((current) => ({
      ...current,
      [platform]: current[platform] ? { ...current[platform] } : getDefaultPublishOptions(platform),
    }));
  }

  function updatePlatformOptions(
    platform: QuenchPlatform,
    mutate: (current: PlatformPublishOptions) => PlatformPublishOptions,
  ) {
    setPublishOptions((current) => {
      const existing = current[platform] ?? getDefaultPublishOptions(platform);
      return {
        ...current,
        [platform]: mutate(existing),
      };
    });
  }

  async function mutateThumbnailExperiment(cancel=false){if(!canonicalProjection||!thumbnailSelectionScope||!openAuthority)return;setExperimentState("saving");setExperimentMessage(null);try{const assignments=cancel?[]:[experimentControlId,...experimentVariantIds].filter((id):id is string=>!!id).map((candidate_revision_id,index)=>({candidate_revision_id,assignment_role:index===0?"control":"variant",assignment_ordinal:index+1,allocation_basis_points:null}));const endpoint=cancel?"cancel-thumbnail-experiment":"plan-thumbnail-experiment";const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(canonicalProjection.workpiece_id)}/quench/${endpoint}`,{method:"POST",json:{workspace_id:canonicalProjection.workspace_id,destination_scope_id:thumbnailSelectionScope.id,manifest_snapshot_id:openAuthority.manifest_snapshot_id,expected_decision_id:thumbnailSelectionDecision?.current_decision_id??null,expected_revision:thumbnailSelectionDecision?.current_revision??0,operation_id:crypto.randomUUID(),...(cancel?{}:{assignments})},timeoutMs:45_000});const payload=await readResponseJson(response);const root=readJsonObject(payload);const result=readJsonObject(root?.data);const disposition=readString(result?.disposition);if(!response.ok)throw new Error(readString(readJsonObject(root?.error)?.message)??"Experiment intent failed.");if(disposition==="revision_conflict"){setExperimentState("error");setExperimentMessage("The canonical decision advanced. Reload this same review authority before retrying.");}else if(!["committed","replayed","no_change"].includes(disposition??"")){throw new Error(`Experiment intent was not committed: ${(disposition??"blocked").replaceAll("_"," ")}.`);}else{setExperimentState("saved");setExperimentMessage(cancel?"Experiment cancelled. This creates a new zero-assignment decision and does not restore the previous selected thumbnail.":disposition==="no_change"?"This exact experiment plan is already current.":"Canonical experiment intent planned. Automatic thumbnail rotation is not active.");}setOpenRevision((value)=>value+1);}catch(error){setExperimentState("error");setExperimentMessage(error instanceof Error?error.message:"Unable to save experiment intent.");}}

  if(selectedCase && flowStep >= 1){
    const selectedThumb=canonicalThumbnails?.candidates.find((candidate)=>thumbnailSelectionDecision?.assignments?.some((assignment)=>assignment.assignment_role==="selected"&&assignment.candidate_revision_id===candidate.id))??canonicalThumbnails?.candidates.find(isQuenchCandidateSelectable)??null;
    const youtubeDestination=publicationDestinations.find((destination)=>destination.executable_destination_id===selectedPublicationDestinationId)??publicationDestinations.find((destination)=>destination.provider==="google")??null;
    const options=publishOptions.youtube??getDefaultPublishOptions("youtube");
    const blockers=[...(readinessVerdict?.blocking_reasons_detail??[]).map((reason)=>reason.label),...(!selectedPlatforms.length?["Choose YouTube or Rumble."]:[]),...(!selectedThumb&&selectedPlatforms.includes("youtube")?["Choose a thumbnail for YouTube."]:[]),...(!youtubeDestination&&selectedPlatforms.includes("youtube")?["Connect and grant a YouTube channel."]:[])];
    const steps=["Review","Destinations","Confirm","Results"] as const;
    return <section className="quench-flow">
      <header className="quench-flow__hero"><div><div className="quench-flow__eyebrow">Quench · Publish</div><h1>{readString(selectedTitleChoice.text)??selectedCase.packet.title}</h1><p>Choose the approved package, decide where it goes, and publish with recoverable progress.</p></div>{selectedThumb?<div className="quench-flow__hero-art"><QuenchCandidatePreview workpieceId={selectedCase.packet.workpiece_id} path={selectedThumb.asset_path} mimeType={selectedThumb.asset_mime_type} ordinal={selectedThumb.candidate_ordinal}/></div>:null}</header>
      <nav className="quench-flow__steps" aria-label="Publishing progress">{steps.map((label,index)=><button key={label} type="button" data-current={flowStep===index+1?"1":"0"} data-complete={flowStep>index+1?"1":"0"} onClick={()=>setFlowStep((index+1) as 1|2|3|4)}><span>{index+1}</span>{label}</button>)}</nav>
      {preparedHandoffState.warning?<div className="quench-flow__notice is-warn"><strong>Updated episode available.</strong><span>Your current review stays frozen until you choose Review new package.</span>{routeCtx.workspaceId&&routeCtx.workpieceId?<button type="button" onClick={()=>{resetQuenchOpenOperationId(routeCtx.workspaceId!,routeCtx.workpieceId!);setOpenRevision((value)=>value+1)}}>Review new package</button>:null}</div>:null}
      <main className="quench-flow__stage">
      {flowStep===1?<><div className="quench-flow__stage-head"><div><span>Step 1 of 4</span><h2>Review your episode</h2><p>Everything here was authored upstream. Quench only selects approved choices.</p></div><div className={`quench-flow__readiness ${blockers.length?"is-bad":"is-good"}`}>{blockers.length?`${blockers.length} item${blockers.length===1?"":"s"} to fix`:"Ready to configure"}</div></div>
        <div className="quench-flow__review-grid"><section className="quench-flow__preview"><QuenchMediaPreview workpieceId={selectedCase.packet.workpiece_id} asset={resolvedAssets.video??resolvedAssets.audio} label="Canonical episode"/><div className="quench-flow__asset-switch"><strong>{resolvedAssets.video?"Final video":"Final audio"}</strong><span>{formatDuration((resolvedAssets.video??resolvedAssets.audio)?.duration_sec)}</span></div></section><section className="quench-flow__choices"><fieldset><legend>Approved title</legend>{(canonicalTitleChoices.length?canonicalTitleChoices:[selectedTitleChoice]).map((title,index)=><label className="quench-flow__choice" key={readString(title.id)??String(index)}><input type="radio" name="release-title" checked={selectedTitleIndex===index} onChange={()=>setSelectedTitleIndex(index)}/><span><b>#{index+1}</b>{readString(title.text)}</span></label>)}</fieldset><fieldset><legend>Description</legend><div className="quench-flow__segmented"><button type="button" data-active={descriptionKind==="long"?"1":"0"} onClick={()=>setDescriptionKind("long")}>Long</button><button type="button" data-active={descriptionKind==="short"?"1":"0"} onClick={()=>setDescriptionKind("short")}>Short</button></div><p className="quench-flow__description">{selectedDescription}</p><div className="quench-console__copy-block" aria-label="Metadata Assist"><div className="quench-console__card-head"><strong>Metadata Assist</strong><button type="button" onClick={()=>{void requestMetadataAssist();}} disabled={metadataAssistState==="running"}>{metadataAssistState==="running"?"Generating...":"Generate AI Draft"}</button></div><p>Generate a tighter title and description draft before choosing what to publish.</p>{metadataAssistState==="error"&&metadataAssistError?<div className="quench-console__issue is-bad">{metadataAssistError}</div>:null}{metadataAssistDraft?<div className="quench-console__issue-list"><div className="quench-console__issue is-good"><strong>Suggested title</strong><span>{metadataAssistDraft.title}</span></div><div className="quench-console__issue is-good"><strong>Suggested description</strong><span>{metadataAssistDraft.description}</span></div>{metadataAssistDraft.tags.length?<div className="quench-console__tag-row">{metadataAssistDraft.tags.map((tag)=><span key={`flow-ai-draft-tag-${tag}`} className="quench-console__tag">{tag}</span>)}</div>:null}</div>:null}</div></fieldset><label className="quench-flow__toggle"><input type="checkbox" checked={includeCaptions} onChange={(event)=>setIncludeCaptions(event.target.checked)}/> Include canonical captions</label><label className="quench-flow__toggle"><input type="checkbox" checked={includeSources} onChange={(event)=>setIncludeSources(event.target.checked)}/> Include canonical source disclosures</label></section></div>
        <section><div className="quench-flow__section-title"><h3>Thumbnail</h3><span>Choose one approved image</span></div><div className="quench-flow__thumbnails">{canonicalThumbnails?.candidates.filter(isQuenchCandidateSelectable).map((candidate)=>{const selected=candidate.id===selectedThumb?.id;return <button type="button" key={candidate.id} data-selected={selected?"1":"0"} onClick={()=>void selectCanonicalThumbnail(candidate.id)}><QuenchCandidatePreview workpieceId={selectedCase.packet.workpiece_id} path={candidate.asset_path} mimeType={candidate.asset_mime_type} ordinal={candidate.candidate_ordinal}/><span>{selected?"Selected":`Candidate ${candidate.candidate_ordinal}`}</span></button>})}</div></section>
        <details className="quench-flow__advanced"><summary>Thumbnail experiment <span>Optional</span></summary><p>Plan candidates only. This does not start a provider experiment.</p>{experimentCapability.planning_supported?<div className="quench-flow__experiment">{canonicalThumbnails?.candidates.filter(isQuenchCandidateSelectable).map((candidate)=><label key={candidate.id}><input type="checkbox" checked={experimentControlId===candidate.id||experimentVariantIds.includes(candidate.id)} onChange={()=>experimentControlId?setExperimentVariantIds((current)=>current.includes(candidate.id)?current.filter((id)=>id!==candidate.id):[...current,candidate.id]):setExperimentControlId(candidate.id)}/>{candidate.candidate_ordinal===selectedThumb?.candidate_ordinal?"Selected thumbnail":`Candidate ${candidate.candidate_ordinal}`}</label>)}<button type="button" disabled={!experimentControlId||!experimentVariantIds.length} onClick={()=>void mutateThumbnailExperiment(false)}>Save experiment plan</button></div>:<p>Experiments are not supported by this destination.</p>}</details>
      </>:null}
      {flowStep===2?<><div className="quench-flow__stage-head"><div><span>Step 2 of 4</span><h2>Choose destinations</h2><p>Start with shared selections, then adjust the settings each destination supports.</p></div></div><div className="quench-flow__destinations"><article data-selected={selectedPlatforms.includes("youtube")?"1":"0"}><div className="quench-flow__destination-head"><div className="quench-flow__provider-mark">▶</div><div><h3>YouTube</h3><p>{youtubeDestination?.display_label??"No connected channel"}</p></div><button type="button" onClick={()=>togglePlatform("youtube")}>{selectedPlatforms.includes("youtube")?"Selected":"Add"}</button></div>{selectedPlatforms.includes("youtube")?<div className="quench-flow__destination-settings"><label>Channel<select value={selectedPublicationDestinationId} onChange={(event)=>setSelectedPublicationDestinationId(event.target.value)}><option value="">Choose channel</option>{publicationDestinations.filter((destination)=>destination.provider==="google").map((destination)=><option key={destination.executable_destination_id} value={destination.executable_destination_id}>{destination.display_label}</option>)}</select></label><label>Visibility<select value={options.visibility??"private"} onChange={(event)=>updatePlatformOptions("youtube",(current)=>({...current,visibility:event.target.value as "private"|"unlisted"|"public"}))}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label><label>Timing<select value={options.mode} onChange={(event)=>updatePlatformOptions("youtube",(current)=>({...current,mode:event.target.value as ReleaseMode}))}><option value="publish">Publish now</option><option value="schedule">Schedule</option></select></label>{options.mode==="schedule"?<label>Publish date and time<input type="datetime-local" value={(options.scheduled_for??"").slice(0,16)} onChange={(event)=>updatePlatformOptions("youtube",(current)=>({...current,scheduled_for:event.target.value?new Date(event.target.value).toISOString():undefined}))}/><small>{Intl.DateTimeFormat().resolvedOptions().timeZone}</small></label>:null}<label>Category<select value={youtubeCategory} onChange={(event)=>setYoutubeCategory(event.target.value)}><option value="22">People & Blogs</option><option value="27">Education</option><option value="24">Entertainment</option><option value="28">Science & Technology</option></select></label><label className="quench-flow__toggle"><input type="checkbox" checked={notifySubscribers} onChange={(event)=>setNotifySubscribers(event.target.checked)}/> Notify subscribers</label><div className="quench-flow__package-preview"><strong>Package preview</strong><span>Title #{selectedTitleIndex+1} · {descriptionKind} description</span><span>Video · thumbnail{includeCaptions?" · captions":""}{includeSources?" · source disclosures":""}</span></div></div>:null}</article><article data-selected={selectedPlatforms.includes("rumble")?"1":"0"}><div className="quench-flow__destination-head"><div className="quench-flow__provider-mark">R</div><div><h3>Rumble</h3><p>Manual upload</p></div><button type="button" onClick={()=>togglePlatform("rumble")}>{selectedPlatforms.includes("rumble")?"Selected":"Add"}</button></div>{selectedPlatforms.includes("rumble")?<p className="quench-flow__destination-note">Quench prepares the files and copy. You upload them on Rumble and confirm the resulting link.</p>:null}</article><article aria-disabled="true"><div className="quench-flow__destination-head"><div className="quench-flow__provider-mark">T</div><div><h3>Transistor</h3><p>Podcast host · automation coming later</p></div><button type="button" disabled>Unavailable</button></div></article></div></>:null}
      {flowStep===3?<><div className="quench-flow__stage-head"><div><span>Step 3 of 4</span><h2>Confirm publication</h2><p>These exact selections will be frozen before any provider action begins.</p></div></div>{blockers.length?<div className="quench-flow__blockers"><h3>Fix before publishing</h3>{blockers.map((blocker)=><p key={blocker}>{blocker}</p>)}</div>:null}<div className="quench-flow__confirm"><section><h3>Episode package</h3><dl><div><dt>Title</dt><dd>#{selectedTitleIndex+1} · {readString(selectedTitleChoice.text)}</dd></div><div><dt>Description</dt><dd>{descriptionKind}</dd></div><div><dt>Media</dt><dd>{resolvedAssets.video?"Final video":"Final audio"}</dd></div><div><dt>Includes</dt><dd>Thumbnail{includeCaptions?", captions":""}{includeSources?", source disclosures":""}</dd></div></dl></section><section><h3>Destination</h3><dl><div><dt>YouTube</dt><dd>{selectedPlatforms.includes("youtube")?youtubeDestination?.display_label??"Not connected":"Not selected"}</dd></div><div><dt>Visibility</dt><dd>{options.visibility??"private"}</dd></div><div><dt>Timing</dt><dd>{options.mode==="schedule"?formatDate(options.scheduled_for):"Publish now"}</dd></div></dl></section></div></>:null}
      {flowStep===4?<><div className="quench-flow__stage-head"><div><span>Step 4 of 4</span><h2>Publication status</h2><p>You can leave this page. Tongs keeps the operation and upload progress.</p></div></div>{publicationProgress?<div className="quench-flow__progress-card"><div className="quench-flow__progress-head"><strong>{String(publicationProgress.stage??"queued").replaceAll("_"," ")}</strong><span>{String(publicationProgress.percent??0)}%</span></div><progress max="100" value={Number(publicationProgress.percent??0)}/><p>{Number(publicationProgress.transferred_bytes??0).toLocaleString()} of {Number(publicationProgress.total_bytes??0).toLocaleString()} bytes</p>{readString(publicationProgress.external_url)?<a className="quench-flow__primary" href={readString(publicationProgress.external_url)!} target="_blank" rel="noreferrer">Open on YouTube</a>:null}{readString(publicationProgress.user_action_code)?<div className="quench-flow__notice is-bad"><span>{readString(publicationProgress.user_action_code)?.replaceAll("_"," ")}</span>{publicationProgress.retryable===true?<button type="button" onClick={()=>void retryYoutubeStage()}>Retry this stage</button>:null}</div>:null}</div>:null}{manualHandoffId?<section className="quench-flow__manual"><h3>{manualReceiptId?"Manual upload confirmed":"Complete your Rumble upload"}</h3><p>{manualHandoffMessage}</p><ol><li><div><strong>Download the package</strong><span>Use these exact canonical files.</span></div><div className="quench-flow__manual-actions">{resolvedAssets.video?.uri?<button type="button" onClick={()=>void downloadWorkpieceFile(openAuthority!.workpiece_id,resolvedAssets.video!.uri,"rumble-video")}>Video</button>:null}{selectedThumb?.asset_path?<button type="button" onClick={()=>void downloadWorkpieceFile(openAuthority!.workpiece_id,selectedThumb.asset_path!,"rumble-thumbnail")}>Thumbnail</button>:null}{includeCaptions&&canonicalProjection?.hammer.manifest.captions.vtt_path?<button type="button" onClick={()=>void downloadWorkpieceFile(openAuthority!.workpiece_id,canonicalProjection.hammer.manifest.captions.vtt_path!,"captions.vtt")}>Captions</button>:null}{canonicalProjection?.hammer.manifest.transcript.path?<button type="button" onClick={()=>void downloadWorkpieceFile(openAuthority!.workpiece_id,canonicalProjection.hammer.manifest.transcript.path!,"transcript")}>Transcript</button>:null}</div></li><li><div><strong>Copy the approved text</strong><span>Title, description, and disclosures stay unchanged.</span></div><button type="button" onClick={()=>void navigator.clipboard.writeText(`${readString(selectedTitleChoice.text)??selectedCase.packet.title}\n\n${selectedDescription}`)}>Copy metadata</button></li><li><div><strong>Upload on Rumble</strong><span>Rumble remains a creator-completed handoff.</span></div><a href="https://rumble.com/upload.php" target="_blank" rel="noreferrer">Open Rumble upload</a></li><li><label>Resulting Rumble link<input type="url" placeholder="https://rumble.com/…" value={rumbleResultUrl} onChange={(event)=>setRumbleResultUrl(event.target.value)}/></label><button type="button" disabled={!rumbleResultUrl.trim()||Boolean(manualReceiptId)} onClick={()=>void confirmRumbleManualHandoff()}>{manualReceiptId?"Confirmed":"Confirm manual upload"}</button></li></ol>{manualReceiptId?<div className="quench-flow__notice"><strong>Manual upload confirmed</strong><span>Creator-confirmed; not provider-verified.</span></div>:null}</section>:null}{!publicationProgress&&!manualHandoffId?<div className="quench-flow__progress-card"><h3>{publicationCommandMessage??"No publication has started yet."}</h3><p>Return to Confirm when the package is ready.</p></div>:null}</>:null}
      </main>
      <footer className="quench-flow__actions">{flowStep>1&&flowStep<4?<button type="button" onClick={()=>setFlowStep((flowStep-1) as 1|2|3)}>Back</button>:<span/>}{flowStep<3?<button type="button" className="quench-flow__primary" onClick={()=>setFlowStep((flowStep+1) as 2|3)}>{flowStep===1?"Choose destinations":"Review publication"}</button>:null}{flowStep===3?<button type="button" className="quench-flow__primary" disabled={Boolean(blockers.length)||publicationCommandState==="establishing"} onClick={()=>selectedPlatforms.includes("youtube")?void establishAndRunPublicationStub():void prepareRumbleManualHandoff()}>{publicationCommandState==="establishing"?"Freezing package…":selectedPlatforms.includes("youtube")?(options.mode==="schedule"?"Schedule on YouTube":"Publish to YouTube"):"Prepare Rumble upload"}</button>:null}</footer>
      <details className="quench-flow__technical"><summary>Technical details</summary><div><span>Manifest</span><code>{openAuthority?.manifest_snapshot_id??"unavailable"}</code><span>Operation</span><code>{publicationOperationId??"not started"}</code><span>Authority</span><code>{preparedHandoffState.status}</code></div></details>
    </section>;
  }

  return (
    <section className="quench-console">
      <header className="quench-console__header">
        <div className="quench-console__heading">
          <div className="quench-console__eyebrow-row">
            <div className="quench-console__eyebrow">Quench Console</div>
            <span className="quench-console__title-badge">Under Construction</span>
          </div>
          <h1 className="quench-console__title">Prepare Release</h1>
          <p className="quench-console__subtitle">
            Review release readiness, platform choices, and the latest handoff from Editing before anything gets published.
          </p>
          <EpisodeContinuityStrip
            phase="release"
            workpieceId={routeCtx.workpieceId}
            compact
            detail="This episode is staying in release context while you review packaging and publish decisions."
          />
        </div>
        <div className="quench-console__header-meta">
          <div className="quench-console__meta-card">
            <span>Workspace</span>
            <strong>{shell.workspaceId ?? "none"}</strong>
          </div>
          <div className="quench-console__meta-card">
            <span>Release readiness</span>
            <strong className={readinessVerdict ? getVerdictTone(readinessVerdict.status) : "is-bad"}>
              {readinessVerdict ? getVerdictLabel(readinessVerdict.status) : "unknown"}
            </strong>
          </div>
          <div className="quench-console__meta-card">
            <span>Publish mode</span>
            <strong>{runMode}</strong>
          </div>
        </div>
      </header>

      {preparedHandoffState.status !== "idle" ? (
        <div className="quench-console__banner">
          <strong>Release handoff:</strong>
          {" "}
          {preparedHandoffState.status === "loading" ? "Checking the latest prepared release for this episode..." : null}
          {preparedHandoffState.status === "ready"
            ? "Canonical release authority is verified through Tongs."
            : null}
          {preparedHandoffState.status === "error"
            ? preparedHandoffState.message ?? "Prepared release could not be resolved."
            : null}
          {preparedHandoffState.loadedPreparedAt ? ` Updated ${formatDate(preparedHandoffState.loadedPreparedAt)}.` : null}
        </div>
      ) : null}
      {preparedHandoffState.warning ? (
        <div className="quench-console__issue is-warn">
          <strong>{preparedHandoffState.warning}</strong>
          {openAuthority?.newer_manifest_available&&routeCtx.workspaceId&&routeCtx.workpieceId?(
            <button type="button" onClick={()=>{resetQuenchOpenOperationId(routeCtx.workspaceId!,routeCtx.workpieceId!);setOpenRevision((value)=>value+1);}}>Review New Package</button>
          ):null}
        </div>
      ) : null}

      <div className="quench-console__layout">
        <aside className="quench-console__panel quench-console__panel--left">
          <div className="quench-console__panel-head">
            <h2>Release packets</h2>
            <span>{releaseCases.length}{handoffPreparedCase ? " canonical packet" : " development fixtures"}</span>
          </div>
          <div className="quench-console__case-list">
            {releaseCases.map((entry) => {
              const caseReadiness = deriveReleasePacketReadinessVerdict(
                entry.packet,
                entry.resolved_assets,
                entry.default_platforms,
              );
              const isSelected = entry.case_id === selectedCaseId;
              return (
                <button
                  key={entry.case_id}
                  type="button"
                  className={`quench-console__case${isSelected ? " is-selected" : ""}`}
                  onClick={() => applySelectedCaseDefaults(entry)}
                >
                  <div className="quench-console__case-top">
                    <strong>{entry.label}</strong><small>{entry.authority}</small>
                    <span className={getVerdictTone(caseReadiness.status)}>
                      {caseReadiness.status === "blocked"
                        ? `${caseReadiness.blocking_reason_codes.length} blocked`
                        : getVerdictLabel(caseReadiness.status)}
                    </span>
                  </div>
                  <div className="quench-console__case-summary">{entry.summary}</div>
                  <div className="quench-console__case-meta">
                    <span>{entry.packet.episode_id}</span>
                    <span>{entry.default_platforms.map((platform) => PLATFORM_LABELS[platform]).join(" + ")}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="quench-console__panel quench-console__panel--center">
          {selectedCase ? (
            <>
              <div className="quench-console__panel-head">
                <div>
                  <h2>{selectedCase.packet.title}</h2>
                  <div className="quench-console__packet-subtitle">
                    {selectedCase.packet.episode_id} · {selectedCase.packet.release_packet_id}
                  </div>
                </div>
                <div className="quench-console__mode-switch">
                  <button
                    type="button"
                    data-active={runMode === "stub" ? "1" : "0"}
                    onClick={() => setRunMode("stub")}
                  >
                    Stub board
                  </button>
                  <button
                    type="button"
                    data-active={runMode === "live" ? "1" : "0"}
                    onClick={() => setRunMode("live")}
                  >
                    Live guardrail
                  </button>
                </div>
              </div>

              <div className="quench-console__banner">
                {runMode === "stub"
                  ? "Stub mode returns deterministic receipts from the real adapter stubs. No upload or scheduling call happens here."
                  : "Live mode stays honest. Adapters validate normally, then return explicit not-implemented failures instead of fake success."}
              </div>

              <div className="quench-console__section-grid">
                <section className="quench-console__card">
                  <div className="quench-console__card-head">
                    <h3>Readiness</h3>
                    <span className={readinessVerdict ? getVerdictTone(readinessVerdict.status) : "is-bad"}>
                      {readinessVerdict ? getVerdictSummary(readinessVerdict) : "not complete"}
                    </span>
                  </div>
                  <div className="quench-console__check-grid">
                    {(Object.entries(READINESS_LABELS) as [ReleaseReadinessCheckKey, string][]).map(([key, label]) => (
                      <div
                        key={key}
                        className={`quench-console__check${readinessVerdict?.checks[key] ? " is-good" : " is-bad"}`}
                      >
                        <span>{label}</span>
                        <strong>{readinessVerdict?.checks[key] ? "ok" : "missing"}</strong>
                      </div>
                    ))}
                  </div>
                  {readinessVerdict?.reasons_detail.length ? (
                    <div className="quench-console__issue-list">
                      {readinessVerdict.reasons_detail.map((reason) => (
                        <div
                          key={`${reason.code}_${reason.platform ?? "global"}`}
                          className={`quench-console__issue ${reason.severity === "blocking" ? "is-bad" : "is-warn"}`}
                        >
                          <strong>{reason.code}</strong>
                          <span>{reason.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="quench-console__empty-note">
                      No downstream Quench constraints are blocking the selected platform mix.
                    </div>
                  )}
                </section>

                <section className="quench-console__card">
                  <div className="quench-console__card-head">
                    <h3>Packet truth</h3>
                    <span>{selectedCase.packet.asset_source}</span>
                  </div>
                  <div className="quench-console__detail-grid">
                    <div>
                      <span>Workspace</span>
                      <strong>{selectedCase.packet.workspace_id}</strong>
                    </div>
                    <div>
                      <span>Workpiece</span>
                      <strong>{selectedCase.packet.workpiece_id}</strong>
                    </div>
                    <div>
                      <span>Thumbnail asset</span>
                      <strong>{selectedCase.packet.thumbnail_asset_id ?? "none"}</strong>
                    </div>
                    <div>
                      <span>Video export</span>
                      <strong>{selectedCase.packet.video_export_id ?? "none"}</strong>
                    </div>
                    <div>
                      <span>Audio export</span>
                      <strong>{selectedCase.packet.audio_export_id ?? "none"}</strong>
                    </div>
                    <div>
                      <span>SEO transcript</span>
                      <strong>{selectedCase.packet.seo_metadata?.transcript_asset_id ?? "none"}</strong>
                    </div>
                  </div>
                  <div className="quench-console__copy-block">
                    <strong>Description</strong>
                    <p>{selectedCase.packet.description}</p>
                  </div>
                  <div className="quench-console__copy-block">
                    <div className="quench-console__card-head">
                      <h3>Metadata Assist</h3>
                      <button
                        type="button"
                        onClick={() => { void requestMetadataAssist(); }}
                        disabled={metadataAssistState === "running"}
                      >
                        {metadataAssistState === "running" ? "Generating..." : "Generate AI Draft"}
                      </button>
                    </div>
                    <p>
                      Generates a tighter title and description draft for release packaging.
                    </p>
                    {metadataAssistState === "error" && metadataAssistError ? (
                      <div className="quench-console__issue is-bad">{metadataAssistError}</div>
                    ) : null}
                    {metadataAssistDraft ? (
                      <div className="quench-console__issue-list">
                        <div className="quench-console__issue is-good">
                          <strong>Suggested title</strong>
                          <span>{metadataAssistDraft.title}</span>
                        </div>
                        <div className="quench-console__issue is-good">
                          <strong>Suggested description</strong>
                          <span>{metadataAssistDraft.description}</span>
                        </div>
                        <div className="quench-console__tag-row">
                          {metadataAssistDraft.tags.length > 0
                            ? metadataAssistDraft.tags.map((tag) => (
                              <span key={`ai-draft-tag-${tag}`} className="quench-console__tag">{tag}</span>
                            ))
                            : <span className="quench-console__empty-note">No suggested tags.</span>}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="quench-console__tag-row">
                    {selectedCase.packet.tags.length ? selectedCase.packet.tags.map((tag) => (
                      <span key={tag} className="quench-console__tag">{tag}</span>
                    )) : (
                      <span className="quench-console__empty-note">No tags attached.</span>
                    )}
                  </div>
                </section>
              </div>

              {canonicalThumbnails?<section className="quench-console__card" aria-label="Canonical thumbnail candidates">
                <div className="quench-console__card-head"><h3>Canonical thumbnail candidates</h3><span>{canonicalThumbnails.candidates.length} in active set</span></div>
                <p className="quench-console__empty-note">Tongs verifies immutable candidate identity, exact composite bytes, applied styling, readability provenance, and eligibility. Quench cannot edit these recipes.</p>
                {canonicalThumbnailStyleSources.size>1?<div className="quench-console__issue"><strong>These thumbnails use different styling approaches.</strong><span>Results may reflect branding differences as well as visual concepts.</span></div>:null}
                {thumbnailSelectionScope?<div className="quench-console__issue-list"><div className={`quench-console__issue ${thumbnailSelectionDecision?.applicability?.state==="current"?"is-good":thumbnailSelectionDecision?.applicability?.state==="requires_review"?"":"is-bad"}`}><strong>Selection authority: {thumbnailSelectionDecision?.applicability?.state?.replaceAll("_"," ")??"blocked"}</strong><span>{thumbnailSelectionDecision?.assignments?.[0]?.candidate_revision_id?`Candidate ${String(thumbnailSelectionDecision.assignments[0].candidate_revision_id)} · `:""}{thumbnailSelectionDecision?.applicability?.reason_codes?.join(", ")||String(thumbnailSelectionScope.platform)}</span></div></div>:<div className="quench-console__issue is-bad">No destination supports canonical thumbnail selection.</div>}
                {thumbnailSelectionMessage?<div role="status" className={`quench-console__issue ${thumbnailSelectionState==="saved"?"is-good":""}`}>{thumbnailSelectionMessage}</div>:null}
                {canonicalThumbnails.candidate_set?<div className="quench-console__detail-grid"><div><span>Candidate set</span><strong>{String(canonicalThumbnails.candidate_set.id)}</strong></div><div><span>Revision</span><strong>{String(canonicalThumbnails.candidate_set.revision)}</strong></div><div><span>Set hash</span><strong>{String(canonicalThumbnails.candidate_set.content_hash)}</strong></div><div><span>Active binding</span><strong>{canonicalThumbnails.active_binding_id??"none"} r{canonicalThumbnails.active_binding_revision??"?"}</strong></div></div>:<div className="quench-console__issue is-bad">No canonical thumbnail candidate set is available.</div>}
                <div className="quench-console__asset-grid">
                  {canonicalThumbnails.candidates.map((candidate)=><article key={candidate.id} className="quench-console__asset-card" aria-label={`Thumbnail candidate ${candidate.candidate_ordinal}`}>
                    <QuenchCandidatePreview workpieceId={selectedCase.packet.workpiece_id} path={candidate.asset_path} mimeType={candidate.asset_mime_type} ordinal={candidate.candidate_ordinal}/>
                    <div className="quench-console__asset-top"><strong>Candidate {candidate.candidate_ordinal}</strong><span>{candidate.style_source==="forge_standard"?"Forge standard":"Brand style"}</span><span className={isQuenchCandidateSelectable(candidate)?"is-good":"is-bad"}>{candidate.eligibility_state.replaceAll("_"," ")}</span></div>
                    <div className="quench-console__issue-list"><div className={`quench-console__issue ${candidate.authority_verified?"is-good":"is-bad"}`}><strong>{candidate.authority_verified?"provenance verified":"verification blocked"}</strong><span>{candidate.verification_code}</span></div></div>
                    <details><summary>History and technical details</summary><div className="quench-console__asset-id">Candidate revision {candidate.id}</div><div className="quench-console__asset-uri">Composite {candidate.composite_asset_id}</div><small>Recipe {candidate.recipe_id} r{candidate.recipe_revision}<br/>Recipe hash {candidate.recipe_hash}<br/>Final hash {candidate.composite_content_hash}<br/>Style provenance {String(candidate.style_provenance_hash??"legacy")}<br/>Binding context {candidate.candidate_binding_id} r{candidate.candidate_binding_revision}<br/>Readability {candidate.readability_evidence_hash}</small></details>
                    <button type="button" disabled={!thumbnailSelectionScope||!isQuenchCandidateSelectable(candidate)||thumbnailSelectionState==="saving"} onClick={()=>void selectCanonicalThumbnail(candidate.id)}>{thumbnailSelectionDecision?.decision?.decision_kind==="single_candidate"&&thumbnailSelectionDecision?.assignments?.some((assignment)=>assignment.assignment_role==="selected"&&assignment.candidate_revision_id===candidate.id)&&thumbnailSelectionDecision.applicability?.state==="current"?"Selected":"Select candidate"}</button>
                  </article>)}
                </div>
                {canonicalThumbnails.historical_candidate_sets?.length?<details><summary>Historical candidate sets ({canonicalThumbnails.historical_candidate_sets.length})</summary><p>Historical sets remain readable and reconstructable. Their candidates are not silently treated as current publication choices.</p>{canonicalThumbnails.historical_candidate_sets.map((set)=><article key={String(set.candidate_set.id)}><strong>Revision {String(set.candidate_set.revision)}</strong> · {set.candidates.length} candidates<br/><small>{String(set.candidate_set.id)} · {String(set.candidate_set.content_hash)}</small><ol>{set.candidates.map((candidate)=><li key={candidate.id}>Candidate {candidate.candidate_ordinal} · {candidate.eligibility_state.replaceAll("_"," ")} · {candidate.authority_verified?"verified":"blocked"} · {candidate.composite_content_hash}</li>)}</ol></article>)}</details>:null}
              </section>:null}

              <section className="quench-console__card">
                <div className="quench-console__card-head">
                  <h3>Resolved assets</h3>
                  <span>{selectedCase.packet.shorts.length} shorts declared</span>
                </div>
                <div className="quench-console__asset-grid">
                  {resolvedAssetCards.map(({ kind, asset }) => (
                    <div key={kind} className="quench-console__asset-card">
                      <div className="quench-console__asset-top">
                        <strong>{kind}</strong>
                        <span className={asset?.accessible ? "is-good" : "is-bad"}>
                          {getAssetStatusLabel(asset?.accessible)}
                        </span>
                      </div>
                      <div className="quench-console__asset-id">{asset?.asset_id ?? "none"}</div>
                      <div className="quench-console__asset-uri">{asset?.uri ?? "No resolved asset."}</div>
                      <div className="quench-console__asset-meta">
                        <span>{asset?.mime_type ?? "unknown mime"}</span>
                        <span>{formatDuration(asset?.duration_sec)}</span>
                      </div>
                      {kind === "audio" ? (
                        <div className="quench-console__asset-public">
                          public {resolvedAssets.audio?.public_url ?? "none"}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <div className="quench-console__asset-card">
                    <div className="quench-console__asset-top">
                      <strong>shorts</strong>
                      <span>{resolvedAssets.shorts?.length ?? 0} resolved</span>
                    </div>
                    {resolvedAssets.shorts?.length ? (
                      <div className="quench-console__short-list">
                        {resolvedAssets.shorts.map((asset) => (
                          <div key={asset.asset_id} className="quench-console__short-row">
                            <strong>{asset.asset_id}</strong>
                            <span>{formatDuration(asset.duration_sec)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="quench-console__empty-note">No short assets resolved.</div>
                    )}
                  </div>
                </div>
              </section>

              <section className="quench-console__card">
                <div className="quench-console__card-head">
                  <h3>Publish board</h3>
                  <span>{boardUpdatedAt ? `updated ${formatDate(boardUpdatedAt)}` : "waiting for selection"}</span>
                </div>
                <label className="quench-console__field">
                  <span>Executable destination</span>
                  <select value={selectedPublicationDestinationId} onChange={(event)=>{setSelectedPublicationDestinationId(event.target.value);setPublicationOperationKey(null);setPublicationOperationId(null);setPublicationCommandState("idle");setPublicationCommandMessage(null);}} disabled={publicationCommandState==="establishing"||publicationCommandState==="reserved"}>
                    <option value="">Select an exact granted destination</option>
                    {publicationDestinations.map((destination)=><option key={destination.executable_destination_id} value={destination.executable_destination_id}>{destination.display_label} · capability {destination.capability_revision}</option>)}
                  </select>
                </label>
                <button type="button" className="quench-console__button" onClick={()=>void establishAndRunPublicationStub()} disabled={!selectedPublicationDestinationId||!readinessVerdict?.ready||publicationCommandState==="establishing"||publicationCommandState==="reserved"||publicationCommandState==="recorded"}>
                  {publicationCommandState==="establishing"?"Establishing P1…":publicationCommandState==="reserved"?"Attempt A1 reserved…":"Establish publication operation"}
                </button>
                {publicationOperationId?<div className="quench-console__receipt-detail"><span>publication operation</span><strong>{publicationOperationId}</strong></div>:null}
                {publicationCommandMessage?<p className="quench-console__receipt-message">{publicationCommandMessage}</p>:null}
                {selectedPlatforms.length ? (
                  <div className="quench-console__receipt-grid">
                    {selectedPlatforms.map((platform) => {
                      const result = publishResults[platform];
                      const options = publishOptions[platform] ?? getDefaultPublishOptions(platform);
                      const message = result?.message ?? "Preparing board state.";
                      return (
                        <article key={platform} className="quench-console__receipt-card">
                          <div className="quench-console__receipt-top">
                            <strong>{PLATFORM_LABELS[platform]}</strong>
                            <span className={result?.ok ? "is-good" : "is-bad"}>
                              {result?.state ?? "pending"}
                            </span>
                          </div>
                          <div className="quench-console__receipt-meta">
                            <span>{MODE_LABELS[options.mode]}</span>
                            <span>{options.visibility ?? "default visibility"}</span>
                          </div>
                          <p className="quench-console__receipt-message">{message}</p>
                          <div className="quench-console__receipt-detail">
                            <span>external id</span>
                            <strong>{result?.receipt.external_id ?? "none"}</strong>
                          </div>
                          <div className="quench-console__receipt-detail">
                            <span>scheduled for</span>
                            <strong>{formatDate(result?.receipt.scheduled_for)}</strong>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="quench-console__empty-note">
                    Select at least one platform to render the board.
                  </div>
                )}
              </section>

              {selectedPlatforms.includes("rumble")?<section className="quench-console__card" aria-label="Rumble manual handoff">
                <div className="quench-console__card-head"><h3>Rumble manual handoff</h3><span>creator operated</span></div>
                <p className="quench-console__empty-note">Quench prepares evidence only. Choose licensing, monetization, channel, syndication, and any premiere behavior yourself on Rumble.</p>
                <label className="quench-console__field"><span>Intended category</span><input value={rumbleCategory} onChange={(event)=>setRumbleCategory(event.target.value)} /></label>
                <label className="quench-console__field"><span>Intended visibility</span><select value={publishOptions.rumble?.visibility??"private"} onChange={(event)=>updatePlatformOptions("rumble",(current)=>({...current,visibility:event.target.value as "private"|"unlisted"|"public"}))}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>
                <label className="quench-console__field"><span>Release timing</span><select value={publishOptions.rumble?.mode??"publish"} onChange={(event)=>updatePlatformOptions("rumble",(current)=>({...current,mode:event.target.value as ReleaseMode}))}><option value="publish">Publish when uploaded</option><option value="schedule">Intended schedule</option></select></label>
                {publishOptions.rumble?.mode==="schedule"?<label className="quench-console__field"><span>Intended schedule</span><input type="datetime-local" value={(publishOptions.rumble.scheduled_for??"").slice(0,16)} onChange={(event)=>updatePlatformOptions("rumble",(current)=>({...current,scheduled_for:event.target.value?new Date(event.target.value).toISOString():undefined}))}/></label>:null}
                <div className="quench-console__asset-grid">{canonicalThumbnails?.candidates.filter(isQuenchCandidateSelectable).map((candidate)=><button type="button" key={`rumble-${candidate.id}`} onClick={()=>void selectRumbleThumbnail(candidate.id)}>{rumbleDecision?.assignments?.some((assignment)=>assignment.candidate_revision_id===candidate.id)?"Rumble thumbnail selected":`Use candidate ${candidate.candidate_ordinal} for Rumble`}</button>)}</div>
                <button type="button" onClick={()=>void prepareRumbleManualHandoff()} disabled={!rumbleScope||!rumbleDecision?.current_decision_id}>Prepare manual handoff</button>
                {manualHandoffId?<div className="quench-console__adapter-controls">
                  <button type="button" disabled={!resolvedAssets.video?.accessible||!resolvedAssets.video.uri} onClick={()=>resolvedAssets.video?.uri?void downloadWorkpieceFile(openAuthority!.workpiece_id,resolvedAssets.video.uri,"rumble-video"):undefined}>Download final video</button>
                  {rumbleCandidate?.asset_path?<button type="button" onClick={()=>void downloadWorkpieceFile(openAuthority!.workpiece_id,rumbleCandidate.asset_path!,"rumble-thumbnail")}>Download thumbnail</button>:null}
                  <button type="button" onClick={()=>void navigator.clipboard.writeText(publishOptions.rumble?.title_override??selectedCase.packet.title)}>Copy title</button>
                  <button type="button" onClick={()=>void navigator.clipboard.writeText(publishOptions.rumble?.description_override??selectedCase.packet.description)}>Copy description</button>
                  <button type="button" onClick={()=>void navigator.clipboard.writeText(selectedCase.packet.tags.join(", "))}>Copy tags</button>
                  <button type="button" onClick={()=>void navigator.clipboard.writeText(rumbleCategory)}>Copy category</button>
                  <button type="button" onClick={()=>void navigator.clipboard.writeText(publishOptions.rumble?.visibility??"private")}>Copy visibility</button>
                  {publishOptions.rumble?.scheduled_for?<button type="button" onClick={()=>void navigator.clipboard.writeText(publishOptions.rumble!.scheduled_for!)}>Copy intended schedule</button>:null}
                  <a href={RUMBLE_UPLOAD_URL} target="_blank" rel="noreferrer">Open official Rumble upload page</a>
                  <label><span>Resulting Rumble URL</span><input type="url" value={rumbleResultUrl} onChange={(event)=>setRumbleResultUrl(event.target.value)} placeholder="https://rumble.com/v…" /></label>
                  <button type="button" onClick={()=>void confirmRumbleManualHandoff()} disabled={!rumbleResultUrl.trim()}>Record creator confirmation</button>
                </div>:null}
                {manualHandoffMessage?<p role="status" className="quench-console__receipt-message">{manualHandoffMessage}</p>:null}
              </section>:null}
            </>
          ) : (
            <div className="quench-console__empty-note">No release packets are available.</div>
          )}
        </div>

        <aside className="quench-console__panel quench-console__panel--right">
          <div className="quench-console__panel-head">
            <h2>Adapters</h2>
            <span>contract-driven cards</span>
          </div>
          <section className="quench-console__card" aria-label="Thumbnail launch experiment">
            <div className="quench-console__card-head"><h3>Thumbnail experiment</h3><span>Quench authority</span></div>
            <p className="quench-console__empty-note">Choose exact Tongs-verified candidates. This commits provider-neutral intent; it does not activate thumbnail rotation or write Ledger evidence.</p>
            <div className={`quench-console__issue ${experimentCapability.planning_supported?"is-good":"is-bad"}`}><strong>{experimentCapability.planning_supported?"Candidate experiment planning supported":"Experiment planning unsupported"}</strong><span>{experimentCapability.planning_supported?(experimentCapability.rotation_supported?"Adapter capability permits future execution, but no provider acknowledgement exists.":"Automatic thumbnail rotation is unsupported and not active."):experimentCapability.reason?.replaceAll("_"," ")}</span></div>
            {canonicalThumbnails?.candidates.map((candidate)=><div key={`experiment-${candidate.id}`} className="quench-console__asset-top"><span>Candidate {candidate.candidate_ordinal}</span><label><input type="radio" name="experiment-control" checked={experimentControlId===candidate.id} disabled={!experimentCapability.planning_supported||!isQuenchCandidateSelectable(candidate)} onChange={()=>{setExperimentControlId(candidate.id);setExperimentVariantIds((current)=>current.filter((id)=>id!==candidate.id));}}/> Control</label><label><input type="checkbox" checked={experimentVariantIds.includes(candidate.id)} disabled={!experimentCapability.planning_supported||!isQuenchCandidateSelectable(candidate)||experimentControlId===candidate.id} onChange={(event)=>setExperimentVariantIds((current)=>event.target.checked?[...current,candidate.id]:current.filter((id)=>id!==candidate.id))}/> Variant</label></div>)}
            <button type="button" disabled={experimentState === "saving" || !experimentCapability.planning_supported || !experimentControlId || experimentVariantIds.length<1} onClick={() => void mutateThumbnailExperiment(false)}>{experimentState === "saving" ? "Saving experiment…" : "Commit experiment plan"}</button>
            {thumbnailSelectionDecision?.decision?.decision_kind==="experiment_intent"&&thumbnailSelectionDecision.decision.intent_state==="experiment_planned"?<button type="button" disabled={experimentState==="saving"} onClick={()=>void mutateThumbnailExperiment(true)}>Cancel experiment plan</button>:null}
            <p className="quench-console__empty-note">Cancelling creates a new current zero-assignment decision. It does not restore the previously selected thumbnail automatically.</p>
            {thumbnailSelectionDecision?.recent_history?.length?<details><summary>Canonical decision history ({thumbnailSelectionDecision.recent_history.length})</summary><ol>{thumbnailSelectionDecision.recent_history.map((decision)=><li key={String(decision.id)}>Revision {String(decision.revision)} · {String(decision.decision_kind).replaceAll("_"," ")} · {String(decision.intent_state).replaceAll("_"," ")} · {Array.isArray(decision.assignments)?decision.assignments.length:0} assignments</li>)}</ol></details>:null}
            {experimentMessage ? <p className={experimentState === "error" ? "quench-console__issue is-bad" : "quench-console__empty-note"}>{experimentMessage}</p> : null}
          </section>
          <div className="quench-console__adapter-list">
            <article className={`quench-console__adapter${selectedPlatforms.includes("rumble")?" is-selected":""}`}>
              <div className="quench-console__adapter-top"><div><strong>Rumble</strong><div className="quench-console__adapter-subtitle">manual video handoff</div></div><button type="button" onClick={()=>togglePlatform("rumble")}>{selectedPlatforms.includes("rumble")?"remove":"add"}</button></div>
              <div className="quench-console__capability-row"><span data-on="1">video</span><span data-on="0">API upload</span><span data-on="1">manual schedule</span><span data-on="0">provider receipt</span></div>
            </article>
            {QUENCH_ADAPTERS.map((adapter) => {
              const platform = adapter.platform;
              const capability = capabilities[platform];
              const validation = validations[platform];
              const selected = selectedPlatforms.includes(platform);
              const options = publishOptions[platform] ?? getDefaultPublishOptions(platform);

              return (
                <article key={platform} className={`quench-console__adapter${selected ? " is-selected" : ""}`}>
                  <div className="quench-console__adapter-top">
                    <div>
                      <strong>{PLATFORM_LABELS[platform]}</strong>
                      <div className="quench-console__adapter-subtitle">{platform}</div>
                    </div>
                    <button type="button" onClick={() => togglePlatform(platform)}>
                      {selected ? "remove" : "add"}
                    </button>
                  </div>

                  <div className="quench-console__capability-row">
                    <span data-on={capability?.supports_video ? "1" : "0"}>video</span>
                    <span data-on={capability?.supports_audio_only ? "1" : "0"}>audio</span>
                    <span data-on={capability?.supports_schedule ? "1" : "0"}>schedule</span>
                    <span data-on={capability?.supports_premiere ? "1" : "0"}>premiere</span>
                    <span data-on={capability?.supports_shorts ? "1" : "0"}>shorts</span>
                  </div>

                  {selected ? (
                    <div className="quench-console__adapter-controls">
                      <label>
                        <span>Mode</span>
                        <select
                          value={options.mode}
                          onChange={(event) => {
                            const value = event.target.value as ReleaseMode;
                            updatePlatformOptions(platform, (current) => ({ ...current, mode: value }));
                          }}
                        >
                          <option value="publish">Publish now</option>
                          <option value="schedule">Schedule</option>
                          <option value="premiere">Premiere</option>
                        </select>
                      </label>

                      {platform !== "podcast_host" ? (
                        <label>
                          <span>Visibility</span>
                          <select
                            value={options.visibility ?? "private"}
                            onChange={(event) => {
                              const value = event.target.value as NonNullable<PlatformPublishOptions["visibility"]>;
                              updatePlatformOptions(platform, (current) => ({ ...current, visibility: value }));
                            }}
                          >
                            <option value="private">Private</option>
                            <option value="unlisted">Unlisted</option>
                            <option value="public">Public</option>
                          </select>
                        </label>
                      ) : null}

                      {options.mode !== "publish" ? (
                        <label>
                          <span>Scheduled for</span>
                          <input
                            type="datetime-local"
                            value={(options.scheduled_for ?? "2026-03-15T14:00:00.000Z").slice(0, 16)}
                            onChange={(event) => {
                              const value = event.target.value ? new Date(event.target.value).toISOString() : undefined;
                              updatePlatformOptions(platform, (current) => ({ ...current, scheduled_for: value }));
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                  ) : (
                    <div className="quench-console__empty-note">
                      Not selected for the current board run.
                    </div>
                  )}

                  <div className="quench-console__validation-block">
                    <div className="quench-console__validation-top">
                      <span>Validation</span>
                      <strong className={validation?.ok ? "is-good" : "is-bad"}>
                        {validation?.ok ? "clean" : `${validation?.errors.length ?? 0} errors`}
                      </strong>
                    </div>
                    {validation?.warnings.length ? (
                      <div className="quench-console__issue-list">
                        {validation.warnings.map((issue) => (
                          <div key={`${issue.code}_${issue.field ?? "warn"}`} className="quench-console__issue is-warn">
                            <strong>{issue.code}</strong>
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {validation?.errors.length ? (
                      <div className="quench-console__issue-list">
                        {validation.errors.map((issue) => (
                          <div key={`${issue.code}_${issue.field ?? "error"}`} className="quench-console__issue is-bad">
                            <strong>{issue.code}</strong>
                            <span>{issue.message}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="quench-console__empty-note">
                        Adapter validation is clear for the current packet and options.
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </aside>
      </div>
    </section>
  );
}
