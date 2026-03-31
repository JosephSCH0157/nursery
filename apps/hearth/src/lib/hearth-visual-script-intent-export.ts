import type { EpisodeImageMapEntry } from "./episode-package-v2";

export function buildVisualScriptIntentExportDocument(
  workpieceId: string | null,
  entries: EpisodeImageMapEntry[],
): Record<string, unknown> {
  return {
    schema: "forge.hearth.visual-script-intent.v1",
    ...(workpieceId ? { workpiece_id: workpieceId } : {}),
    anchors: entries,
  };
}
