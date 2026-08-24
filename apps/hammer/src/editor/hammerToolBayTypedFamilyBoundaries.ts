import type {
  HammerCaptionsToolBayContext,
  HammerFinishingToolBayContext,
  HammerMetadataToolBayContext,
  HammerPackagingToolBayContext,
} from "./hammerToolBayContext";

type AssertNever<Value extends never> = Value;

export type HammerToolBayTypedFamilyBoundaryProof = readonly [
  AssertNever<Extract<keyof HammerCaptionsToolBayContext["commands"], "setTag">>,
  AssertNever<Extract<keyof HammerMetadataToolBayContext["data"], keyof HammerCaptionsToolBayContext["data"]>>,
  AssertNever<Extract<keyof HammerPackagingToolBayContext["commands"], "setReviewFlag">>,
  AssertNever<Extract<keyof HammerFinishingToolBayContext["commands"], "applyIntro" | "applyOutro" | "removePlacement" | "updateLogoStyle" | "toggleLogo">>,
  AssertNever<Extract<keyof HammerCaptionsToolBayContext["data"] | keyof HammerMetadataToolBayContext["data"] | keyof HammerPackagingToolBayContext["data"] | keyof HammerFinishingToolBayContext["data"], "model">>,
];
