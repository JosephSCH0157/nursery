import assert from "node:assert/strict";
import { createSemanticEditPlanSignature } from "../src/lib/editPlanSignature";

{
  const baseline = [
    {
      instruction_id: "ins_delete_a",
      segment_id: "seg_001",
      type: "delete" as const,
      created_at: "2026-03-10T10:00:00.000Z",
    },
    {
      instruction_id: "ins_trim_a",
      segment_id: "seg_002",
      type: "trim" as const,
      trim_start_sec: 12.5,
      trim_end_sec: 15.25,
      created_at: "2026-03-10T10:00:01.000Z",
    },
  ];

  const restaged = [
    {
      instruction_id: "ins_trim_b",
      segment_id: "seg_002",
      type: "trim" as const,
      trim_start_sec: 12.5,
      trim_end_sec: 15.25,
      created_at: "2026-03-11T09:15:00.000Z",
    },
    {
      instruction_id: "ins_delete_b",
      segment_id: "seg_001",
      type: "delete" as const,
      created_at: "2026-03-11T09:15:01.000Z",
    },
  ];

  assert.equal(
    createSemanticEditPlanSignature("fixture:podcast_a", "edit-aware", baseline),
    createSemanticEditPlanSignature("fixture:podcast_a", "edit-aware", restaged),
  );
}

{
  const baseline = [
    {
      instruction_id: "ins_trim_a",
      segment_id: "seg_003",
      type: "trim" as const,
      trim_start_sec: 18.1,
      trim_end_sec: 20.4,
      created_at: "2026-03-10T10:00:00.000Z",
    },
  ];

  const changed = [
    {
      instruction_id: "ins_trim_b",
      segment_id: "seg_003",
      type: "trim" as const,
      trim_start_sec: 18.4,
      trim_end_sec: 20.4,
      created_at: "2026-03-11T10:00:00.000Z",
    },
  ];

  assert.notEqual(
    createSemanticEditPlanSignature("fixture:podcast_a", "edit-aware", baseline),
    createSemanticEditPlanSignature("fixture:podcast_a", "edit-aware", changed),
  );
}

console.log("Hammer semantic edit-plan signature tests passed.");
