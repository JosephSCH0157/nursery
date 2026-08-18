import type { HammerDerivedTextLayer } from "../persistence/hammerPersistenceContract";
import { normalizeHammerOutputSelectionRef } from "../macros/hammerDerivedTranscriptLayers";
import type { HammerEditorStateSerializable, HammerOutputSelectionState } from "./hammerWorkspaceHistory";
import type { HammerHistoryMutationArgs } from "./hammerWorkspaceShellHistoryController";
import { formatOutputLayerLabel } from "./hammerWorkspaceShellFormatters";

/** Canonical export-output selection commands with no neighboring artifact or delivery authority. */

type ApplyHistoryMutation = (args: HammerHistoryMutationArgs) => unknown;

export function selectHammerOutputLayerForExport(args: {
  layerId: string | null;
  layers: readonly HammerDerivedTextLayer[];
  currentSelection: HammerOutputSelectionState;
  applyHistoryMutation: ApplyHistoryMutation;
}): boolean {
  const targetLayer = args.layerId
    ? args.layers.find((layer) => layer.layer_id === args.layerId) ?? null
    : null;
  const nextSelection: HammerOutputSelectionState = {
    layerId: targetLayer?.layer_id ?? null,
    sourceRecipeRef: targetLayer?.recipe_ref ?? null,
  };
  if (nextSelection.layerId === args.currentSelection.layerId
    && nextSelection.sourceRecipeRef === args.currentSelection.sourceRecipeRef) return false;

  args.applyHistoryMutation({
    label: targetLayer ? `Set export output to ${formatOutputLayerLabel(targetLayer)}` : "Set export output to Raw transcript",
    kind: "output_selection",
    toolId: "export",
    immediatePersist: true,
    computeAfter: (before: HammerEditorStateSerializable) => ({ ...before, outputSelection: { ...nextSelection } }),
  });
  return true;
}

export function clearInvalidHammerOutputSelection(args: {
  layers: readonly HammerDerivedTextLayer[];
  currentSelection: HammerOutputSelectionState;
  applyHistoryMutation: ApplyHistoryMutation;
}): boolean {
  if (!args.currentSelection.layerId) return false;
  const normalized = normalizeHammerOutputSelectionRef({ selection: args.currentSelection, layers: [...args.layers] });
  if (normalized.layerId === args.currentSelection.layerId
    && normalized.sourceRecipeRef === args.currentSelection.sourceRecipeRef) return false;

  args.applyHistoryMutation({
    label: "Clear invalid export output selection",
    kind: "output_selection",
    toolId: "export",
    immediatePersist: true,
    computeAfter: (before: HammerEditorStateSerializable) => ({ ...before, outputSelection: { ...normalized } }),
  });
  return true;
}
