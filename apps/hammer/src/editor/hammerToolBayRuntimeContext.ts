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
] as const;

export const HAMMER_TOOL_BAY_LEGACY_REMOVAL_DEADLINE = "HTB-3B completion" as const;

export type HammerToolBayRuntimeContexts = Readonly<{
  completion: HammerPassCompletionToolBayContext | null;
  body: Extract<HammerToolBayContext, { surface: "unsupported" | "release_readiness" | "export" | "audio_finalization" | "audio_adjustments" | "captions" | "metadata" }> | null;
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
