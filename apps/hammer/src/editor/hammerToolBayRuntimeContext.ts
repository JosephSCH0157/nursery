import {
  buildHammerToolBayContext,
  type HammerExportToolBayContext,
  type HammerAudioFinalizationToolBayContext,
  type HammerCaptionsToolBayContext,
  type HammerMetadataToolBayContext,
  type HammerPassCompletionToolBayContext,
  type HammerReleaseReadinessToolBayContext,
  type HammerToolBayContext,
} from "./hammerToolBayContext";
import type { HammerSelectedVisualContext } from "./hammerSelectedVisualContext";
import type { HammerToolBayRouteDecision } from "./hammerToolBayRouteDecision";

export type HammerToolBayRuntimeContexts = Readonly<{
  completion: HammerPassCompletionToolBayContext | null;
  body: Exclude<HammerToolBayContext, HammerPassCompletionToolBayContext> | null;
}>;

export function assembleHammerToolBayRuntimeContexts(args: Readonly<{
  route: HammerToolBayRouteDecision;
  passLabel: string;
  passStatus: string;
  markPassComplete: () => void;
  readinessData: HammerReleaseReadinessToolBayContext["data"] | null;
  exportData: HammerExportToolBayContext["data"] | null;
  focusIssue: () => void;
  sendToQuench: () => void;
  migratedEditorModel: unknown | null;
  audioFinalizationData: HammerAudioFinalizationToolBayContext["data"] | null;
  audioAdjustmentsData: Extract<HammerToolBayContext, { surface: "audio_adjustments" }>["data"] | null;
  captionsData: HammerCaptionsToolBayContext["data"] | null;
  metadataData: HammerMetadataToolBayContext["data"] | null;
  packagingData: Extract<HammerToolBayContext, { surface: "packaging" }>["data"] | null;
  finishingData: Extract<HammerToolBayContext, { surface: "finishing" }>["data"] | null;
  audioFinalizationCommands: HammerAudioFinalizationToolBayContext["commands"];
  audioAdjustmentCommands: Extract<HammerToolBayContext, { surface: "audio_adjustments" }>["commands"];
  captionCommands: HammerCaptionsToolBayContext["commands"];
  metadataCommands: HammerMetadataToolBayContext["commands"];
  transcriptCleanupCommands: Extract<HammerToolBayContext, { surface: "transcript_cleanup" }>["commands"];
  retakeCommands: Extract<HammerToolBayContext, { surface: "retakes" }>["commands"];
  gapCommands: Extract<HammerToolBayContext, { surface: "gap_pacing" }>["commands"];
  transcriptPolishCommands: Extract<HammerToolBayContext, { surface: "transcript_polish" }>["commands"];
  packagingCommands: Extract<HammerToolBayContext, { surface: "packaging" }>["commands"];
  finishingCommands: Extract<HammerToolBayContext, { surface: "finishing" }>["commands"];
  selectedVisualContext: HammerSelectedVisualContext;
  visualPolishCommands: Extract<HammerToolBayContext, { surface: "visual_polish" }>["commands"];
  imagePlacementCommands: Extract<HammerToolBayContext, { surface: "image_placement" }>["commands"];
  imageTimingCommands: Extract<HammerToolBayContext, { surface: "image_timing" }>["commands"];
  imageTransformCommands: Extract<HammerToolBayContext, { surface: "image_transform" }>["commands"];
  imageAnimationCommands: Extract<HammerToolBayContext, { surface: "image_animation" }>["commands"];
  brollCommands: Extract<HammerToolBayContext, { surface: "broll" }>["commands"];
  referenceClipCommands: Extract<HammerToolBayContext, { surface: "reference_clip" }>["commands"];
}>): HammerToolBayRuntimeContexts {
  if (args.route.status === "unsupported") {
    return {
      completion: null,
      body: {
        surface: "unsupported",
        route: args.route,
        data: { reason: args.route.reason, selectedPlacementId: args.route.selectedPlacementId },
        commands: {},
      },
    };
  }

  if (args.route.status !== "resolved") return { completion: null, body: null };

  const completion = buildHammerToolBayContext({
    surface: "pass_completion",
    route: args.route,
    data: { passLabel: args.passLabel, passStatus: args.passStatus, complete: args.passStatus === "complete" },
    commands: { markPassComplete: args.markPassComplete },
  });
  const typedCompletion = completion.surface === "pass_completion" ? completion : null;
  if (args.route.surface === "broll" || args.route.surface === "reference_clip") {
    const placementId = (args.selectedVisualContext.status === "selected" || args.selectedVisualContext.status === "unsupported" ? args.selectedVisualContext.placementId : null) ?? "";
    const data = args.migratedEditorModel === null ? null : { model: args.migratedEditorModel, selectedVisual: args.selectedVisualContext, placementId };
    const body = args.route.surface === "broll"
      ? buildHammerToolBayContext({ surface: "broll", route: args.route, data, commands: args.brollCommands })
      : buildHammerToolBayContext({ surface: "reference_clip", route: args.route, data, commands: args.referenceClipCommands });
    return { completion: typedCompletion, body: body.surface === "broll" || body.surface === "reference_clip" || body.surface === "unsupported" ? body : null };
  }
  if (args.route.surface === "visual_polish" || args.route.surface === "image_placement" || args.route.surface === "image_timing" || args.route.surface === "image_transform" || args.route.surface === "image_animation") {
    const placementId = (args.selectedVisualContext.status === "selected" || args.selectedVisualContext.status === "unsupported" ? args.selectedVisualContext.placementId : null) ?? "";
    const data = args.migratedEditorModel === null ? null : { model: args.migratedEditorModel, selectedVisual: args.selectedVisualContext, placementId };
    const body = args.route.surface === "visual_polish"
      ? buildHammerToolBayContext({ surface: "visual_polish", route: args.route, data: args.migratedEditorModel === null ? null : { model: args.migratedEditorModel }, commands: args.visualPolishCommands })
      : args.route.surface === "image_placement"
      ? buildHammerToolBayContext({ surface: "image_placement", route: args.route, data, commands: args.imagePlacementCommands })
      : args.route.surface === "image_timing"
      ? buildHammerToolBayContext({ surface: "image_timing", route: args.route, data, commands: args.imageTimingCommands })
      : args.route.surface === "image_transform"
      ? buildHammerToolBayContext({ surface: "image_transform", route: args.route, data, commands: args.imageTransformCommands })
      : buildHammerToolBayContext({ surface: "image_animation", route: args.route, data, commands: args.imageAnimationCommands });
    return { completion: typedCompletion, body: body.surface === "visual_polish" || body.surface === "image_placement" || body.surface === "image_timing" || body.surface === "image_transform" || body.surface === "image_animation" || body.surface === "unsupported" ? body : null };
  }
  if (args.route.surface === "packaging" || args.route.surface === "finishing") {
    const body = args.route.surface === "packaging"
      ? buildHammerToolBayContext({ surface: "packaging", route: args.route, data: args.packagingData, commands: args.packagingCommands })
      : buildHammerToolBayContext({ surface: "finishing", route: args.route, data: args.finishingData, commands: args.finishingCommands });
    return { completion: typedCompletion, body: body.surface === args.route.surface || body.surface === "unsupported" ? body : null };
  }
  if (args.route.surface === "transcript_cleanup" || args.route.surface === "retakes" || args.route.surface === "gap_pacing" || args.route.surface === "transcript_polish") {
    const data = args.migratedEditorModel === null ? null : { model: args.migratedEditorModel };
    const body = args.route.surface === "transcript_cleanup"
      ? buildHammerToolBayContext({ surface: "transcript_cleanup", route: args.route, data, commands: args.transcriptCleanupCommands })
      : args.route.surface === "retakes"
      ? buildHammerToolBayContext({ surface: "retakes", route: args.route, data, commands: args.retakeCommands })
      : args.route.surface === "gap_pacing"
      ? buildHammerToolBayContext({ surface: "gap_pacing", route: args.route, data, commands: args.gapCommands })
      : buildHammerToolBayContext({ surface: "transcript_polish", route: args.route, data, commands: args.transcriptPolishCommands });
    return { completion: typedCompletion, body: body.surface === args.route.surface || body.surface === "unsupported" ? body : null };
  }
  if (args.route.surface === "audio_finalization" || args.route.surface === "audio_adjustments" || args.route.surface === "captions" || args.route.surface === "metadata") {
    const body = args.route.surface === "audio_finalization"
      ? buildHammerToolBayContext({ surface: "audio_finalization", route: args.route, data: args.audioFinalizationData, commands: args.audioFinalizationCommands })
      : args.route.surface === "audio_adjustments"
      ? buildHammerToolBayContext({ surface: "audio_adjustments", route: args.route, data: args.audioAdjustmentsData, commands: args.audioAdjustmentCommands })
      : args.route.surface === "captions"
      ? buildHammerToolBayContext({ surface: "captions", route: args.route, data: args.captionsData, commands: args.captionCommands })
      : buildHammerToolBayContext({ surface: "metadata", route: args.route, data: args.metadataData, commands: args.metadataCommands });
    return { completion: typedCompletion, body: body.surface === args.route.surface || body.surface === "unsupported" ? body : null };
  }
  if (args.route.surface !== "release_readiness" && args.route.surface !== "export") return { completion: typedCompletion, body: null };

  const releaseCommands = { focusIssue: args.focusIssue, sendToQuench: args.sendToQuench };
  const body = args.route.surface === "release_readiness"
    ? buildHammerToolBayContext({ surface: "release_readiness", route: args.route, data: args.readinessData, commands: releaseCommands })
    : buildHammerToolBayContext({ surface: "export", route: args.route, data: args.exportData, commands: releaseCommands });
  return {
    completion: typedCompletion,
    body: body.surface === "release_readiness" || body.surface === "export" || body.surface === "unsupported" ? body : null,
  };
}
