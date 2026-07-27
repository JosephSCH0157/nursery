import type {
  HearthDesktopRailViewModel,
  HearthDesktopRailViewModelInput,
} from "./hearth-desktop-rail-contracts";

export function buildHearthDesktopRailViewModel(
  input: HearthDesktopRailViewModelInput,
): HearthDesktopRailViewModel {
  const {
    missingSourcesCount,
    unusedSourcesCount,
    ...rail
  } = input;
  const sourcesBadge = missingSourcesCount > 0 ? String(missingSourcesCount) : null;
  const sourcesBadgeTitle = missingSourcesCount > 0
    ? `Missing cited sources: ${missingSourcesCount}${unusedSourcesCount ? ` · Unused refs: ${unusedSourcesCount}` : ""}`
    : unusedSourcesCount > 0
      ? `Unused refs: ${unusedSourcesCount}`
      : "Sources";

  return Object.freeze({
    ...rail,
    sourcesBadge,
    sourcesBadgeTitle,
  });
}
