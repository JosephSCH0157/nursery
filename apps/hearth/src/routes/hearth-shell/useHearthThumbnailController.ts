import { useCallback, useEffect, useRef, useState } from "react";
import { useThumbnailWorkspace } from "../../hooks/visuals/useThumbnailWorkspace";
import { useThumbnailPreviewLoader } from "../../hooks/visuals/useThumbnailPreviewLoader";
import { useThumbnailConceptActions } from "../../hooks/visuals/useThumbnailConceptActions";
import { useThumbnailGenerationActions } from "../../hooks/visuals/useThumbnailGenerationActions";
import {
  readCanonicalThumbnailWorkspaceV3,
  readThumbnailCandidateAuthorityProjection,
} from "../../lib/hearth-thumbnail-v3-api";
import { buildHearthThumbnailPanelProps } from "../../views/modes/buildHearthThumbnailPanelProps";
import type { HearthThumbnailController } from "./hearth-thumbnail-contracts";
import { EMPTY_CANONICAL_THUMBNAIL_PROGRESS, isThumbnailProgressAtLeastAsCurrent } from "./buildHearthThumbnailViewModel";
import { resolveHearthThumbnailCanonicalPreviewPath } from "./hearth-thumbnail-preview";
import {
  areEpisodeThumbnailTitleStylesEqual,
  normalizeEpisodeThumbnailTitleStyle,
} from "../../lib/hearth-title-fonts";
import {
  loadWorkspaceThumbnailBrandLogoPreview,
  listWorkspaceThumbnailBrandTemplates,
  seedWorkspaceThumbnailBrandTemplates,
} from "../../lib/hearth-thumbnail-brand-templates";
import type {
  EpisodePackageV2,
  EpisodeThumbnailConcept,
} from "../../lib/episode-package-v2";
import type { EpisodeThumbnailTitleStyle } from "../../lib/hearth-title-fonts";

export const useHearthThumbnailWorkspaceState = useThumbnailWorkspace;
export const useHearthThumbnailPreviewLifecycle = useThumbnailPreviewLoader;
export const useHearthThumbnailConceptCommands = useThumbnailConceptActions;
export const useHearthThumbnailGenerationCommands = useThumbnailGenerationActions;

const CANONICAL_THUMBNAIL_PROJECTION_DEPENDENCIES={
  readWorkspace:readCanonicalThumbnailWorkspaceV3,
  readAuthority:readThumbnailCandidateAuthorityProjection,
};

