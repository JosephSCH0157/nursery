import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import {
  HAMMER_EDITOR_STATE_LEGACY_HASH_ALGORITHM,
  matchEditorStateHash,
  type HammerEditorStateHashMatch,
  type HammerEditorStateSerializable,
} from "./hammerWorkspaceHistory";
import {
  loadHammerHistoryComponentAuthority,
  type HammerHistoryComponentHashes,
  type HammerHistoryComponentPaths,
} from "../lib/hammerHistoryEpochApi";

export function reconstructLegacyEditorStateHashInput(
  canonicalState: HammerEditorStateSerializable,
  persistedVisualTimeline: HammerVisualTimelineState | null,
): HammerEditorStateSerializable | null {
  return persistedVisualTimeline ? { ...canonicalState, visualTimeline: persistedVisualTimeline } : null;
}

export async function verifyEpochAnchorBaseHash(args: {
  expectedHash: string;
  canonicalState: HammerEditorStateSerializable;
  legacyReconstruction: HammerEditorStateSerializable | null;
  workpieceId: string;
  componentPaths: HammerHistoryComponentPaths | null;
  componentHashes: HammerHistoryComponentHashes;
  loadComponentAuthority?: typeof loadHammerHistoryComponentAuthority;
}): Promise<{ ok: true; match: HammerEditorStateHashMatch } | { ok: false; error: string }> {
  const match = matchEditorStateHash({
    expectedHash: args.expectedHash,
    canonicalState: args.canonicalState,
    legacyReconstruction: args.legacyReconstruction,
  });
  if (!match.matched) return { ok: false, error: "Epoch anchor canonical base mismatch. History traversal is blocked." };
  if (match.algorithm !== HAMMER_EDITOR_STATE_LEGACY_HASH_ALGORITHM) return { ok: true, match };
  if (!args.componentPaths) return { ok: false, error: "Epoch anchor legacy base authority is unavailable. History traversal is blocked." };
  const authority = await (args.loadComponentAuthority ?? loadHammerHistoryComponentAuthority)({
    workpieceId: args.workpieceId,
    paths: args.componentPaths,
  });
  const matches = Object.entries(args.componentHashes).every(
    ([component, expected]) => authority[component as keyof typeof authority].sha256 === expected,
  );
  return matches
    ? { ok: true, match }
    : { ok: false, error: "Epoch anchor legacy component authority mismatch. History traversal is blocked." };
}
