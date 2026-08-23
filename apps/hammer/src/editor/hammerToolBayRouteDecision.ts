import type { HammerPassId } from "../persistence/hammerPersistenceContract";
import type { HammerSelectedVisualContext } from "./hammerSelectedVisualContext";
import type { HammerEditorMode, HammerVisualToolRackId } from "./hammerWorkspaceShellCore";
import type { HammerWorkspaceToolId } from "./hammerWorkspaceTimeline";

export type HammerToolBayRouteIntent =
  | "explicit_visual_selection"
  | "passive_restoration"
  | "hydration_restoration"
  | "synchronization"
  | "manual_navigation"
  | "editor_mode"
  | "current_pass";

export type HammerToolBaySurface =
  | "polish"
  | "visual_polish"
  | "images"
  | "broll"
  | "audio"
  | "captions"
  | "details"
  | "finishing"
  | "export";

export type HammerToolBayRouteReason =
  | "passive_selection_preserved"
  | "manual_visual_surface_incompatible"
  | "explicit_selection_missing"
  | "manual_visual_tool_missing"
  | "active_tool_missing"
  | "active_tool_unknown"
  | "active_visual_tool_unknown"
  | "current_pass_unknown"
  | "editor_mode_unknown"
  | "pass_mode_disagreement"
  | "tool_pass_disagreement"
  | "visual_tool_pass_disagreement"
  | "surface_not_supported"
  | "selected_visual_unsupported";

type RouteInvariants = Readonly<{
  navigationPermitted: boolean;
  selectionPreserved: true;
}>;

export type HammerToolBayRouteDecision =
  | (RouteInvariants & Readonly<{
      status: "resolved";
      activeTool: HammerWorkspaceToolId;
      activeVisualTool: HammerVisualToolRackId | null;
      representativePass: HammerPassId;
      source: "explicit_selection" | "manual_navigation" | "editor_mode" | "current_pass";
    }>)
  | (RouteInvariants & Readonly<{
      status: "preserve";
      reason: Extract<HammerToolBayRouteReason,
        | "passive_selection_preserved"
        | "manual_visual_surface_incompatible"
        | "explicit_selection_missing"
        | "manual_visual_tool_missing">;
    }>)
  | (RouteInvariants & Readonly<{
      status: "unsupported";
      reason: Exclude<HammerToolBayRouteReason,
        | "passive_selection_preserved"
        | "manual_visual_surface_incompatible"
        | "explicit_selection_missing"
        | "manual_visual_tool_missing">;
      selectedPlacementId: string | null;
    }>);

type UnsupportedReason = Extract<HammerToolBayRouteDecision, { status: "unsupported" }>["reason"];
type PreserveReason = Extract<HammerToolBayRouteDecision, { status: "preserve" }>["reason"];
type ResolvedSource = Extract<HammerToolBayRouteDecision, { status: "resolved" }>["source"];

export type HammerToolBayRouteInput = Readonly<{
  selectedVisualContext: HammerSelectedVisualContext;
  currentPass: HammerPassId | string | null;
  editorMode: HammerEditorMode | string | null;
  activeTool: HammerWorkspaceToolId | string | null;
  activeVisualTool: HammerVisualToolRackId | string | null;
  intent: HammerToolBayRouteIntent;
  manualSelection?: Readonly<{
    activeTool: HammerWorkspaceToolId | string;
    activeVisualTool: HammerVisualToolRackId | string | null;
  }>;
  supportedSurfaces: readonly HammerToolBaySurface[];
}>;

export type HammerToolBayLegacyComparison = Readonly<{
  classification: "exact_parity" | "intentionally_fail_closed" | "requires_htb2b_decision";
  legacyBehavior:
    | "none"
    | "missing_active_visual_tool_to_polish"
    | "missing_or_unknown_route_to_polish"
    | "non_image_selection_to_broll"
    | "unsupported_visual_mode_panel"
    | "unsupported_surface_fallback"
    | "pass_mode_fallback"
    | "manual_incompatible_surface";
}>;

const PASS_IDS: readonly HammerPassId[] = [
  "transcript_cleanup", "retakes", "gap_pacing", "visual_finishing", "image_placement",
  "image_animation", "audio_finalization", "packaging", "ready",
];
const EDITOR_MODES: readonly HammerEditorMode[] = ["transcript", "images", "assets", "broll", "intro_outro"];
const TOOLS: readonly HammerWorkspaceToolId[] = ["polish", "audio", "video", "captions", "details", "finishing", "export"];
const VISUAL_TOOLS: readonly HammerVisualToolRackId[] = ["polish", "images", "broll"];

