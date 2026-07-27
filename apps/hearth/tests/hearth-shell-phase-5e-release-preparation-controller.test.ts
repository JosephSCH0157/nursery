import assert from "node:assert/strict";
import test from "node:test";
import { buildHearthReleaseChecklist } from "../src/routes/hearth-shell/buildHearthReleaseChecklist";

const readyInput = {
  scriptAuthorityAvailable: true,
  hasApprovedScript: true,
  mediaAuthorityAvailable: true,
  mediaMapStatus: "activated" as const,
  metadataAuthorityAvailable: true,
  metadataComplete: true,
  thumbnailAuthorityAvailable: true,
  thumbnailsSelected: true,
};

test("the existing four canonical checks remain explicit", () => {
  const checklist = buildHearthReleaseChecklist(readyInput);
  assert.deepEqual(checklist.map((entry) => entry.id), ["script", "media_plan", "metadata", "thumbnail"]);
  assert.equal(checklist.every((entry) => entry.state === "complete"), true);
});

test("approved-script absence blocks without vacuous completion", () => {
  const checklist = buildHearthReleaseChecklist({ ...readyInput, hasApprovedScript: false });
  assert.equal(checklist.find((entry) => entry.id === "script")?.state, "incomplete");
  assert.equal(checklist.every((entry) => entry.state === "complete"), false);
});

test("authority unavailable remains distinct from incomplete", () => {
  const checklist = buildHearthReleaseChecklist({
    ...readyInput,
    mediaAuthorityAvailable: false,
    metadataAuthorityAvailable: false,
  });
  assert.equal(checklist.find((entry) => entry.id === "media_plan")?.state, "unavailable");
  assert.equal(checklist.find((entry) => entry.id === "metadata")?.state, "unavailable");
});

test("draft media status, incomplete metadata, and missing thumbnail all block", () => {
  const checklist = buildHearthReleaseChecklist({
    ...readyInput,
    mediaMapStatus: "draft",
    metadataComplete: false,
    thumbnailsSelected: false,
  });
  assert.equal(checklist.filter((entry) => entry.state === "incomplete").length, 3);
});

test("checklist derivation is immutable and does not add publishing state", () => {
  const checklist = buildHearthReleaseChecklist(readyInput);
  assert.equal(Object.isFrozen(checklist), true);
  assert.equal(checklist.some((entry) => "published" in entry || "scheduled" in entry), false);
});
