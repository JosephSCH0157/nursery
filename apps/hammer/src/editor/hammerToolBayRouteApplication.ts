import type { HammerPassId } from "../persistence/hammerPersistenceContract";
import type { HammerToolBayRouteDecision, HammerToolBayUnsupportedReason } from "./hammerToolBayRouteDecision";
import type { HammerEditorMode } from "./hammerWorkspaceShellCore";

export type HammerToolBayRouteApplicationResult = Readonly<{
  passChanged: boolean;
  editorModeChanged: boolean;
  unsupportedChanged: boolean;
}>;

export function applyHammerToolBayRouteDecision(args: {
  decision: HammerToolBayRouteDecision;
  currentPass: HammerPassId;
  editorMode: HammerEditorMode;
  unsupportedReason: HammerToolBayUnsupportedReason | null;
  setCurrentPass: (pass: HammerPassId) => void;
  setEditorMode: (mode: HammerEditorMode) => void;
  setUnsupportedReason: (reason: HammerToolBayUnsupportedReason | null) => void;
}): HammerToolBayRouteApplicationResult {
  if (args.decision.status === "preserve") {
    return { passChanged: false, editorModeChanged: false, unsupportedChanged: false };
  }
  if (args.decision.status === "unsupported") {
    const unsupportedChanged = args.unsupportedReason !== args.decision.reason;
    if (unsupportedChanged) args.setUnsupportedReason(args.decision.reason);
    return { passChanged: false, editorModeChanged: false, unsupportedChanged };
  }
  const passChanged = args.currentPass !== args.decision.representativePass;
  const editorModeChanged = args.editorMode !== args.decision.editorMode;
  const unsupportedChanged = args.unsupportedReason !== null;
  if (passChanged) args.setCurrentPass(args.decision.representativePass);
  if (editorModeChanged) args.setEditorMode(args.decision.editorMode);
  if (unsupportedChanged) args.setUnsupportedReason(null);
  return { passChanged, editorModeChanged, unsupportedChanged };
}
