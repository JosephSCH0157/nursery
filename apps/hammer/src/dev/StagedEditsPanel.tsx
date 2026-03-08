import { useMemo } from "react";
import type { JSX } from "react";
import type { HammerEditInstruction } from "../../../../packages/contracts/hammer/edit-instruction.contract";
import type { HammerTranscriptSegment } from "../../../../packages/contracts/hammer/transcript.contract";

type StagedEditGroup = {
  type: HammerEditInstruction["type"];
  title: string;
  instructions: HammerEditInstruction[];
};

type StagedEditsPanelProps = {
  instructions: HammerEditInstruction[];
  segmentById: Map<string, HammerTranscriptSegment>;
  segmentIndexById: Map<string, number>;
  onUndoInstruction: (instructionId: string) => void;
  onClearAll: () => void;
  onNavigateToInstruction: (instruction: HammerEditInstruction) => void;
};

const STAGED_EDIT_GROUP_ORDER: HammerEditInstruction["type"][] = [
  "delete",
  "mute",
  "trim",
  "split",
  "merge",
];

function formatStagedEditCountLabel(count: number): string {
  return `${count} staged`;
}

function formatSegmentLabel(segmentId: string, segmentIndexById: Map<string, number>): string {
  const index = segmentIndexById.get(segmentId);
  if (index != null) {
    return `Segment ${index + 1}`;
  }

  const trailingDigits = segmentId.match(/(\d+)$/);
  if (trailingDigits) {
    return `Segment ${Number.parseInt(trailingDigits[1], 10)}`;
  }

  return `Segment ${segmentId}`;
}

function formatStagedEditGroupTitle(type: HammerEditInstruction["type"]): string {
  switch (type) {
    case "delete":
      return "Delete staged";
    case "mute":
      return "Mute staged";
    case "trim":
      return "Trim staged";
    case "split":
      return "Split staged";
    case "merge":
      return "Merge staged";
    default:
      return type;
  }
}

function formatStagedEditGroupCountLabel(count: number): string {
  return `${count} ${count === 1 ? "edit" : "edits"}`;
}

function formatStagedEditInstructionLabel(
  instruction: HammerEditInstruction,
  segmentIndexById: Map<string, number>,
): string {
  const segmentLabel = formatSegmentLabel(instruction.segment_id, segmentIndexById);
  if (instruction.type === "merge") {
    return `${segmentLabel} + ${formatSegmentLabel(instruction.merge_with_segment_id, segmentIndexById)}`;
  }
  return segmentLabel;
}

function formatStagedEditInstructionContext(
  instruction: HammerEditInstruction,
  segmentById: Map<string, HammerTranscriptSegment>,
): string | null {
  const segment = segmentById.get(instruction.segment_id) ?? null;
  if (!segment) return null;

  const compactText = segment.text.length > 88
    ? `${segment.text.slice(0, 85).trimEnd()}...`
    : segment.text;

  return `${segment.speaker} · ${compactText}`;
}

function getStagedEditInstructionSortKey(
  instruction: HammerEditInstruction,
  segmentIndexById: Map<string, number>,
): number {
  const directIndex = segmentIndexById.get(instruction.segment_id);
  if (directIndex != null) {
    return directIndex;
  }

  if (instruction.type === "merge") {
    const mergeIndex = segmentIndexById.get(instruction.merge_with_segment_id);
    if (mergeIndex != null) {
      return mergeIndex;
    }
  }

  return Number.MAX_SAFE_INTEGER;
}

function formatInstructionDetail(instruction: HammerEditInstruction): string | null {
  if (instruction.type === "split") {
    return `Split at ${instruction.split_at_sec.toFixed(2)}s`;
  }
  if (instruction.type === "trim") {
    if (instruction.trim_start_sec != null && instruction.trim_end_sec != null) {
      return `Keep ${instruction.trim_start_sec.toFixed(2)}s-${instruction.trim_end_sec.toFixed(2)}s`;
    }
    if (instruction.trim_start_sec != null) {
      return `Trim start to ${instruction.trim_start_sec.toFixed(2)}s`;
    }
    if (instruction.trim_end_sec != null) {
      return `Trim end to ${instruction.trim_end_sec.toFixed(2)}s`;
    }
    return "Trim timing staged";
  }
  return null;
}