const isPass = (value: string | null): value is HammerPassId => PASS_IDS.some((candidate) => candidate === value);
const isEditorMode = (value: string | null): value is HammerEditorMode => EDITOR_MODES.some((candidate) => candidate === value);
const isTool = (value: string | null): value is HammerWorkspaceToolId => TOOLS.some((candidate) => candidate === value);
const isVisualTool = (value: string | null): value is HammerVisualToolRackId => VISUAL_TOOLS.some((candidate) => candidate === value);

function selectedPlacementId(context: HammerSelectedVisualContext): string | null {
  return context.status === "selected" ? context.placementId : context.status === "unsupported" ? context.placementId : null;
}

function unsupported(input: HammerToolBayRouteInput, reason: UnsupportedReason): HammerToolBayRouteDecision {
  return { status: "unsupported", reason, selectedPlacementId: selectedPlacementId(input.selectedVisualContext), navigationPermitted: false, selectionPreserved: true };
}

function preserve(reason: PreserveReason): HammerToolBayRouteDecision {
  return { status: "preserve", reason, navigationPermitted: false, selectionPreserved: true };
}

function passRoute(pass: HammerPassId): { tool: HammerWorkspaceToolId; visualTool: HammerVisualToolRackId | null; mode: HammerEditorMode } {
  if (pass === "transcript_cleanup" || pass === "retakes" || pass === "gap_pacing") return { tool: "polish", visualTool: null, mode: "transcript" };
  if (pass === "visual_finishing") return { tool: "video", visualTool: "polish", mode: "images" };
  if (pass === "image_placement") return { tool: "video", visualTool: "images", mode: "images" };
  if (pass === "image_animation") return { tool: "video", visualTool: "broll", mode: "broll" };
  if (pass === "audio_finalization") return { tool: "audio", visualTool: null, mode: "assets" };
  if (pass === "packaging") return { tool: "finishing", visualTool: null, mode: "intro_outro" };
  return { tool: "export", visualTool: null, mode: "transcript" };
}

function surfaceFor(tool: HammerWorkspaceToolId, visualTool: HammerVisualToolRackId | null): HammerToolBaySurface {
  if (tool === "video") return visualTool === "polish" ? "visual_polish" : visualTool === "broll" ? "broll" : "images";
  return tool;
}

function representativePass(tool: HammerWorkspaceToolId, visualTool: HammerVisualToolRackId | null, currentPass: HammerPassId): HammerPassId {
  if (tool === "video") return visualTool === "polish" ? "visual_finishing" : visualTool === "broll" ? "image_animation" : "image_placement";
  if (tool === "polish") return passRoute(currentPass).tool === "polish" ? currentPass : "transcript_cleanup";
  if (tool === "audio") return "audio_finalization";
  if (tool === "finishing") return "packaging";
  if (tool === "export") return "ready";
  return currentPass;
}

function resolved(args: {
  tool: HammerWorkspaceToolId;
  visualTool: HammerVisualToolRackId | null;
  pass: HammerPassId;
  source: ResolvedSource;
  navigationPermitted: boolean;
}): HammerToolBayRouteDecision {
  return {
    status: "resolved", activeTool: args.tool, activeVisualTool: args.visualTool,
    representativePass: args.pass, source: args.source,
    navigationPermitted: args.navigationPermitted, selectionPreserved: true,
  };
}

