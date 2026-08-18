import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import {
  createCrossfadeInstruction,
  createDipToBlackInstruction,
  createFadeAudioInstruction,
  createHardCutInstruction,
} from "./hammerAuthorityOps";
import type { HammerEditorStateSerializable, HammerHistoryEntry } from "./hammerWorkspaceHistory";
import type { HammerHistoryMutationArgs } from "./hammerWorkspaceShellHistoryController";
import { roundToTenth } from "./hammerWorkspaceTimeline";

/** Transition command authority. It owns transition construction only, not general timeline,
 * visual-preview, automatic-placement, persistence, view models, or JSX. */
export function createHammerTransitionCommands(args: {
  transcriptDurationSec: number;
  applyHistoryMutation: (mutation: HammerHistoryMutationArgs) => HammerHistoryEntry | null;
  appendAuthorityInstruction: (
    state: HammerEditorStateSerializable,
    instruction: HammerEditInstruction,
  ) => HammerEditorStateSerializable["editorialAuthorityGraph"];
}) {
  const addMinimalTransition = (
    transitionType: "hard_cut" | "crossfade" | "dip_to_black" | "fade_audio",
  ): void => {
    args.applyHistoryMutation({
      label: `Add ${transitionType.replace("_", " ")}`,
      kind: "visual_adjustment",
      toolId: "video",
      immediatePersist: true,
      computeAfter: (before) => {
        if (!before.editorialAuthorityGraph) return before;
        const segment = before.selectedSegmentId
          ? before.transcriptSegments.find((item) => item.segment_id === before.selectedSegmentId) ?? null
          : before.transcriptSegments[0] ?? null;
        if (!segment) return before;
        const startSec = Math.max(0, roundToTenth(before.playheadSec));
        const defaultDuration = transitionType === "hard_cut" ? 0.1 : transitionType === "crossfade" ? 0.6 : 0.5;
        const endSec = Math.min(args.transcriptDurationSec, roundToTenth(startSec + defaultDuration));
        const instruction = transitionType === "hard_cut"
          ? createHardCutInstruction({ segmentId: segment.segment_id, startSec, endSec: Math.max(startSec + 0.1, endSec) })
          : transitionType === "crossfade"
          ? createCrossfadeInstruction({
            segmentId: segment.segment_id,
            nextSegmentId: before.transcriptSegments.find((item) => item.start_sec >= segment.end_sec)?.segment_id
              ?? segment.segment_id,
            durationSec: Math.max(0.1, endSec - startSec),
            startSec,
            endSec: Math.max(startSec + 0.1, endSec),
          })
          : transitionType === "dip_to_black"
          ? createDipToBlackInstruction({ segmentId: segment.segment_id, startSec, endSec: Math.max(startSec + 0.1, endSec) })
          : createFadeAudioInstruction({
            segmentId: segment.segment_id,
            startSec,
            endSec: Math.max(startSec + 0.1, endSec),
            fadeCurve: "linear",
          });
        return { ...before, editorialAuthorityGraph: args.appendAuthorityInstruction(before, instruction) };
      },
    });
  };
  return { addMinimalTransition };
}
