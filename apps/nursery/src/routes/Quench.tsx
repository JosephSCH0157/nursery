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
  type ReleasePacket,
  type ReleaseMode,
  type ReleaseReadinessCheckKey,
  type ResolvedAsset,
  type ResolvedReleaseAssets,
  deriveReleasePacketReadinessVerdict,
  canExecuteQuenchPublish,
  RssAdapter,
  StaticAssetResolver,
  YouTubeAdapter,
  listQuenchMockReleaseCases,
  resolveReleaseAssets,
  isQuenchCanonicalReleaseProjection,
  type QuenchCanonicalReleaseProjection,
  isQuenchCandidateSelectable,
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
import { appendQuenchThumbnailExperiment } from "../lib/thumbnail-ledger";

const QUENCH_ADAPTERS = [new YouTubeAdapter(), new RssAdapter()];

const PLATFORM_LABELS: Record<QuenchPlatform, string> = {
  youtube: "YouTube",
  rumble: "Rumble",
  spotify: "Spotify",
  rss: "RSS",
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
  rss_public_audio: "RSS public audio",
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

type QuenchPreparedReleaseResolvedHandoff = QuenchPreparedReleaseHandoff & {
  workpieceId: string;
  packagePath: string;
};
type QuenchReleaseConsoleCase = QuenchMockReleaseCase & { authority: "canonical"|"fixture"; canonical_projection?: QuenchCanonicalReleaseProjection };

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

function buildPreparedReleaseCase(args: {
  shellWorkspaceId: string | null;
  pkg: HammerPreparedReleasePackage;
  packagePath: string;
}): QuenchMockReleaseCase {
  const workspaceId = args.pkg.workspaceId ?? args.shellWorkspaceId ?? "";
  const workpieceId = args.pkg.workpieceId;
  const identityFingerprint = buildPreparedPackageIdentityFingerprint(args.pkg);
  const caseId = `handoff_prepared_${workpieceId}_${identityFingerprint.slice(-8)}`;
  const audioExportId = args.pkg.media.status === "ready"
    ? (args.pkg.media.sourceMediaId ?? `prepared_audio_${identityFingerprint.slice(-8)}`)
    : null;
  const audioUri = args.pkg.media.sourceMediaId
    ? `workpiece-media://${workpieceId}/${args.pkg.media.sourceMediaId}`
    : `workpiece://${workpieceId}/${args.packagePath}`;
  const packet: ReleasePacket = {
    release_packet_id: `release_packet_${caseId}`,
    workspace_id: workspaceId,
    workpiece_id: workpieceId,
    episode_id: workpieceId,
    title: `Hammer prepared package ${workpieceId.slice(0, 8)}`,
    description: `Prepared at ${args.pkg.preparedAt} with package status ${args.pkg.overallStatus}.`,
    tags: ["hammer-prepared", "quench-handoff"],
    thumbnail_asset_id: null,
    video_export_id: null,
    audio_export_id: audioExportId,
    shorts: [],
    asset_source: "cloud",
    rss_ready: args.pkg.subtitles.srt.status === "ready" && args.pkg.media.status === "ready",
    platform_overrides: {},
    seo_metadata: {
      transcript_asset_id: args.pkg.transcript.revisionId,
      canonical_slug: `prepared-${workpieceId.slice(0, 8)}`,
      keywords: ["prepared package", "hammer handoff"],
    },
  };

  return {
    case_id: caseId,
    label: "Hammer Prepared Handoff",
    summary: `Loaded from ${args.packagePath} (${args.pkg.overallStatus})`,
    packet,
    resolved_assets: {
      ...(audioExportId
        ? {
          audio: {
            asset_id: audioExportId,
            kind: "audio",
            source: "cloud",
            uri: audioUri,
            mime_type: "audio/mpeg",
            duration_sec: typeof args.pkg.media.durationMs === "number"
              ? Math.max(0, Math.round(args.pkg.media.durationMs / 1000))
              : undefined,
            accessible: true,
          },
        }
        : {}),
      shorts: [],
    },
    default_platforms: [],
    default_publish_options: {},
  };
}

function buildCanonicalReleaseCase(projection:QuenchCanonicalReleaseProjection):QuenchReleaseConsoleCase{
  const manifest=projection.hammer.manifest;const episode=projection.metadata.episode;const seo=readJsonObject(episode.seo);const titles=Array.isArray(seo?.titles)?seo.titles.map(readJsonObject).filter(Boolean):[];const primary=titles.find((entry)=>entry?.is_primary===true)??titles[0];
  const title=readString(primary?.text)??readString(manifest.episode_title)??`Release ${projection.workpiece_id.slice(0,8)}`;const description=readString(seo?.description_long)??readString(seo?.description_short)??"Canonical release metadata is incomplete.";const tags=Array.isArray(seo?.tags)?seo.tags.map(readString).filter((value):value is string=>Boolean(value)):[];
  const audioId=manifest.audio.media_id;return{authority:"canonical",canonical_projection:projection,case_id:`canonical:${projection.workpiece_id}:${projection.hammer.manifest_snapshot_id}`,label:"Canonical Hammer Release",summary:`Tongs-verified manifest ${projection.hammer.manifest_content_hash.slice(0,12)}…`,packet:{release_packet_id:projection.hammer.manifest_snapshot_id,workspace_id:projection.workspace_id,workpiece_id:projection.workpiece_id,episode_id:projection.workpiece_id,title,description,tags,thumbnail_asset_id:null,video_export_id:null,audio_export_id:audioId,shorts:[],asset_source:"cloud",rss_ready:projection.hammer.readiness.ready_for_quench===true,platform_overrides:{},seo_metadata:null},resolved_assets:{audio:audioId?{asset_id:audioId,kind:"audio",source:"cloud",uri:manifest.audio.workpiece_path??manifest.audio.local_relpath??`workpiece-media://${projection.workpiece_id}/${audioId}`,mime_type:manifest.audio.mime_type??undefined,duration_sec:manifest.duration_seconds??undefined,accessible:true}:null,shorts:[]},default_platforms:[],default_publish_options:{}};
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
  if (platform === "rss") {
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
  const [src,setSrc]=useState<string|null>(null);useEffect(()=>{let cancelled=false;if(!path){setSrc(null);return;}void(async()=>{try{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(path)}&encoding=base64`,{method:"GET"});const payload=await response.json() as {data?:{bytes_base64?:string;content_type?:string}};if(!cancelled&&response.ok&&payload.data?.bytes_base64)setSrc(`data:${payload.data.content_type??mimeType??"image/png"};base64,${payload.data.bytes_base64}`);}catch{if(!cancelled)setSrc(null);}})();return()=>{cancelled=true;};},[mimeType,path,workpieceId]);
  return src?<img src={src} alt={`Canonical thumbnail candidate ${ordinal}`} style={{width:"100%",aspectRatio:"16 / 9",objectFit:"cover",borderRadius:"0.4rem"}}/>:<div className="quench-console__empty-note">Verified preview unavailable.</div>;
}

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
  const [metadataAssistState, setMetadataAssistState] = useState<"idle" | "running" | "ready" | "error">("idle");
  const [metadataAssistError, setMetadataAssistError] = useState<string | null>(null);
  const [metadataAssistDraft, setMetadataAssistDraft] = useState<{
    title: string;
    description: string;
    tags: string[];
  } | null>(null);
  const [experimentHypothesis, setExperimentHypothesis] = useState("");
  const [experimentSnapshots, setExperimentSnapshots] = useState("");
  const [experimentState, setExperimentState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [experimentMessage, setExperimentMessage] = useState<string | null>(null);
  const [thumbnailSelectionState,setThumbnailSelectionState]=useState<"idle"|"saving"|"saved"|"conflict"|"error">("idle");
  const [thumbnailSelectionMessage,setThumbnailSelectionMessage]=useState<string|null>(null);

  useEffect(() => {
    let cancelled = false;
    const handoff = parsePreparedReleaseHandoff(location.search);
    if (!handoff) {
      if(routeCtx.workpieceId&&shell.workspaceId){
        queueMicrotask(()=>setPreparedHandoffState({status:"loading",handoff:null,message:null,warning:null,loadedFingerprint:null,loadedPreparedAt:null}));
        void (async()=>{try{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(routeCtx.workpieceId!)}/quench/release-projection`,{method:"POST",json:{workspace_id:shell.workspaceId},timeoutMs:45_000});const payload=await readResponseJson(response);const root=readJsonObject(payload);const projection=root?.ok===true?root.data:null;if(!response.ok||!isQuenchCanonicalReleaseProjection(projection))throw new Error(readString(readJsonObject(root?.error)?.message)??"Canonical Quench release authority is unavailable.");if(cancelled)return;setHandoffPreparedCase(buildCanonicalReleaseCase(projection));setPreparedHandoffState({status:"ready",handoff:null,message:null,warning:null,loadedFingerprint:projection.hammer.manifest_content_hash,loadedPreparedAt:projection.hammer.manifest.generated_at});}catch(error){if(cancelled)return;setHandoffPreparedCase(null);setPreparedHandoffState({status:"error",handoff:null,message:error instanceof Error?error.message:"Canonical Quench release authority is unavailable.",warning:null,loadedFingerprint:null,loadedPreparedAt:null});}})();
        return()=>{cancelled=true;};
      }
      queueMicrotask(() => {
        setHandoffPreparedCase(null);
        setPreparedHandoffState({
          status: "idle",
          handoff: null,
          message: null,
          warning: null,
          loadedFingerprint: null,
          loadedPreparedAt: null,
        });
      });
      return () => {
        cancelled = true;
      };
    }

    if (!handoff.workpieceId || !handoff.packagePath) {
      queueMicrotask(() => {
        setHandoffPreparedCase(null);
        setPreparedHandoffState({
          status: "error",
          handoff,
          message: "This release handoff is incomplete. Reopen Prepare Release from Editing.",
          warning: null,
          loadedFingerprint: null,
          loadedPreparedAt: null,
        });
      });
      return () => {
        cancelled = true;
      };
    }
    const activeHandoff: QuenchPreparedReleaseResolvedHandoff = {
      ...handoff,
      workpieceId: handoff.workpieceId,
      packagePath: handoff.packagePath,
    };

    queueMicrotask(() => {
      setPreparedHandoffState({
        status: "loading",
        handoff: activeHandoff,
        message: null,
        warning: null,
        loadedFingerprint: null,
        loadedPreparedAt: null,
      });
    });

    async function loadPreparedHandoff(): Promise<void> {
      try {
        const response = await tongsFetch(
          `/tongs/workpieces/${encodeURIComponent(activeHandoff.workpieceId)}/read-file?path=${encodeURIComponent(activeHandoff.packagePath)}`,
          {
            method: "GET",
            timeoutMs: 45_000,
          },
        );
        const payload = await readResponseJson(response);
        if (!response.ok) {
          const root = readJsonObject(payload);
          const errorMessage = readString(readJsonObject(root?.error)?.message)
            ?? "Quench could not load this release handoff from Tongs.";
          if (cancelled) return;
          setHandoffPreparedCase(null);
          setPreparedHandoffState({
            status: "error",
            handoff: activeHandoff,
            message: errorMessage,
            warning: null,
            loadedFingerprint: null,
            loadedPreparedAt: null,
          });
          return;
        }

        const root = readJsonObject(payload);
        if (root?.exists !== true) {
          if (cancelled) return;
          setHandoffPreparedCase(null);
          setPreparedHandoffState({
            status: "error",
            handoff: activeHandoff,
            message: "The prepared release for this episode could not be found. Reopen Prepare Release from Editing.",
            warning: null,
            loadedFingerprint: null,
            loadedPreparedAt: null,
          });
          return;
        }

        const pkg = normalizePreparedReleasePackage(root?.data);
        if (!pkg) {
          if (cancelled) return;
          setHandoffPreparedCase(null);
          setPreparedHandoffState({
            status: "error",
            handoff: activeHandoff,
            message: "This release handoff is incompatible with the current Quench flow.",
            warning: null,
            loadedFingerprint: null,
            loadedPreparedAt: null,
          });
          return;
        }

        if (pkg.workpieceId !== activeHandoff.workpieceId) {
          if (cancelled) return;
          setHandoffPreparedCase(null);
          setPreparedHandoffState({
            status: "error",
            handoff: activeHandoff,
            message: "This prepared release does not match the episode in the current workflow.",
            warning: null,
            loadedFingerprint: null,
            loadedPreparedAt: pkg.preparedAt,
          });
          return;
        }

        if (activeHandoff.expectedVersion != null && pkg.version !== activeHandoff.expectedVersion) {
          if (cancelled) return;
          setHandoffPreparedCase(null);
          setPreparedHandoffState({
            status: "error",
            handoff: activeHandoff,
            message: "This release handoff is out of date. Reopen Prepare Release from Editing.",
            warning: null,
            loadedFingerprint: null,
            loadedPreparedAt: pkg.preparedAt,
          });
          return;
        }

        const loadedFingerprint = buildPreparedPackageIdentityFingerprint(pkg);
        const warning = activeHandoff.expectedFingerprint && activeHandoff.expectedFingerprint !== loadedFingerprint
          ? "Release prep changed after Editing created this handoff. Review the latest package before publishing."
          : activeHandoff.workspaceId && pkg.workspaceId && activeHandoff.workspaceId !== pkg.workspaceId
            ? "This prepared release belongs to a different workspace than the current route."
            : null;
        const canonicalWorkspaceId=pkg.workspaceId??activeHandoff.workspaceId??shell.workspaceId;
        if(!canonicalWorkspaceId)throw new Error("Canonical workspace context is required for Quench release resolution.");
        const projectionResponse=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(activeHandoff.workpieceId)}/quench/release-projection`,{method:"POST",json:{workspace_id:canonicalWorkspaceId},timeoutMs:45_000});
        const projectionPayload=await readResponseJson(projectionResponse);const projectionRoot=readJsonObject(projectionPayload);const projection=projectionRoot?.ok===true?projectionRoot.data:null;
        if(!projectionResponse.ok||!isQuenchCanonicalReleaseProjection(projection)){
          const code=readString(readJsonObject(projectionRoot?.error)?.code);throw new Error(code?`Canonical Quench release resolution failed: ${code.replaceAll("_"," ")}.`:"Canonical Quench release authority is unavailable.");
        }
        const preparedCase = buildCanonicalReleaseCase(projection);
        if (cancelled) return;
        setHandoffPreparedCase(preparedCase);
        setPreparedHandoffState({
          status: "ready",
          handoff: activeHandoff,
          message: null,
          warning,
          loadedFingerprint,
          loadedPreparedAt: pkg.preparedAt,
        });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error && error.message.trim()
          ? error.message
          : "Quench could not load this release handoff.";
        setHandoffPreparedCase(null);
        setPreparedHandoffState({
          status: "error",
          handoff: activeHandoff,
          message,
          warning: null,
          loadedFingerprint: null,
          loadedPreparedAt: null,
        });
      }
    }

    void loadPreparedHandoff();
    return () => {
      cancelled = true;
    };
  }, [location.search, routeCtx.workpieceId, shell.workspaceId]);

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
  const canonicalProjection=selectedCase?.canonical_projection??null;
  const thumbnailSelectionScope=canonicalProjection?.destination_capabilities.find((scope)=>scope.platform==="youtube"&&scope.state==="active")??canonicalProjection?.destination_capabilities.find((scope)=>scope.state==="active")??null;
  const thumbnailSelectionDecision=thumbnailSelectionScope?canonicalProjection?.current_decisions.find((decision)=>decision.destination_scope_id===thumbnailSelectionScope.id)??null:null;
  const selectCanonicalThumbnail=useCallback(async(candidateId:string)=>{if(!canonicalProjection||!thumbnailSelectionScope)return;setThumbnailSelectionState("saving");setThumbnailSelectionMessage(null);try{const response=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(canonicalProjection.workpiece_id)}/quench/select-candidate`,{method:"POST",json:{workspace_id:canonicalProjection.workspace_id,destination_scope_id:thumbnailSelectionScope.id,candidate_revision_id:candidateId,expected_decision_id:thumbnailSelectionDecision?.current_decision_id??null,expected_revision:thumbnailSelectionDecision?.current_revision??0,operation_id:crypto.randomUUID()},timeoutMs:45_000});const payload=await readResponseJson(response);const root=readJsonObject(payload);const result=readJsonObject(root?.data);const disposition=readString(result?.disposition);if(!response.ok)throw new Error(readString(readJsonObject(root?.error)?.message)??"Selection failed.");if(disposition==="revision_conflict"){setThumbnailSelectionState("conflict");setThumbnailSelectionMessage("The canonical decision advanced. Reloaded the latest Tongs authority; review before retrying.");}else if(!["committed","replayed","no_change"].includes(disposition??"")){throw new Error(`Selection was not committed: ${(disposition??"blocked").replaceAll("_"," ")}.`);}else{setThumbnailSelectionState("saved");setThumbnailSelectionMessage(disposition==="no_change"?"That candidate is already the canonical selection.":disposition==="replayed"?"The original canonical selection was restored from its operation receipt.":"Canonical thumbnail selection committed.");}const refresh=await tongsFetch(`/tongs/workpieces/${encodeURIComponent(canonicalProjection.workpiece_id)}/quench/release-projection`,{method:"POST",json:{workspace_id:canonicalProjection.workspace_id},timeoutMs:45_000});const refreshPayload=await readResponseJson(refresh);const refreshRoot=readJsonObject(refreshPayload);if(refresh.ok&&isQuenchCanonicalReleaseProjection(refreshRoot?.data))setHandoffPreparedCase(buildCanonicalReleaseCase(refreshRoot.data));}catch(error){setThumbnailSelectionState("error");setThumbnailSelectionMessage(error instanceof Error?error.message:"Selection failed.");}},[canonicalProjection,thumbnailSelectionDecision,thumbnailSelectionScope]);
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

  useEffect(() => {
    let cancelled = false;

    async function loadPublishBoard() {
      if (!selectedCase || selectedPlatforms.length === 0 || !readinessVerdict || !canExecuteQuenchPublish(readinessVerdict)) {
        setPublishResults({});
        setBoardUpdatedAt(null);
        return;
      }

      const context = buildPublishContext(runMode, resolvedAssets, readinessVerdict);
      const nextEntries = await Promise.all(
        QUENCH_ADAPTERS
          .filter((adapter) => selectedPlatforms.includes(adapter.platform))
          .map(async (adapter) => {
            const options = publishOptions[adapter.platform] ?? getDefaultPublishOptions(adapter.platform);
            const result = await adapter.publish(selectedCase.packet, options, context);
            return [adapter.platform, result] as const;
          }),
      );

      if (cancelled) return;
      setPublishResults(Object.fromEntries(nextEntries) as Partial<Record<QuenchPlatform, AdapterPublishResult>>);
      setBoardUpdatedAt(new Date().toISOString());
    }

    void loadPublishBoard();
    return () => {
      cancelled = true;
    };
  }, [publishOptions, readinessVerdict?.ready, readinessVerdict?.status, resolvedAssets, runMode, selectedCase, selectedPlatforms]);

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

  async function createThumbnailExperiment() {
    if (!shell.workspaceId || !selectedCase) return;
    const snapshots = experimentSnapshots.split(/[,\n]/).map((entry) => entry.trim()).filter((entry) => /^[a-f0-9]{64}$/.test(entry));
    setExperimentState("saving"); setExperimentMessage(null);
    try {
      const experiment = await appendQuenchThumbnailExperiment({ workspaceId: shell.workspaceId,
        publicationId: `${selectedCase.packet.episode_id}:${selectedPlatforms[0] ?? "unassigned"}`,
        hypothesis: experimentHypothesis, launchSnapshotHashes: snapshots, primaryMetric: "ctr",
        guardrails: ["retention_30_seconds", "average_percentage_viewed"], windowKind: "first_72h",
        stoppingConditions: ["72-hour window is mature", "retention guardrails are available"] });
      setExperimentState("saved"); setExperimentMessage(`Experiment ${experiment.identity.slice(0, 8)} saved as immutable publication history.`);
    } catch (error) { setExperimentState("error"); setExperimentMessage(error instanceof Error ? error.message : "Unable to save experiment."); }
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
        <div className="quench-console__issue is-warn">{preparedHandoffState.warning}</div>
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
                <p className="quench-console__empty-note">Tongs verifies immutable candidate identity, exact composite bytes, branding, readability provenance, and current binding-relative eligibility. Quench cannot edit these recipes.</p>
                {thumbnailSelectionScope?<div className="quench-console__issue-list"><div className={`quench-console__issue ${thumbnailSelectionDecision?.applicability?.state==="current"?"is-good":thumbnailSelectionDecision?.applicability?.state==="requires_review"?"":"is-bad"}`}><strong>Selection authority: {thumbnailSelectionDecision?.applicability?.state?.replaceAll("_"," ")??"blocked"}</strong><span>{thumbnailSelectionDecision?.assignments?.[0]?.candidate_revision_id?`Candidate ${String(thumbnailSelectionDecision.assignments[0].candidate_revision_id)} · `:""}{thumbnailSelectionDecision?.applicability?.reason_codes?.join(", ")||String(thumbnailSelectionScope.platform)}</span></div></div>:<div className="quench-console__issue is-bad">No destination supports canonical thumbnail selection.</div>}
                {thumbnailSelectionMessage?<div role="status" className={`quench-console__issue ${thumbnailSelectionState==="saved"?"is-good":""}`}>{thumbnailSelectionMessage}</div>:null}
                {canonicalThumbnails.candidate_set?<div className="quench-console__detail-grid"><div><span>Candidate set</span><strong>{String(canonicalThumbnails.candidate_set.id)}</strong></div><div><span>Revision</span><strong>{String(canonicalThumbnails.candidate_set.revision)}</strong></div><div><span>Set hash</span><strong>{String(canonicalThumbnails.candidate_set.content_hash)}</strong></div><div><span>Active binding</span><strong>{canonicalThumbnails.active_binding_id??"none"} r{canonicalThumbnails.active_binding_revision??"?"}</strong></div></div>:<div className="quench-console__issue is-bad">No canonical thumbnail candidate set is available.</div>}
                <div className="quench-console__asset-grid">
                  {canonicalThumbnails.candidates.map((candidate)=><article key={candidate.id} className="quench-console__asset-card" aria-label={`Thumbnail candidate ${candidate.candidate_ordinal}`}>
                    <QuenchCandidatePreview workpieceId={selectedCase.packet.workpiece_id} path={candidate.asset_path} mimeType={candidate.asset_mime_type} ordinal={candidate.candidate_ordinal}/>
                    <div className="quench-console__asset-top"><strong>Candidate {candidate.candidate_ordinal}</strong><span className={isQuenchCandidateSelectable(candidate)?"is-good":"is-bad"}>{candidate.eligibility_state.replaceAll("_"," ")}</span></div>
                    <div className="quench-console__issue-list"><div className={`quench-console__issue ${candidate.authority_verified?"is-good":"is-bad"}`}><strong>{candidate.authority_verified?"provenance verified":"verification blocked"}</strong><span>{candidate.verification_code}</span></div></div>
                    <div className="quench-console__asset-id">Candidate revision {candidate.id}</div><div className="quench-console__asset-uri">Composite {candidate.composite_asset_id}</div>
                    <small>Recipe {candidate.recipe_id} r{candidate.recipe_revision}<br/>Recipe hash {candidate.recipe_hash}<br/>Final hash {candidate.composite_content_hash}<br/>Binding {candidate.candidate_binding_id} r{candidate.candidate_binding_revision}<br/>Readability {candidate.readability_evidence_hash}</small>
                    <button type="button" disabled={!thumbnailSelectionScope||!isQuenchCandidateSelectable(candidate)||thumbnailSelectionState==="saving"} onClick={()=>void selectCanonicalThumbnail(candidate.id)}>{thumbnailSelectionDecision?.assignments?.some((assignment)=>assignment.candidate_revision_id===candidate.id)&&thumbnailSelectionDecision.applicability?.state==="current"?"Selected":"Select candidate"}</button>
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
            <p className="quench-console__empty-note">Experiments reference immutable launch snapshot hashes. Ledger evaluates evidence but cannot publish a winner.</p>
            <label><span>Hypothesis</span><textarea value={experimentHypothesis} onChange={(event) => setExperimentHypothesis(event.target.value)} placeholder="State why these published treatments are being compared." /></label>
            <label><span>Immutable launch snapshot hashes</span><textarea value={experimentSnapshots} onChange={(event) => setExperimentSnapshots(event.target.value)} placeholder="One 64-character hash per line (minimum two)" /></label>
            <button type="button" disabled={experimentState === "saving" || !experimentHypothesis.trim()} onClick={() => void createThumbnailExperiment()}>{experimentState === "saving" ? "Saving experiment…" : "Create 72-hour experiment"}</button>
            {experimentMessage ? <p className={experimentState === "error" ? "quench-console__issue is-bad" : "quench-console__empty-note"}>{experimentMessage}</p> : null}
          </section>
          <div className="quench-console__adapter-list">
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

                      {platform !== "rss" ? (
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
