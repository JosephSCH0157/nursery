import { useMemo } from "react";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import type { HammerPreparedReleasePackage } from "../lib/hammerPreparedReleasePackage";
import { compareHammerPreparedReleasePackageToCurrent } from "../lib/hammerPreparedReleasePackage";
import type { HammerReleasePrepPackage } from "../lib/hammerReleasePrepPackage";
import { deriveHammerReleaseHandoffPosture } from "../lib/hammerReleaseHandoffPosture";
import { resolvePodcastMasterUiStatus } from "./hammerPodcastMasterStatus";
import { evaluateHammerReadinessGate } from "./hammerReadinessGate";
import type { HammerRenderAssemblyResult } from "./hammerRenderAssembly";

export type HammerExportTruthState = "never_prepared" | "current" | "stale";

export function useHammerWorkspaceShellReleaseComparison(args: {
  loadedPreparedPackage: HammerPreparedReleasePackage | null;
  currentReleasePackage: HammerReleasePrepPackage;
  timelineRevision: string;
  renderAssembly: HammerRenderAssemblyResult;
}) {
  const releasePrepComparison = useMemo(
    () => compareHammerPreparedReleasePackageToCurrent(
      args.loadedPreparedPackage,
      args.currentReleasePackage,
      { timelineRevision: args.timelineRevision },
    ),
    [args.currentReleasePackage, args.timelineRevision, args.loadedPreparedPackage],
  );
  const timelineRevisionChanged = useMemo(() => {
    if (!args.loadedPreparedPackage) return false;
    const previous = args.loadedPreparedPackage.provenance.timelineRevision ?? null;
    const current = args.timelineRevision ?? null;
    return previous !== current;
  }, [args.timelineRevision, args.loadedPreparedPackage]);
  const releasePrepStaleReasons = useMemo(() => {
    const reasons = [...releasePrepComparison.staleReasons];
    if (timelineRevisionChanged) reasons.push("Timeline revision changed");
    return reasons;
  }, [releasePrepComparison.staleReasons, timelineRevisionChanged]);
  const exportTruthState: HammerExportTruthState = !args.loadedPreparedPackage
    ? "never_prepared"
    : releasePrepComparison.preparedStatus === "current" && !timelineRevisionChanged
    ? "current"
    : "stale";
  const exportStatusLabel = exportTruthState === "never_prepared"
    ? "Never exported"
    : exportTruthState === "current"
    ? "Exported and current"
    : "Exported, but stale";
  const podcastMasterLayer = useMemo(
    () => args.renderAssembly.export_timeline.audio_layers.find((layer) => layer.kind === "podcast_master_pass") ?? null,
    [args.renderAssembly.export_timeline.audio_layers],
  );
  const podcastMasterUiStatus = useMemo(
    () => resolvePodcastMasterUiStatus({
      declared: Boolean(podcastMasterLayer), posture: podcastMasterLayer?.posture,
      capability: podcastMasterLayer?.capability, preview_mode: podcastMasterLayer?.meta?.preview_mode,
      applied_stages: podcastMasterLayer?.meta?.applied_stages, skipped_stages: podcastMasterLayer?.meta?.skipped_stages,
    }),
    [podcastMasterLayer],
  );
  return { releasePrepStaleReasons, exportTruthState,
    exportStatusLabel, podcastMasterLayer, podcastMasterUiStatus,
    previewTruthPosture: args.renderAssembly.preview.posture,
    exportTruthPosture: args.renderAssembly.export_timeline.export_posture,
    handoffTruthPosture: args.renderAssembly.handoff.posture };
}

export function useHammerWorkspaceShellReleaseReadiness(args: {
  renderAssembly: HammerRenderAssemblyResult;
  canonicalGraph: HammerEditorialAuthorityGraph | null;
  boundAttentionQueue: Parameters<typeof evaluateHammerReadinessGate>[0]["boundAttentionQueue"];
  unresolvedBrollSuggestions: ReadonlyArray<{ operationId: string }>;
  currentReleasePackage: HammerReleasePrepPackage;
}) {
  const readinessGate = useMemo(() => evaluateHammerReadinessGate({
    renderAssembly: args.renderAssembly, canonicalGraph: args.canonicalGraph,
    boundAttentionQueue: args.boundAttentionQueue,
    unresolvedBrollSuggestionOperationIds: args.unresolvedBrollSuggestions.map((item) => item.operationId),
  }), [args.renderAssembly, args.canonicalGraph, args.boundAttentionQueue, args.unresolvedBrollSuggestions]);
  const handoffPosture = useMemo(() => deriveHammerReleaseHandoffPosture({
    releasePrepPackage: args.currentReleasePackage, readinessGate,
  }), [args.currentReleasePackage, readinessGate]);
  return { readinessGate, readinessVerdict: handoffPosture.verdict };
}