export function StagedEditsPanel(props: StagedEditsPanelProps): JSX.Element {
  const stagedInstructionCount = props.instructions.length;
  const stagedEditGroups = useMemo<StagedEditGroup[]>(
    () => {
      const instructionsByType = new Map<HammerEditInstruction["type"], HammerEditInstruction[]>();

      for (const instruction of props.instructions) {
        const existing = instructionsByType.get(instruction.type);
        if (existing) {
          existing.push(instruction);
          continue;
        }
        instructionsByType.set(instruction.type, [instruction]);
      }

      return STAGED_EDIT_GROUP_ORDER.reduce<StagedEditGroup[]>((groups, type) => {
        const instructions = instructionsByType.get(type);
        if (!instructions || instructions.length === 0) {
          return groups;
        }

        const sortedInstructions = [...instructions].sort((left, right) => {
          const leftKey = getStagedEditInstructionSortKey(left, props.segmentIndexById);
          const rightKey = getStagedEditInstructionSortKey(right, props.segmentIndexById);
          if (leftKey !== rightKey) {
            return leftKey - rightKey;
          }
          return left.created_at.localeCompare(right.created_at);
        });

        groups.push({
          type,
          title: formatStagedEditGroupTitle(type),
          instructions: sortedInstructions,
        });
        return groups;
      }, []);
    },
    [props.instructions, props.segmentIndexById],
  );

  return (
    <div className="hammer-staged-edits">
      <div className="hammer-staged-edits__header">
        <strong className="hammer-staged-edits__title">Staged Edits</strong>
        <span className="hammer-pill">{formatStagedEditCountLabel(stagedInstructionCount)}</span>
      </div>
      {stagedInstructionCount === 0 ? (
        <div className="hammer-staged-edits__empty">
          <div className="hammer-copy-strong">No staged edits yet.</div>
          <div className="hammer-copy-sm hammer-copy-muted">
            Select a segment and use the tool panel to stage changes.
          </div>
        </div>
      ) : (
        <>
          <div className="hammer-staged-edits__groups">
            {stagedEditGroups.map((group) => (
              <section key={group.type} className="hammer-staged-edits__group">
                <div className="hammer-staged-edits__group-head">
                  <div className="hammer-staged-edits__group-title">{group.title}</div>
                  <span className="hammer-staged-edits__group-count">
                    {formatStagedEditGroupCountLabel(group.instructions.length)}
                  </span>
                </div>
                <div className="hammer-staged-edits__items">
                  {group.instructions.map((instruction) => {
                    const context = formatStagedEditInstructionContext(instruction, props.segmentById);
                    const detail = formatInstructionDetail(instruction);
                    return (
                      <div key={instruction.instruction_id} className="hammer-staged-edits__item">
                        <button
                          type="button"
                          onClick={() => props.onNavigateToInstruction(instruction)}
                          className="hammer-staged-edits__item-button"
                        >
                          <div className="hammer-staged-edits__item-main">
                            <div className="hammer-staged-edits__item-label">
                              {formatStagedEditInstructionLabel(instruction, props.segmentIndexById)}
                            </div>
                            {context ? (
                              <div className="hammer-staged-edits__item-context">{context}</div>
                            ) : null}
                            {detail ? (
                              <div className="hammer-staged-edits__item-detail">{detail}</div>
                            ) : null}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onUndoInstruction(instruction.instruction_id)}
                          className="hammer-button-xs"
                        >
                          Undo
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className="hammer-staged-edits__footer">
            <button
              type="button"
              onClick={() => props.onClearAll()}
              className="hammer-button-xs"
            >
              Clear All
            </button>
          </div>
        </>
      )}
    </div>
  );
}
