import {
  applyPatches,
  buildStatePatches,
  cloneEditorState,
  type HammerEditorStateSerializable,
} from "./hammerWorkspaceHistory";

/** Applies only the command-observed delta to the frozen durable history basis. */
export function applyHammerHistoryCommandState(args: {
  liveBefore: HammerEditorStateSerializable;
  computeAfter: (before: HammerEditorStateSerializable) => HammerEditorStateSerializable;
  durableBefore: HammerEditorStateSerializable;
  normalize: (state: HammerEditorStateSerializable) => HammerEditorStateSerializable;
}): HammerEditorStateSerializable | null {
  const liveAfter = cloneEditorState(args.normalize(args.computeAfter(cloneEditorState(args.liveBefore))));
  const commandPatches = buildStatePatches(args.liveBefore, liveAfter).forward;
  if (commandPatches.length === 0) return null;
  return cloneEditorState(args.normalize(applyPatches(args.durableBefore, commandPatches)));
}