export function useHearthThumbnailLifecycle(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  episodePackage: EpisodePackageV2 | null;
  thumbnailConcepts: EpisodeThumbnailConcept[];
  selectedThumbnailConcept: EpisodeThumbnailConcept | null;
  selectedThumbnailConceptId: string;
  defaultThumbnailBrandTemplateId: string | null;
  selectedThumbnailBrandLogoWorkpieceId: string | null;
  selectedThumbnailBrandLogoAssetPath: string | null;
  thumbnailTitleStyleDraft: EpisodeThumbnailTitleStyle;
  thumbnailConceptBrandTemplateIdDraft: string | null;
  isThumbnailConceptSaving: boolean;
  isThumbnailGenerating: boolean;
  isThumbnailUploading: boolean;
  setThumbnailBrandTemplates: ReturnType<typeof useThumbnailWorkspace>["setThumbnailBrandTemplates"];
  setThumbnailBrandTemplatesError: ReturnType<typeof useThumbnailWorkspace>["setThumbnailBrandTemplatesError"];
  setIsThumbnailBrandTemplatesLoading: ReturnType<typeof useThumbnailWorkspace>["setIsThumbnailBrandTemplatesLoading"];
  setThumbnailBrandLogoDataUrl: ReturnType<typeof useThumbnailWorkspace>["setThumbnailBrandLogoDataUrl"];
  setThumbnailBrandLogoError: ReturnType<typeof useThumbnailWorkspace>["setThumbnailBrandLogoError"];
  setThumbnailBrandLogoStatus: ReturnType<typeof useThumbnailWorkspace>["setThumbnailBrandLogoStatus"];
  syncSelectedThumbnailConceptId: ReturnType<typeof useThumbnailWorkspace>["syncSelectedThumbnailConceptId"];
  syncThumbnailConceptDraftFromConcept: ReturnType<typeof useThumbnailWorkspace>["syncThumbnailConceptDraftFromConcept"];
  persistThumbnailEpisodePackage: (
    next: EpisodePackageV2,
    eventName: string,
    payload: Record<string, unknown>,
  ) => Promise<EpisodePackageV2 | null>;
}) {
  useEffect(() => {
    const workspace = args.workspaceId?.trim() ?? "";
    if (!workspace) {
      args.setThumbnailBrandTemplates([]);
      args.setThumbnailBrandTemplatesError(null);
      args.setIsThumbnailBrandTemplatesLoading(false);
      return;
    }
    let cancelled = false;
    args.setIsThumbnailBrandTemplatesLoading(true);
    args.setThumbnailBrandTemplatesError(null);
    void (async () => {
      const seeded = await seedWorkspaceThumbnailBrandTemplates(workspace);
      if (cancelled) return;
      const listed = await listWorkspaceThumbnailBrandTemplates(workspace);
      if (cancelled) return;
      if (!listed.ok) {
        args.setThumbnailBrandTemplates([]);
        args.setThumbnailBrandTemplatesError(listed.error);
        args.setIsThumbnailBrandTemplatesLoading(false);
        return;
      }
      args.setThumbnailBrandTemplates(listed.data);
      args.setThumbnailBrandTemplatesError(!seeded.ok && listed.data.length === 0 ? seeded.error : null);
      args.setIsThumbnailBrandTemplatesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [args.workspaceId]);

  useEffect(() => {
    args.syncSelectedThumbnailConceptId(args.thumbnailConcepts);
  }, [args.syncSelectedThumbnailConceptId, args.thumbnailConcepts]);

  useEffect(() => {
    args.syncThumbnailConceptDraftFromConcept(
      args.selectedThumbnailConcept,
      args.defaultThumbnailBrandTemplateId,
    );
  }, [
    args.defaultThumbnailBrandTemplateId,
    args.selectedThumbnailConcept,
    args.syncThumbnailConceptDraftFromConcept,
  ]);

  useEffect(() => {
    const logoWorkpieceId = args.selectedThumbnailBrandLogoWorkpieceId ?? (args.workpieceId?.trim() ?? "");
    const logoAssetPath = args.selectedThumbnailBrandLogoAssetPath;
    if (!logoWorkpieceId || !logoAssetPath) {
      args.setThumbnailBrandLogoDataUrl(null);
      return;
    }
    let cancelled = false;
    void loadWorkspaceThumbnailBrandLogoPreview({
      workpieceId: logoWorkpieceId,
      assetPath: logoAssetPath,
    }).then((loaded) => {
      if (cancelled) return;
      if (!loaded.ok) {
        args.setThumbnailBrandLogoDataUrl(null);
        args.setThumbnailBrandLogoError((current) => current ?? loaded.error);
        return;
      }
      args.setThumbnailBrandLogoDataUrl(loaded.dataUrl);
      args.setThumbnailBrandLogoStatus("Brand logo loaded.");
    });
    return () => {
      cancelled = true;
    };
  }, [
    args.workpieceId,
    args.selectedThumbnailBrandLogoWorkpieceId,
    args.selectedThumbnailBrandLogoAssetPath,
  ]);

  useEffect(() => {
    if (!args.episodePackage || !args.selectedThumbnailConceptId) return;
    if (args.isThumbnailConceptSaving || args.isThumbnailGenerating || args.isThumbnailUploading) return;
    const savedConcept = args.episodePackage.thumbnail.concepts.find(
      (concept) => concept.id === args.selectedThumbnailConceptId,
    );
    if (!savedConcept) return;
    if (areEpisodeThumbnailTitleStylesEqual(savedConcept.title_style, args.thumbnailTitleStyleDraft)) return;
    const timer = window.setTimeout(() => {
      const normalizedTitleStyle = normalizeEpisodeThumbnailTitleStyle(args.thumbnailTitleStyleDraft);
      void args.persistThumbnailEpisodePackage({
        ...args.episodePackage!,
        thumbnail: {
          ...args.episodePackage!.thumbnail,
          concepts: args.episodePackage!.thumbnail.concepts.map((concept) =>
            concept.id === args.selectedThumbnailConceptId
              ? { ...concept, title_style: normalizedTitleStyle }
              : concept
          ),
        },
      }, "hearth.thumbnail.concept.title_style.updated.v1", {
        concept_id: args.selectedThumbnailConceptId,
        font_preset: normalizedTitleStyle.font_preset,
        text_color: normalizedTitleStyle.text_color,
        shadow_enabled: normalizedTitleStyle.shadow.enabled,
        shadow_strength: normalizedTitleStyle.shadow.strength,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    args.episodePackage,
    args.isThumbnailConceptSaving,
    args.isThumbnailGenerating,
    args.isThumbnailUploading,
    args.selectedThumbnailConceptId,
    args.thumbnailTitleStyleDraft,
  ]);

  useEffect(() => {
    if (!args.episodePackage || !args.selectedThumbnailConceptId) return;
    if (args.isThumbnailConceptSaving || args.isThumbnailGenerating || args.isThumbnailUploading) return;
    const savedConcept = args.episodePackage.thumbnail.concepts.find(
      (concept) => concept.id === args.selectedThumbnailConceptId,
    );
    if (!savedConcept) return;
    if ((savedConcept.brand_template_id ?? null) === (args.thumbnailConceptBrandTemplateIdDraft ?? null)) return;
    const timer = window.setTimeout(() => {
      void args.persistThumbnailEpisodePackage({
        ...args.episodePackage!,
        thumbnail: {
          ...args.episodePackage!.thumbnail,
          concepts: args.episodePackage!.thumbnail.concepts.map((concept) =>
            concept.id === args.selectedThumbnailConceptId
              ? { ...concept, brand_template_id: args.thumbnailConceptBrandTemplateIdDraft ?? null }
              : concept
          ),
        },
      }, "hearth.thumbnail.concept.brand_template.updated.v1", {
        concept_id: args.selectedThumbnailConceptId,
        brand_template_id: args.thumbnailConceptBrandTemplateIdDraft ?? null,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [
    args.episodePackage,
    args.isThumbnailConceptSaving,
    args.isThumbnailGenerating,
    args.isThumbnailUploading,
    args.selectedThumbnailConceptId,
    args.thumbnailConceptBrandTemplateIdDraft,
  ]);
}

export function useHearthCanonicalThumbnailProjection(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  dependencies?: {
    readWorkspace: typeof readCanonicalThumbnailWorkspaceV3;
    readAuthority: typeof readThumbnailCandidateAuthorityProjection;
  };
}) {
  const dependencies=args.dependencies??CANONICAL_THUMBNAIL_PROJECTION_DEPENDENCIES;
  const requestRevisionRef = useRef(0);
  const [projection, setProjection] = useState({
    canonical: EMPTY_CANONICAL_THUMBNAIL_PROGRESS,
    loading: false,
    loadError: null as string | null,
  });
  const onCanonicalProgress = useCallback((progress: {
    candidateSetRevision: number;
    conceptRevisionCount: number;
    baseVersionCount: number;
    candidateCount: number;
    eligibleCandidateCount: number;
    pendingCandidateCount: number;
    previewAssetPaths: string[];
  }) => {
    const workpieceId = args.workpieceId?.trim() ?? "";
    setProjection((current) => !isThumbnailProgressAtLeastAsCurrent(current.canonical,{workpieceId,candidateSetRevision:progress.candidateSetRevision}) ? current : ({
      ...current,
      canonical: {
        workpieceId,
        ...progress,
        titleCount: current.canonical.workpieceId === workpieceId ? current.canonical.titleCount : 0,
        tagCount: current.canonical.workpieceId === workpieceId ? current.canonical.tagCount : 0,
        hasDescriptions: current.canonical.workpieceId === workpieceId
          ? current.canonical.hasDescriptions
          : false,
      },
    }));
  }, [args.workpieceId]);

  const refreshCanonical = useCallback(async ():Promise<{ok:true}|{ok:false;error:string}> => {
    const workpieceId = args.workpieceId?.trim() ?? "";
    const workspaceId = args.workspaceId?.trim() ?? "";
    if (!workpieceId || !workspaceId) {
      setProjection({
        canonical: EMPTY_CANONICAL_THUMBNAIL_PROGRESS,
        loading: false,
        loadError: null,
      });
      return {ok:false,error:"Select an episode before refreshing thumbnail authority."};
    }
    const requestRevision=++requestRevisionRef.current;
    setProjection((current)=>({...current,loading:true,loadError:null}));
    try {
      const [workspace,authority]=await Promise.all([
        dependencies.readWorkspace({ workpieceId, workspaceId }),
        dependencies.readAuthority({ workpieceId, workspaceId }),
      ]);
      if(requestRevision!==requestRevisionRef.current||args.workpieceId?.trim()!==workpieceId||args.workspaceId?.trim()!==workspaceId)return{ok:false,error:"Thumbnail authority refresh was superseded by another episode."};
      const versions = workspace.episodePackage.thumbnail.launch_variant_revisions.map((entry) => ({
        asset_id: entry.snapshot.asset_id,
        asset_path: entry.snapshot.asset_path,
      }));
      const candidateSetRevision = Number(authority.candidate_set?.revision ?? 0);
      setProjection((current) => !isThumbnailProgressAtLeastAsCurrent(current.canonical,{workpieceId,candidateSetRevision})
        ? { ...current, loading: false, loadError: null }
        : ({
        canonical: {
          workpieceId,
          candidateSetRevision,
          conceptRevisionCount: workspace.episodePackage.thumbnail.concept_revisions.length,
          baseVersionCount: workspace.episodePackage.thumbnail.base_versions.length,
          candidateCount: authority.candidates.length,
          eligibleCandidateCount: authority.candidates.filter((candidate) =>
            candidate.eligibility_state === "current"
            || candidate.eligibility_state === "approved_historical_brand"
          ).length,
          pendingCandidateCount: 0,
          previewAssetPaths: authority.candidates.map((candidate) =>
            resolveHearthThumbnailCanonicalPreviewPath({
              candidateAssetPath: typeof candidate.asset_path === "string" ? candidate.asset_path : null,
              compositeAssetId: typeof candidate.composite_asset_id === "string" ? candidate.composite_asset_id : null,
              versions,
            })
          ).filter((path): path is string => Boolean(path)).slice(0, 3),
          titleCount: workspace.episodePackage.seo.titles.length,
          tagCount: workspace.episodePackage.seo.tags.length,
          hasDescriptions: Boolean(workspace.episodePackage.seo.description_short?.trim())
            && Boolean(workspace.episodePackage.seo.description_long?.trim()),
        },
        loading: false,
        loadError: null,
      }));
      return{ok:true};
    }catch(error){
      const message=error instanceof Error?error.message:"Thumbnail authority is unavailable.";
      if(requestRevision===requestRevisionRef.current)setProjection((current)=>({...current,loading:false,loadError:message}));
      return{ok:false,error:message};
    }
  },[args.workpieceId,args.workspaceId,dependencies]);

  useEffect(() => {
    const workpieceId=args.workpieceId?.trim()??"";
    setProjection({canonical:workpieceId?{...EMPTY_CANONICAL_THUMBNAIL_PROGRESS,workpieceId}:EMPTY_CANONICAL_THUMBNAIL_PROGRESS,loading:Boolean(workpieceId&&args.workspaceId?.trim()),loadError:null});
    void refreshCanonical();
    return () => {
      requestRevisionRef.current+=1;
    };
  }, [args.workpieceId, args.workspaceId,refreshCanonical]);

  return {
    ...projection,
    onCanonicalProgress,
    refreshCanonical,
  };
}

export function buildHearthThumbnailController(args: {
  workspace: ReturnType<typeof useThumbnailWorkspace>;
  canonical: ReturnType<typeof useHearthCanonicalThumbnailProjection>;
  refreshThumbnails: () => void;
  surfaceInput: Parameters<typeof buildHearthThumbnailPanelProps>[0];
}): HearthThumbnailController {
  return {
    state: {
      workspace: args.workspace,
      canonical: args.canonical.canonical,
    },
    commands: {
      refreshThumbnails: args.refreshThumbnails,
      retryThumbnailLoad: args.refreshThumbnails,
    },
    status: {
      load: !args.canonical.canonical.workpieceId
        ? "inactive"
        : args.canonical.loading
          ? "loading"
          : args.canonical.loadError
            ? "error"
            : args.canonical.canonical.candidateCount > 0
              ? "loaded"
              : "absent",
      generation: args.workspace.isThumbnailGenerating ? "running" : "idle",
      upload: args.workspace.isThumbnailUploading ? "running" : "idle",
      preview: args.workspace.thumbnailPreviewState,
      authority: args.canonical.loadError ? "unavailable" : "available",
    },
    surface: buildHearthThumbnailPanelProps(args.surfaceInput),
  };
}
