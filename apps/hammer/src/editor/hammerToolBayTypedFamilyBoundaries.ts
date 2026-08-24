import type {
  HammerAudioAdjustmentsToolBayContext,
  HammerAudioFinalizationToolBayContext,
  HammerCaptionsToolBayContext,
  HammerFinishingToolBayContext,
  HammerMetadataToolBayContext,
  HammerPackagingToolBayContext,
} from "./hammerToolBayContext";

type AssertNever<Value extends never> = Value;

export type HammerToolBayTypedFamilyBoundaryProof = readonly [
  AssertNever<Extract<keyof HammerAudioFinalizationToolBayContext["commands"], keyof HammerAudioAdjustmentsToolBayContext["commands"]>>,
  AssertNever<Extract<keyof HammerAudioAdjustmentsToolBayContext["commands"], keyof HammerAudioFinalizationToolBayContext["commands"]>>,
  AssertNever<Extract<keyof HammerAudioFinalizationToolBayContext["data"] | keyof HammerAudioAdjustmentsToolBayContext["data"], "model">>,
  AssertNever<Extract<keyof HammerAudioFinalizationToolBayContext["commands"] | keyof HammerAudioAdjustmentsToolBayContext["commands"], "setTag" | "buildCaptions" | "refreshCandidates" | "applyIntro" | "setReviewFlag" | "updateLook" | "focusIssue" | "sendToQuench">>,
  AssertNever<Extract<keyof HammerCaptionsToolBayContext["commands"], "setTag">>,
  AssertNever<Extract<keyof HammerMetadataToolBayContext["data"], keyof HammerCaptionsToolBayContext["data"]>>,
  AssertNever<Extract<keyof HammerPackagingToolBayContext["commands"], "setReviewFlag">>,
  AssertNever<Extract<keyof HammerFinishingToolBayContext["commands"], "applyIntro" | "applyOutro" | "removePlacement" | "updateLogoStyle" | "toggleLogo">>,
  AssertNever<Extract<keyof HammerCaptionsToolBayContext["data"] | keyof HammerMetadataToolBayContext["data"] | keyof HammerPackagingToolBayContext["data"] | keyof HammerFinishingToolBayContext["data"], "model">>,
];
