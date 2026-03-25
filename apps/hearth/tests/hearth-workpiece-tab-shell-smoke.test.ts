import assert from "node:assert/strict";
import {
  normalizeWorkpieceWorkspaceTab,
  resolveHistoryMilestoneMarker,
  resolveMediaPlanCoverageLevel,
  resolveMediaPlanScopeLabel,
  resolveReleaseReadinessChecklist,
  resolveRestoredWorkpieceWorkspaceTab,
} from "../src/lib/hearth-workpiece-tab-shell";

function run(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`[ok] ${name}`);
  } catch (error) {
    console.error(`[fail] ${name}`);
    throw error;
  }
}

run("restores workpiece tab with workspace and global fallback", () => {
  assert.equal(resolveRestoredWorkpieceWorkspaceTab({
    workpieceTab: "visuals",
    workspaceTab: "release",
    lastTab: "history",
  }), "visuals");
  assert.equal(resolveRestoredWorkpieceWorkspaceTab({
    workpieceTab: "script",
    workspaceTab: "release",
    lastTab: "history",
  }), "script");
  assert.equal(resolveRestoredWorkpieceWorkspaceTab({
    workpieceTab: "retired_tab",
    workspaceTab: "metadata",
    lastTab: "history",
  }), "metadata");
  assert.equal(resolveRestoredWorkpieceWorkspaceTab({
    workpieceTab: "retired_tab",
    workspaceTab: "removed_tab",
    lastTab: "history",
  }), "history");
  assert.equal(resolveRestoredWorkpieceWorkspaceTab({
    workpieceTab: "retired_tab",
    workspaceTab: "removed_tab",
    lastTab: "unknown",
  }), "script");
});

run("normalizes keyboard tab targets during rapid switching", () => {
  const rapidInputs = ["1", "2", "x", "release", "HISTORY", "4", "legacy"] as const;
  const mapped = rapidInputs.map((input) => normalizeWorkpieceWorkspaceTab(input));
  assert.deepEqual(mapped, ["script", "script", "script", "release", "history", "script", "script"]);
});

run("reflects media plan activation and coverage", () => {
  const entries = [
    { final_media_kind: "image", source: { status: "selected" } },
    { final_media_kind: "b_roll", source: { status: "attached" } },
    { final_media_kind: "contextual_data_composite", source: { status: "unresolved" } },
  ] as any[];
  assert.equal(resolveMediaPlanCoverageLevel(entries as any), "MEDIUM");
  assert.equal(resolveMediaPlanScopeLabel(entries as any), "Full Plan");
  const readiness = resolveReleaseReadinessChecklist({
    hasApprovedScript: true,
    mediaMapStatus: "activated",
    metadataComplete: true,
    thumbnailsSelected: false,
  });
  assert.deepEqual(readiness, { completeCount: 3, totalCount: 4 });
});

run("updates history marker when milestone revision exists", () => {
  assert.equal(resolveHistoryMilestoneMarker([]), "No milestone");
  assert.equal(resolveHistoryMilestoneMarker([
    { id: "a", draftId: "d", createdAt: 100, titleSnapshot: "", bodySnapshot: "", kind: "manual" },
    { id: "b", draftId: "d", createdAt: 200, titleSnapshot: "", bodySnapshot: "", kind: "milestone" },
  ] as any), "Milestone 200");
});
