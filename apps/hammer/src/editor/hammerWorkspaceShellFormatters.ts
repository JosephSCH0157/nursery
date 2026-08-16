import type { HammerDerivedTextLayer } from "../persistence/hammerPersistenceContract";
import type { HammerPreparedReleasePackage } from "../lib/hammerPreparedReleasePackage";
import type { HammerHistoryEntry } from "./hammerWorkspaceHistory";
import { stableHashToken } from "./hammerWorkspaceShellCore";

export type HammerTimelineGapBlock = {
  startSec: number;
  endSec: number;
};

export function formatOutputLayerLabelFromRecipeRef(recipeRef: string): string {
  const recipe = recipeRef.trim() || "derived";
  if (recipe.startsWith("speaker_solo:")) {
    const speaker = recipe.split(":", 2)[1]?.trim().toUpperCase() || "Speaker";
    return `Solo Mode - ${speaker}`;
  }
  if (recipe.startsWith("speaker_interview:")) {
    const pair = recipe.split(":", 2)[1] ?? "";
    const [host, respondent] = pair.split("->").map((item) => item.trim().toUpperCase());
    if (host && respondent) return `Interview Mode - ${host} -> ${respondent}`;
    return "Interview Mode";
  }
  if (recipe.startsWith("speaker_monologue:")) {
    const speaker = recipe.split(":", 2)[1]?.trim().toUpperCase() || "Speaker";
    return `Monologue Cleanup - ${speaker}`;
  }
  if (recipe.startsWith("speaker_panel:")) {
    const bias = recipe.split(":", 2)[1]?.trim();
    if (bias === "host_favoring") return "Panel Mode - Host favoring";
    if (bias === "none") return "Panel Mode - No bias";
    return "Panel Mode";
  }
  return `${recipe} output`;
}

export function formatOutputLayerLabel(layer: HammerDerivedTextLayer): string {
  return formatOutputLayerLabelFromRecipeRef(layer.recipe_ref);
}

export function compactHistoryActionLabel(label: string | null): string {
  if (!label) return "";
  const trimmed = label.trim();
  if (trimmed.length <= 28) return trimmed;
  return `${trimmed.slice(0, 25)}...`;
}

export function formatHistoryTimestamp(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toLocaleTimeString();
}

export function formatHistoryEntryScope(entry: HammerHistoryEntry): string {
  const segmentCount = entry.affectedSegmentIds?.length ?? 0;
  const placementCount = entry.affectedPlacementIds?.length ?? 0;
  if (segmentCount > 0 && placementCount > 0) {
    return `${segmentCount} segment${segmentCount === 1 ? "" : "s"}, ${placementCount} placement${placementCount === 1 ? "" : "s"}`;
  }
  if (segmentCount > 0) return `${segmentCount} segment${segmentCount === 1 ? "" : "s"}`;
  if (placementCount > 0) return `${placementCount} placement${placementCount === 1 ? "" : "s"}`;
  return "workspace state";
}

export function formatStudioRackModuleLabel(moduleId: string): string {
  if (moduleId === "eq") return "Parametric EQ";
  if (moduleId === "reverb") return "Reverb";
  if (moduleId === "tubeMicCharacter") return "Tube Mic Character";
  if (moduleId === "gate") return "Gate";
  if (moduleId === "compressor") return "Compressor";
  return moduleId;
}

export function buildPreparedPackageIdentityFingerprint(pkg: HammerPreparedReleasePackage): string {
  const basis = [
    `v:${String(pkg.version)}`,
    `ws:${pkg.workspaceId ?? ""}`,
    `wp:${pkg.workpieceId}`,
    `at:${pkg.preparedAt}`,
    `ts:${pkg.transcript.fingerprint ?? ""}`,
    `srt:${pkg.subtitles.srt.fingerprint ?? ""}`,
    `vtt:${pkg.subtitles.vtt.fingerprint ?? ""}`,
    `m:${pkg.media.fingerprint ?? ""}`,
    `tl:${pkg.provenance.timelineRevision ?? ""}`,
  ].join("|");
  return `hppkg:${stableHashToken(basis)}`;
}

export function resolveLaneGaps(
  blocks: HammerTimelineGapBlock[],
  durationSec: number,
): Array<{ id: string; startSec: number; endSec: number }> {
  const sorted = [...blocks]
    .map((block) => ({
      startSec: Math.max(0, Math.min(durationSec, block.startSec)),
      endSec: Math.max(0, Math.min(durationSec, block.endSec)),
    }))
    .filter((block) => block.endSec > block.startSec)
    .sort((a, b) => a.startSec - b.startSec);
  const gaps: Array<{ id: string; startSec: number; endSec: number }> = [];
  let cursor = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const block = sorted[index];
    if (block.startSec > cursor) {
      gaps.push({ id: `gap-${index}-${cursor.toFixed(2)}-${block.startSec.toFixed(2)}`, startSec: cursor, endSec: block.startSec });
    }
    cursor = Math.max(cursor, block.endSec);
  }
  if (cursor < durationSec) {
    gaps.push({ id: `gap-tail-${cursor.toFixed(2)}-${durationSec.toFixed(2)}`, startSec: cursor, endSec: durationSec });
  }
  return gaps;
}
