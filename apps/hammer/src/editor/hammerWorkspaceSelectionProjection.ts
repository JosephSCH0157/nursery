/** Projects transport-following selection without acquiring mutation or persistence authority. */
export function resolveHammerEffectiveVisualSelection(args: { transportActive: boolean; playheadClipId: string | null; selectedClipId: string | null }): string | null {
  return args.transportActive ? (args.playheadClipId ?? args.selectedClipId) : args.selectedClipId;
}
