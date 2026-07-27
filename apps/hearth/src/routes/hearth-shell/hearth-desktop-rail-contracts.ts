import type { HearthDesktopRailProps } from "../../views/modes/HearthDesktopRail";

export type HearthDesktopRailViewModel = Readonly<HearthDesktopRailProps>;

export type HearthDesktopRailViewModelInput = Omit<
  HearthDesktopRailProps,
  "sourcesBadge" | "sourcesBadgeTitle"
> & {
  missingSourcesCount: number;
  unusedSourcesCount: number;
};