export function resolveHammerToolBayRoute(input: HammerToolBayRouteInput): HammerToolBayRouteDecision {
  if (input.intent === "passive_restoration" || input.intent === "hydration_restoration" || input.intent === "synchronization") {
    if (input.selectedVisualContext.status === "unsupported") return unsupported(input, "selected_visual_unsupported");
    return preserve("passive_selection_preserved");
  }

  if (input.intent === "explicit_visual_selection") {
    if (input.selectedVisualContext.status === "unsupported") return unsupported(input, "selected_visual_unsupported");
    if (input.selectedVisualContext.status === "none") return preserve("explicit_selection_missing");
    const visualTool = input.selectedVisualContext.preferredTool;
    if (!input.supportedSurfaces.includes(surfaceFor("video", visualTool))) return unsupported(input, "surface_not_supported");
    return resolved({ tool: "video", visualTool, pass: input.selectedVisualContext.preferredPass, source: "explicit_selection", navigationPermitted: true });
  }

  if (!isPass(input.currentPass)) return unsupported(input, "current_pass_unknown");
  if (input.intent === "manual_navigation") {
    const toolValue = input.manualSelection ? input.manualSelection.activeTool : input.activeTool;
    const visualValue = input.manualSelection ? input.manualSelection.activeVisualTool : input.activeVisualTool;
    if (toolValue === null) return unsupported(input, "active_tool_missing");
    if (!isTool(toolValue)) return unsupported(input, "active_tool_unknown");
    if (toolValue === "video") {
      if (visualValue === null) return preserve("manual_visual_tool_missing");
      if (!isVisualTool(visualValue)) return unsupported(input, "active_visual_tool_unknown");
      const selected = input.selectedVisualContext;
      if (selected.status === "unsupported") return unsupported(input, "selected_visual_unsupported");
      if (selected.status === "selected" && visualValue !== "polish" && visualValue !== selected.preferredTool) {
        return preserve("manual_visual_surface_incompatible");
      }
      if (!input.supportedSurfaces.includes(surfaceFor(toolValue, visualValue))) return unsupported(input, "surface_not_supported");
      return resolved({ tool: toolValue, visualTool: visualValue, pass: representativePass(toolValue, visualValue, input.currentPass), source: "manual_navigation", navigationPermitted: true });
    }
    if (!input.supportedSurfaces.includes(surfaceFor(toolValue, null))) return unsupported(input, "surface_not_supported");
    return resolved({ tool: toolValue, visualTool: null, pass: representativePass(toolValue, null, input.currentPass), source: "manual_navigation", navigationPermitted: true });
  }

  if (input.editorMode === null) return unsupported(input, "editor_mode_unknown");
  if (!isEditorMode(input.editorMode)) return unsupported(input, "editor_mode_unknown");
  if (input.activeTool === null) return unsupported(input, "active_tool_missing");
  if (!isTool(input.activeTool)) return unsupported(input, "active_tool_unknown");
  const route = passRoute(input.currentPass);
  if (route.mode !== input.editorMode) return unsupported(input, "pass_mode_disagreement");
  if (route.tool !== input.activeTool) return unsupported(input, "tool_pass_disagreement");
  if (route.tool === "video") {
    if (input.activeVisualTool === null) return unsupported(input, "active_visual_tool_unknown");
    if (!isVisualTool(input.activeVisualTool)) return unsupported(input, "active_visual_tool_unknown");
    if (route.visualTool !== input.activeVisualTool) return unsupported(input, "visual_tool_pass_disagreement");
  }
  if (!input.supportedSurfaces.includes(surfaceFor(route.tool, route.visualTool))) return unsupported(input, "surface_not_supported");
  return resolved({ tool: route.tool, visualTool: route.visualTool, pass: input.currentPass, source: input.intent, navigationPermitted: false });
}

export function compareHammerToolBayRouteToLegacy(
  input: HammerToolBayRouteInput,
  decision: HammerToolBayRouteDecision,
): HammerToolBayLegacyComparison {
  if ((decision.status === "unsupported" && decision.reason === "active_visual_tool_unknown")
    || (decision.status === "preserve" && decision.reason === "manual_visual_tool_missing")) {
    return { classification: "intentionally_fail_closed", legacyBehavior: "missing_active_visual_tool_to_polish" };
  }
  if (decision.status === "unsupported" && (decision.reason === "active_tool_missing" || decision.reason === "active_tool_unknown" || decision.reason === "current_pass_unknown" || decision.reason === "editor_mode_unknown")) {
    return { classification: "intentionally_fail_closed", legacyBehavior: "missing_or_unknown_route_to_polish" };
  }
  if (decision.status === "unsupported" && decision.reason === "surface_not_supported") {
    return { classification: "intentionally_fail_closed", legacyBehavior: "unsupported_surface_fallback" };
  }
  if (decision.status === "unsupported" && (decision.reason === "pass_mode_disagreement" || decision.reason === "tool_pass_disagreement" || decision.reason === "visual_tool_pass_disagreement")) {
    return { classification: "requires_htb2b_decision", legacyBehavior: "pass_mode_fallback" };
  }
  if (decision.status === "preserve" && decision.reason === "manual_visual_surface_incompatible") {
    return { classification: "requires_htb2b_decision", legacyBehavior: "manual_incompatible_surface" };
  }
  if (input.selectedVisualContext.status === "unsupported") {
    return { classification: "exact_parity", legacyBehavior: "unsupported_visual_mode_panel" };
  }
  if (input.selectedVisualContext.status === "selected" && input.selectedVisualContext.kind !== "image" && input.intent === "explicit_visual_selection") {
    return { classification: "exact_parity", legacyBehavior: "non_image_selection_to_broll" };
  }
  return { classification: "exact_parity", legacyBehavior: "none" };
}
