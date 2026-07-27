import type { HearthMobileOverlaysProps } from "../../views/modes/HearthMobileOverlays";

export type HearthMobileNavigationViewModel = Readonly<HearthMobileOverlaysProps>;

export type HearthMobileNavigationViewModelInput = Omit<
  HearthMobileOverlaysProps,
  "activeDraftTitle" | "restoreButtonLabel" | "restoreButtonDisabled"
> & {
  activeDraftTitle: string | null | undefined;
  activeWorkpieceId: string | null;
  restoringWorkpieceIds: readonly string[];
};
