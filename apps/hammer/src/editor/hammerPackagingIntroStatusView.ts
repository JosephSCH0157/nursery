export type PackagingIntroStatusView = Readonly<{
  selectionStatusLine: string;
  placementStatusLine: string;
  applyActionLabel: string;
  removeActionLabel: string;
  canApply: boolean;
  canRemove: boolean;
}>;

export function derivePackagingIntroStatusView(args: Readonly<{
  selectedIntroAssetId: string | null;
  selectedIntroPath: string | null;
  introPlaced: boolean;
}>): PackagingIntroStatusView {
  const selected = Boolean(args.selectedIntroAssetId);
  const resolved = Boolean(args.selectedIntroAssetId && args.selectedIntroPath);
  return {
    selectionStatusLine: selected ? (resolved ? `Selected intro from Source Desk: ${args.selectedIntroPath}` : `Selected intro from Source Desk is unresolved (${args.selectedIntroAssetId}).`) : "No intro selected in Source Desk.",
    placementStatusLine: args.introPlaced ? "Timeline packaging intro: placed." : "Timeline packaging intro: not placed.",
    applyActionLabel: "Apply Selected Intro to Timeline",
    removeActionLabel: "Remove Intro from Timeline",
    canApply: resolved,
    canRemove: args.introPlaced,
  };
}
