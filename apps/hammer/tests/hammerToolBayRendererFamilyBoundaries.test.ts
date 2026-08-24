import assert from "node:assert/strict";
import test from "node:test";
import type { HammerTypedAudioSurfaces } from "../src/editor/HammerTypedAudioSurfaces";
import type { HammerTypedCaptionMetadataSurfaces } from "../src/editor/HammerTypedCaptionMetadataSurfaces";
import type { HammerTypedPackagingFinishingSurfaces } from "../src/editor/HammerTypedPackagingFinishingSurfaces";
import type { HammerTypedTranscriptSurfaces } from "../src/editor/HammerTypedTranscriptSurfaces";
import type {
  HammerImagePlacementToolBayContext,
  HammerVisualPolishToolBayContext,
} from "../src/editor/hammerToolBayContext";
import type { HammerToolBayTypedFamilyBoundaryProof } from "../src/editor/hammerToolBayTypedFamilyBoundaries";

type ContextOf<Component extends (props: never) => unknown> = Parameters<Component>[0] extends { context: infer Context } ? Context : never;
type AudioContext = ContextOf<typeof HammerTypedAudioSurfaces>;
type CaptionMetadataContext = ContextOf<typeof HammerTypedCaptionMetadataSurfaces>;
type TranscriptContext = ContextOf<typeof HammerTypedTranscriptSurfaces>;
type PackagingFinishingContext = ContextOf<typeof HammerTypedPackagingFinishingSurfaces>;
type VisualContext = HammerVisualPolishToolBayContext | HammerImagePlacementToolBayContext;
type AssertNever<Value extends never> = Value;

type AudioCannotEnterTranscript = AssertNever<Extract<AudioContext, TranscriptContext>>;
type PackagingCannotEnterCaptionMetadata = AssertNever<Extract<PackagingFinishingContext, CaptionMetadataContext>>;
type TranscriptCannotEnterAudio = AssertNever<Extract<TranscriptContext, AudioContext>>;
type VisualCannotEnterAudio = AssertNever<Extract<VisualContext, AudioContext>>;
type VisualCannotEnterCaptionMetadata = AssertNever<Extract<VisualContext, CaptionMetadataContext>>;
type VisualCannotEnterTranscript = AssertNever<Extract<VisualContext, TranscriptContext>>;
type VisualCannotEnterPackagingFinishing = AssertNever<Extract<VisualContext, PackagingFinishingContext>>;
type CaptionsContext = Extract<CaptionMetadataContext, { surface: "captions" }>;
type MetadataContext = Extract<CaptionMetadataContext, { surface: "metadata" }>;
type PackagingContext = Extract<PackagingFinishingContext, { surface: "packaging" }>;
type FinishingContext = Extract<PackagingFinishingContext, { surface: "finishing" }>;
type CaptionsCannotAccessMetadataCommands = AssertNever<Extract<keyof CaptionsContext["commands"], "setTag">>;
type MetadataCannotAccessCaptionState = AssertNever<Extract<keyof MetadataContext["data"], keyof CaptionsContext["data"]>>;
type PackagingCannotAccessFinishingCommands = AssertNever<Extract<keyof PackagingContext["commands"], "setReviewFlag">>;
type FinishingCannotAccessPackagingCommands = AssertNever<Extract<keyof FinishingContext["commands"], "applyIntro" | "applyOutro" | "removePlacement" | "updateLogoStyle" | "toggleLogo">>;
type TypedFamiliesCannotAccessLegacyModel = AssertNever<Extract<keyof CaptionsContext["data"] | keyof MetadataContext["data"] | keyof PackagingContext["data"] | keyof FinishingContext["data"], "model">>;
type ProductionBoundaryProof = HammerToolBayTypedFamilyBoundaryProof;

const boundaryProofs: readonly unknown[] = [
  null as AudioCannotEnterTranscript,
  null as PackagingCannotEnterCaptionMetadata,
  null as TranscriptCannotEnterAudio,
  null as VisualCannotEnterAudio,
  null as VisualCannotEnterCaptionMetadata,
  null as VisualCannotEnterTranscript,
  null as VisualCannotEnterPackagingFinishing,
  null as CaptionsCannotAccessMetadataCommands,
  null as MetadataCannotAccessCaptionState,
  null as PackagingCannotAccessFinishingCommands,
  null as FinishingCannotAccessPackagingCommands,
  null as TypedFamiliesCannotAccessLegacyModel,
  null as ProductionBoundaryProof,
];

test("Tool Bay renderer families accept only their exact context unions", () => {
  assert.equal(boundaryProofs.length, 13);
});
