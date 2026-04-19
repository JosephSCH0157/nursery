import type {
  HammerIntroOutroSelection,
  HammerStoredMediaFile,
  HammerWorkspaceIntroOutroDefaults,
} from "../lib/hammerSourceDeskMediaApi";
import { deriveStableHammerAssetIdFromPath } from "../lib/hammerAssetIdentity";

export interface HammerIntroOutroCandidateItem extends HammerStoredMediaFile {
  assetId: string;
}

export interface HammerResolvedIntroOutroSelection {
  introAssetId: string | null;
  outroAssetId: string | null;
  introPath: string | null;
  outroPath: string | null;
  introResolved: boolean;
  outroResolved: boolean;
}

export interface HammerWorkspaceIntroOutroDefaultsRepairPlan {
  shouldApply: boolean;
  copyIntro: boolean;
  copyOutro: boolean;
}

export interface HammerIntroOutroPackagingSyncPlan {
  applyIntro: { assetId: string; path: string } | null;
  removeIntro: boolean;
  applyOutro: { assetId: string; path: string } | null;
  removeOutro: boolean;
}

function isIntroOutroCandidateKind(kind: HammerStoredMediaFile["kind"]): boolean {
  return kind === "broll" || kind === "reference_clip" || kind === "audio" || kind === "other";
}

export function buildIntroOutroCandidateItems(
  storedMediaFiles: HammerStoredMediaFile[],
): HammerIntroOutroCandidateItem[] {
  return storedMediaFiles
    .filter((file) => isIntroOutroCandidateKind(file.kind))
    .map((file) => ({
      ...file,
      assetId: deriveStableHammerAssetIdFromPath(file.path),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function buildIntroOutroCandidateItemsById(
  items: HammerIntroOutroCandidateItem[],
): Map<string, HammerIntroOutroCandidateItem> {
  const byId = new Map<string, HammerIntroOutroCandidateItem>();
  for (const item of items) {
    byId.set(item.assetId, item);
  }
  return byId;
}

export function resolveIntroOutroSelection(
  selection: HammerIntroOutroSelection | null | undefined,
  candidateItemsById: ReadonlyMap<string, HammerIntroOutroCandidateItem>,
): HammerResolvedIntroOutroSelection {
  const introAssetId = selection?.intro_asset_id ?? null;
  const outroAssetId = selection?.outro_asset_id ?? null;
  const introPath = introAssetId ? (candidateItemsById.get(introAssetId)?.path ?? null) : null;
  const outroPath = outroAssetId ? (candidateItemsById.get(outroAssetId)?.path ?? null) : null;
  return {
    introAssetId,
    outroAssetId,
    introPath,
    outroPath,
    introResolved: Boolean(introAssetId && introPath),
    outroResolved: Boolean(outroAssetId && outroPath),
  };
}

export function buildWorkspaceIntroOutroDefaultsRepairPlan(args: {
  selection: HammerIntroOutroSelection | null | undefined;
  candidateItemsById: ReadonlyMap<string, HammerIntroOutroCandidateItem>;
  defaults: HammerWorkspaceIntroOutroDefaults | null | undefined;
}): HammerWorkspaceIntroOutroDefaultsRepairPlan {
  if (!args.defaults) {
    return {
      shouldApply: false,
      copyIntro: false,
      copyOutro: false,
    };
  }

  if (!args.selection) {
    const copyIntro = Boolean(args.defaults.intro);
    const copyOutro = Boolean(args.defaults.outro);
    return {
      shouldApply: copyIntro || copyOutro,
      copyIntro,
      copyOutro,
    };
  }

  const resolved = resolveIntroOutroSelection(args.selection, args.candidateItemsById);
  const copyIntro = Boolean(args.selection.intro_asset_id && !resolved.introResolved && args.defaults.intro);
  const copyOutro = Boolean(args.selection.outro_asset_id && !resolved.outroResolved && args.defaults.outro);
  return {
    shouldApply: copyIntro || copyOutro,
    copyIntro,
    copyOutro,
  };
}

export function buildIntroOutroPackagingSyncPlan(args: {
  selection: HammerIntroOutroSelection | null | undefined;
  candidateItemsById: ReadonlyMap<string, HammerIntroOutroCandidateItem>;
  currentIntroPlacementAssetId?: string | null;
  currentIntroPlacementPath?: string | null;
  currentOutroPlacementAssetId?: string | null;
  currentOutroPlacementPath?: string | null;
}): HammerIntroOutroPackagingSyncPlan {
  const resolved = resolveIntroOutroSelection(args.selection, args.candidateItemsById);

  const currentIntroMatches = Boolean(
    resolved.introAssetId
      && resolved.introPath
      && (
        args.currentIntroPlacementAssetId === resolved.introAssetId
        || args.currentIntroPlacementPath === resolved.introPath
      ),
  );
  const currentOutroMatches = Boolean(
    resolved.outroAssetId
      && resolved.outroPath
      && (
        args.currentOutroPlacementAssetId === resolved.outroAssetId
        || args.currentOutroPlacementPath === resolved.outroPath
      ),
  );

  return {
    applyIntro: resolved.introAssetId && resolved.introPath && !currentIntroMatches
      ? { assetId: resolved.introAssetId, path: resolved.introPath }
      : null,
    removeIntro: !resolved.introAssetId && Boolean(args.currentIntroPlacementAssetId || args.currentIntroPlacementPath),
    applyOutro: resolved.outroAssetId && resolved.outroPath && !currentOutroMatches
      ? { assetId: resolved.outroAssetId, path: resolved.outroPath }
      : null,
    removeOutro: !resolved.outroAssetId && Boolean(args.currentOutroPlacementAssetId || args.currentOutroPlacementPath),
  };
}
