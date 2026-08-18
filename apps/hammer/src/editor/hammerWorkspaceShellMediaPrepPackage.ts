import { useMemo } from "react";
import type { MediaRef } from "../../../../packages/contracts/hammer/media-resolver.contract";
import type {
  HammerPersistedAudioPolish,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
} from "../persistence/hammerPersistenceContract";
import {
  buildHammerMediaPrepOutputsPackage,
  type HammerMediaPrepOutputsPackage,
} from "../lib/hammerMediaPrepOutputsPackage";

/** Pure media-prep package projection with a slot-preserving memoization adapter. */
export type HammerWorkspaceShellMediaPrepPackageInput = {
  structuredTranscript: HammerPersistedStructuredTranscript | null;
  visualPlacements: HammerPersistedVisualPlacements | null;
  audioPolish: HammerPersistedAudioPolish | null;
  mediaRef: MediaRef | null;
  mediaSourceLabel: string | null;
};

export function buildHammerWorkspaceShellMediaPrepPackage(
  input: HammerWorkspaceShellMediaPrepPackageInput,
): HammerMediaPrepOutputsPackage {
  return buildHammerMediaPrepOutputsPackage({
    structuredTranscript: input.structuredTranscript,
    visualPlacements: input.visualPlacements,
    audioPolish: input.audioPolish,
    mediaRef: input.mediaRef,
    mediaSourceLabel: input.mediaSourceLabel,
  });
}

export function useHammerWorkspaceShellMediaPrepPackage(
  input: HammerWorkspaceShellMediaPrepPackageInput,
): HammerMediaPrepOutputsPackage {
  const { structuredTranscript, visualPlacements, audioPolish, mediaRef, mediaSourceLabel } = input;
  return useMemo(
    () => buildHammerWorkspaceShellMediaPrepPackage({
      structuredTranscript,
      visualPlacements,
      audioPolish,
      mediaRef,
      mediaSourceLabel,
    }),
    [audioPolish, mediaRef, mediaSourceLabel, structuredTranscript, visualPlacements],
  );
}
