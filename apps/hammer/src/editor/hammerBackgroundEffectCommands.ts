import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerBackgroundEffectKind, HammerBackgroundEffectSettingsV1, HammerExportSegmentationAuthority } from "../../../../packages/contracts/hammer/visual-effects-export.contract";
import { createApplyBackgroundEffectInstruction, setAuthorityOperationLifecycle } from "./hammerAuthorityOps";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "./hammerWorkspaceHistory";
import type { HammerHistoryMutationArgs } from "./hammerWorkspaceShellHistoryController";

export { acceptHammerBackgroundEffect } from "./hammerBackgroundEffectAcceptance";

export function createHammerBackgroundEffectCommands(args: {
  applyHistoryMutation: (mutation: HammerHistoryMutationArgs) => HammerHistoryEntry | null;
  appendAuthorityInstruction: (state: HammerEditorStateSerializable, instruction: HammerEditInstruction) => HammerEditorStateSerializable["editorialAuthorityGraph"];
}) {
  const commitBackgroundEffect = (input: Readonly<{
    effectKind: HammerBackgroundEffectKind | null;
    settings: HammerBackgroundEffectSettingsV1 | null;
    previewProviderId: string;
    exportAuthority: HammerExportSegmentationAuthority;
  }>): HammerHistoryEntry | null => args.applyHistoryMutation({
    label: input.effectKind ? "Apply background effect" : "Disable background effect",
    kind: "editor_state_change",
    toolId: "video",
    immediatePersist: true,
    computeAfter: (before) => {
      let graph = before.editorialAuthorityGraph;
      if (!graph) return before;
      for (const operation of graph.operations) {
        if (operation.lifecycle !== "active" || operation.instruction.type !== "apply_background_effect") continue;
        graph = setAuthorityOperationLifecycle({ graph, operationId: operation.operation_id, lifecycle: "superseded" }) ?? graph;
      }
      if (!input.effectKind || !input.settings) return { ...before, editorialAuthorityGraph: graph };
      const segment = before.selectedSegmentId
        ? before.transcriptSegments.find((item) => item.segment_id === before.selectedSegmentId) ?? null
        : before.transcriptSegments[0] ?? null;
      if (!segment) return before;
      const instruction = createApplyBackgroundEffectInstruction({
        segmentId: segment.segment_id,
        effectKind: input.effectKind,
        settings: input.settings,
        previewProviderId: input.previewProviderId,
        exportAuthority: input.exportAuthority,
      });
      return { ...before, editorialAuthorityGraph: args.appendAuthorityInstruction({ ...before, editorialAuthorityGraph: graph }, instruction) };
    },
  });
  return { commitBackgroundEffect };
}
