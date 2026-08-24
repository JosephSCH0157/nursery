import type { JSX } from "react";
import type {
  HammerAudioAdjustmentsToolBayContext,
  HammerAudioFinalizationToolBayContext,
  HammerCaptionsToolBayContext,
  HammerFinishingToolBayContext,
  HammerGapPacingToolBayContext,
  HammerMetadataToolBayContext,
  HammerPackagingToolBayContext,
  HammerRetakesToolBayContext,
  HammerTranscriptCleanupToolBayContext,
  HammerTranscriptPolishToolBayContext,
} from "./hammerToolBayContext";
import { HammerTypedAudioSurfaces } from "./HammerTypedAudioSurfaces";
import { HammerTypedCaptionMetadataSurfaces } from "./HammerTypedCaptionMetadataSurfaces";
import { HammerTypedPackagingFinishingSurfaces } from "./HammerTypedPackagingFinishingSurfaces";
import { HammerTypedTranscriptSurfaces } from "./HammerTypedTranscriptSurfaces";

export type HammerAudioCaptionMetadataSurfaceContext =
  | HammerAudioFinalizationToolBayContext | HammerAudioAdjustmentsToolBayContext
  | HammerCaptionsToolBayContext | HammerMetadataToolBayContext
  | HammerTranscriptCleanupToolBayContext | HammerRetakesToolBayContext | HammerGapPacingToolBayContext | HammerTranscriptPolishToolBayContext
  | HammerPackagingToolBayContext | HammerFinishingToolBayContext;

export function HammerTypedAudioCaptionMetadataSurface(props: { context: HammerAudioCaptionMetadataSurfaceContext }): JSX.Element {
  const { context } = props;
  if (context.surface === "audio_finalization" || context.surface === "audio_adjustments") return <HammerTypedAudioSurfaces context={context} />;
  if (context.surface === "captions" || context.surface === "metadata") return <HammerTypedCaptionMetadataSurfaces context={context} />;
  if (context.surface === "transcript_cleanup" || context.surface === "retakes" || context.surface === "gap_pacing" || context.surface === "transcript_polish") return <HammerTypedTranscriptSurfaces context={context} />;
  return <HammerTypedPackagingFinishingSurfaces context={context} />;
}
