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
import type { HammerToolBayRouteDecision } from "./hammerToolBayRouteDecision";

export const HAMMER_MIGRATED_TOOL_BAY_SURFACES = [
  "unsupported",
  "release_readiness",
  "export",
  "pass_completion",
  "audio_finalization",
  "audio_adjustments",
  "captions",
  "metadata",
  "transcript_cleanup",
  "retakes",
  "gap_pacing",
  "transcript_polish",
  "packaging",
  "finishing",
] as const;

export const HAMMER_TOOL_BAY_LEGACY_REMOVAL_DEADLINE = "HTB-3B completion" as const;

export type HammerToolBayRuntimeContexts = Readonly<{
  completion: HammerPassCompletionToolBayContext | null;
  body: Extract<HammerToolBayContext, { surface: "unsupported" | "release_readiness" | "export" | "audio_finalization" | "audio_adjustments" | "captions" | "metadata" | "transcript_cleanup" | "retakes" | "gap_pacing" | "transcript_polish" | "packaging" | "finishing" }> | null;
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
  audioCommands: HammerAudioFinalizationToolBayContext["commands"];
  captionCommands: HammerCaptionsToolBayContext["commands"];
  metadataCommands: HammerMetadataToolBayContext["commands"];
  transcriptCleanupCommands: Extract<HammerToolBayContext, { surface: "transcript_cleanup" }>["commands"];
  retakeCommands: Extract<HammerToolBayContext, { surface: "retakes" }>["commands"];
  gapCommands: Extract<HammerToolBayContext, { surface: "gap_pacing" }>["commands"];
  transcriptPolishCommands: Extract<HammerToolBayContext, { surface: "transcript_polish" }>["commands"];
  packagingCommands: Extract<HammerToolBayContext, { surface: "packaging" }>["commands"];
  finishingCommands: Extract<HammerToolBayContext, { surface: "finishing" }>["commands"];
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
  if (args.route.surface === "packaging" || args.route.surface === "finishing") {
    const data = args.migratedEditorModel === null ? null : { model: args.migratedEditorModel };
    const body = args.route.surface === "packaging"
      ? buildHammerToolBayContext({ surface: "packaging", route: args.route, data, commands: args.packagingCommands })
      : buildHammerToolBayContext({ surface: "finishing", route: args.route, data, commands: args.finishingCommands });
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
      ? buildHammerToolBayContext({ surface: "audio_finalization", route: args.route, data: args.migratedEditorModel === null ? null : { model: args.migratedEditorModel }, commands: args.audioCommands })
      : args.route.surface === "audio_adjustments"
      ? buildHammerToolBayContext({ surface: "audio_adjustments", route: args.route, data: args.migratedEditorModel === null ? null : { model: args.migratedEditorModel }, commands: args.audioCommands })
      : args.route.surface === "captions"
      ? buildHammerToolBayContext({ surface: "captions", route: args.route, data: args.migratedEditorModel === null ? null : { model: args.migratedEditorModel }, commands: args.captionCommands })
      : buildHammerToolBayContext({ surface: "metadata", route: args.route, data: args.migratedEditorModel === null ? null : { model: args.migratedEditorModel }, commands: args.metadataCommands });
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
