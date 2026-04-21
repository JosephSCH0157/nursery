import type { HammerLookPreset } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import {
  normalizeHammerPassId as normalizeCanonicalPassId,
  normalizeHammerPassStatusMap as normalizeCanonicalPassStatusMap,
} from "../../../../packages/tongs/src/hammer-orchestration-contract";
import type {
  HammerPassId,
  HammerPassStatusMap,
} from "../persistence/hammerPersistenceContract";
import type { HammerWorkspaceToolId } from "./hammerWorkspaceTimeline";

export type HammerVisualLutPreset = HammerLookPreset | "neutral";
export type HammerSourceTabId = "transcript" | "images" | "assets" | "broll" | "introoutro";
export type HammerVisualToolRackId = "polish" | "images" | "broll";
export type HammerEditorMode = "transcript" | "images" | "assets" | "broll" | "intro_outro";
export type HammerVideoPanelRoute = HammerVisualToolRackId | "non_video";

type HammerToolId = HammerWorkspaceToolId;

export const SOURCE_TABS: Array<{ id: HammerSourceTabId; label: string }> = [
  { id: "transcript", label: "Transcript" },
  { id: "images", label: "Images" },
  { id: "assets", label: "Assets" },
  { id: "broll", label: "B-roll" },
  { id: "introoutro", label: "Intro/Outro" },
];

export const PASS_ORDER: Array<{
  id: HammerPassId;
  shortLabel: string;
  label: string;
  toolId: HammerToolId;
  sourceTab: HammerSourceTabId;
}> = [
  { id: "transcript_cleanup", shortLabel: "T1", label: "Transcript Cleanup", toolId: "polish", sourceTab: "transcript" },
  { id: "retakes", shortLabel: "T2", label: "Retakes", toolId: "polish", sourceTab: "transcript" },
  { id: "gap_pacing", shortLabel: "T3", label: "Silence Gaps", toolId: "polish", sourceTab: "transcript" },
  { id: "visual_finishing", shortLabel: "V1", label: "Visual Polish", toolId: "video", sourceTab: "images" },
  { id: "image_placement", shortLabel: "V2", label: "Image Placement", toolId: "video", sourceTab: "images" },
  { id: "image_animation", shortLabel: "V3", label: "B-roll", toolId: "video", sourceTab: "broll" },
  { id: "audio_finalization", shortLabel: "A", label: "Audio Finalization", toolId: "audio", sourceTab: "assets" },
  { id: "packaging", shortLabel: "P", label: "Packaging", toolId: "finishing", sourceTab: "introoutro" },
  { id: "ready", shortLabel: "R", label: "Ready", toolId: "export", sourceTab: "transcript" },
];

const PASS_BY_ID = new Map(PASS_ORDER.map((pass) => [pass.id, pass] as const));

export function readHammerDebugFlag(flagName: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const runtime = window as unknown as Record<string, unknown>;
    return runtime[flagName] === true;
  } catch {
    return false;
  }
}

export function isHammerModeRoutingDebugEnabled(): boolean {
  return import.meta.env.DEV && readHammerDebugFlag("__forgeHammerDebugModeRouting__");
}

export function isHammerVisualSelectionDebugEnabled(): boolean {
  return import.meta.env.DEV && readHammerDebugFlag("__forgeHammerDebugVisualSelection__");
}

export function resolvePassMeta(passId: HammerPassId): (typeof PASS_ORDER)[number] {
  return PASS_BY_ID.get(passId) ?? PASS_ORDER[0];
}

export function resolveVisualToolRackFromPass(passId: HammerPassId): HammerVisualToolRackId {
  if (passId === "image_placement") return "images";
  if (passId === "image_animation") return "broll";
  return "polish";
}

export function editorModeToToolSelection(mode: HammerEditorMode): {
  activeTool: HammerToolId;
  activeVisualTool: HammerVisualToolRackId | null;
  videoPanelRoute: HammerVideoPanelRoute;
} {
  switch (mode) {
    case "transcript":
      return { activeTool: "polish", activeVisualTool: null, videoPanelRoute: "non_video" };
    case "images":
      return { activeTool: "video", activeVisualTool: "images", videoPanelRoute: "images" };
    case "assets":
      return { activeTool: "audio", activeVisualTool: null, videoPanelRoute: "non_video" };
    case "broll":
      return { activeTool: "video", activeVisualTool: "broll", videoPanelRoute: "broll" };
    case "intro_outro":
      return { activeTool: "finishing", activeVisualTool: null, videoPanelRoute: "non_video" };
  }
}

export function mapToolToEditorMode(args: {
  tool: HammerToolId;
  activeVisualTool?: HammerVisualToolRackId | null;
}): HammerEditorMode {
  if (args.tool === "video") {
    return args.activeVisualTool === "broll" ? "broll" : "images";
  }
  if (args.tool === "audio") return "assets";
  if (args.tool === "finishing") return "intro_outro";
  return "transcript";
}

export function resolveEditorModeFromPass(passId: HammerPassId): HammerEditorMode {
  const meta = resolvePassMeta(passId);
  return mapToolToEditorMode({
    tool: meta.toolId,
    activeVisualTool: meta.toolId === "video" ? resolveVisualToolRackFromPass(passId) : null,
  });
}

export function resolveEditorModeFromSourceTab(sourceTab: HammerSourceTabId): HammerEditorMode {
  if (sourceTab === "introoutro") return "intro_outro";
  return sourceTab;
}

export function editorModeToSourceTab(mode: HammerEditorMode): HammerSourceTabId {
  return mode === "intro_outro" ? "introoutro" : mode;
}

export function editorModeToVisualTool(mode: HammerEditorMode, currentPass: HammerPassId): HammerVisualToolRackId {
  if (mode === "broll") return "broll";
  if (mode === "images") {
    return currentPass === "visual_finishing" ? "polish" : "images";
  }
  return resolveVisualToolRackFromPass(currentPass);
}

export function resolveRepresentativePassForEditorMode(mode: HammerEditorMode): HammerPassId {
  if (mode === "transcript") {
    return "transcript_cleanup";
  }
  if (mode === "images") {
    return "image_placement";
  }
  if (mode === "assets") {
    return "audio_finalization";
  }
  if (mode === "broll") {
    return "image_animation";
  }
  return "packaging";
}

export function normalizePassStatus(
  value: HammerPassStatusMap | null | undefined,
  currentPass: HammerPassId,
): HammerPassStatusMap {
  return normalizeCanonicalPassStatusMap(value, currentPass);
}

export function resolveInitialPassId(value: HammerPassId | undefined): HammerPassId {
  return normalizeCanonicalPassId(value);
}

export function stableHashToken(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
