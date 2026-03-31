import { useCallback, useMemo } from "react";

type HearthVisualsStatus = {
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  mediaMapStatus: string | null;
  mediaMapCoverageLevel: string;
  mediaMapScopeLabel: string;
  activeVisualProviderBanner: string;
  activeVisualProviderHelperText: string;
  aiCreditsDepleted: boolean;
  isAiProcessing: boolean;
  activeProductionAction: string | null;
  releasePrepScriptVersion: number | null;
  latestReleasePrepRawText: string | null;
  releasePrepLoadState: "idle" | "loading" | "ready" | "missing" | "error";
  latestReleasePrepSections: Array<{ key: string; label: string; content: string }>;
};

type HearthVisualsCommands = {
  onGenerateTitles: () => void;
  onGenerateTags: () => void;
  onGenerateFramingPack: () => void;
  onRefreshFramingPack: () => void;
};

type HearthVisualsPanelInputs<
  TThumbnailPanelProps,
  TMediaMapPanelProps,
  TImageMapPanelProps,
  TBrollPanelProps,
  TReferenceClipPanelProps,
  TMetadataPanelProps,
> = {
  thumbnailPanelMeta: string;
  mediaMapPanelMeta: string;
  imageMapPanelMeta: string;
  brollPanelMeta: string;
  referenceClipPanelMeta: string;
  metadataPanelMeta: string;
  thumbnailPanelProps: TThumbnailPanelProps;
  mediaMapPanelProps: TMediaMapPanelProps;
  imageMapPanelProps: TImageMapPanelProps;
  brollPlanPanelProps: TBrollPanelProps;
  referenceClipPlanPanelProps: TReferenceClipPanelProps;
  metadataPanelProps: TMetadataPanelProps;
};

export type HearthVisualsWorkspace = {
  status: HearthVisualsStatus;
  commands: HearthVisualsCommands;
  composePanels: <
    TThumbnailPanelProps,
    TMediaMapPanelProps,
    TImageMapPanelProps,
    TBrollPanelProps,
    TReferenceClipPanelProps,
    TMetadataPanelProps,
  >(input: HearthVisualsPanelInputs<
    TThumbnailPanelProps,
    TMediaMapPanelProps,
    TImageMapPanelProps,
    TBrollPanelProps,
    TReferenceClipPanelProps,
    TMetadataPanelProps
  >) => {
    thumbnail: { meta: string; panelProps: TThumbnailPanelProps };
    mediaMap: { meta: string; panelProps: TMediaMapPanelProps };
    imageMap: { meta: string; panelProps: TImageMapPanelProps };
    broll: { meta: string; panelProps: TBrollPanelProps };
    referenceClips: { meta: string; panelProps: TReferenceClipPanelProps };
    metadata: { meta: string; panelProps: TMetadataPanelProps };
  };
};

type UseHearthVisualsWorkspaceArgs = {
  status: HearthVisualsStatus;
  commands: HearthVisualsCommands;
};

export function useHearthVisualsWorkspace(args: UseHearthVisualsWorkspaceArgs): HearthVisualsWorkspace {
  const composePanels = useCallback(<
    TThumbnailPanelProps,
    TMediaMapPanelProps,
    TImageMapPanelProps,
    TBrollPanelProps,
    TReferenceClipPanelProps,
    TMetadataPanelProps,
  >(input: HearthVisualsPanelInputs<
    TThumbnailPanelProps,
    TMediaMapPanelProps,
    TImageMapPanelProps,
    TBrollPanelProps,
    TReferenceClipPanelProps,
    TMetadataPanelProps
  >) => ({
    thumbnail: {
      meta: input.thumbnailPanelMeta,
      panelProps: input.thumbnailPanelProps,
    },
    mediaMap: {
      meta: input.mediaMapPanelMeta,
      panelProps: input.mediaMapPanelProps,
    },
    imageMap: {
      meta: input.imageMapPanelMeta,
      panelProps: input.imageMapPanelProps,
    },
    broll: {
      meta: input.brollPanelMeta,
      panelProps: input.brollPlanPanelProps,
    },
    referenceClips: {
      meta: input.referenceClipPanelMeta,
      panelProps: input.referenceClipPlanPanelProps,
    },
    metadata: {
      meta: input.metadataPanelMeta,
      panelProps: input.metadataPanelProps,
    },
  }), []);

  return useMemo(() => ({
    status: args.status,
    commands: args.commands,
    composePanels,
  }), [args.commands, args.status, composePanels]);
}
