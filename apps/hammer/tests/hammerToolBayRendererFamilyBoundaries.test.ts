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

const boundaryProofs: readonly unknown[] = [
  null as AudioCannotEnterTranscript,
  null as PackagingCannotEnterCaptionMetadata,
  null as TranscriptCannotEnterAudio,
  null as VisualCannotEnterAudio,
  null as VisualCannotEnterCaptionMetadata,
  null as VisualCannotEnterTranscript,
  null as VisualCannotEnterPackagingFinishing,
];

test("Tool Bay renderer families accept only their exact context unions", () => {
  assert.equal(boundaryProofs.length, 7);
});
