import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHearthPlanningSessionDocument,
  normalizeHearthPlanningSessionDocument,
} from "../src/lib/hearth-session-repo";

test("hearth session repo: normalizes visual provider override from session documents", () => {
  const session = normalizeHearthPlanningSessionDocument({
    schema: "forge.hearth.session.v1",
    workpiece_id: "123e4567-e89b-12d3-a456-426614174000",
    workspace_id: "123e4567-e89b-12d3-a456-426614174001",
    created_at: "2026-03-31T10:00:00.000Z",
    updated_at: "2026-03-31T10:05:00.000Z",
    visual_provider_override: "openart",
  });

  assert.equal(session?.visual_provider_override, "openart");
});

test("hearth session repo: strips unknown visual provider overrides on write", () => {
  const built = buildHearthPlanningSessionDocument({
    schema: "forge.hearth.session.v1",
    created_at: "2026-03-31T10:00:00.000Z",
    updated_at: "2026-03-31T10:05:00.000Z",
    visual_provider_override: "mystery-provider" as never,
  }, "123e4567-e89b-12d3-a456-426614174001", "123e4567-e89b-12d3-a456-426614174000");

  assert.equal(built.visual_provider_override, null);
});

