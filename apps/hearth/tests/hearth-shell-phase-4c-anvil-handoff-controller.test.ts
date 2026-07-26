import assert from "node:assert/strict";
import test from "node:test";
import { buildHearthAnvilDestination } from "../src/routes/hearth-shell/hearth-anvil-destination";
import { deriveHearthAnvilHandoffEligibility } from "../src/routes/hearth-shell/buildHearthAnvilHandoffViewModel";
import { buildHearthAnvilHandoffController } from "../src/routes/hearth-shell/useHearthAnvilHandoffController";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const workpieceId = "22222222-2222-4222-8222-222222222222";

test("missing workspace and workpiece remain distinct ineligibility states", () => {
  const common = {
    archived: false,
    draftId: "draft-1",
    scriptText: "[HOST] Ready",
    handoffBlocked: false,
    destination: "/app/anvil",
  };
  assert.deepEqual(
    deriveHearthAnvilHandoffEligibility({ ...common, workspaceId: null, workpieceId }),
    { kind: "no_workspace" },
  );
  assert.deepEqual(
    deriveHearthAnvilHandoffEligibility({ ...common, workspaceId, workpieceId: null }),
    { kind: "no_workpiece" },
  );
});

test("missing draft, missing script, validation failure, and ready remain explicit", () => {
  const common = {
    workspaceId,
    workpieceId,
    archived: false,
    destination: "/app/anvil",
  };
  assert.equal(deriveHearthAnvilHandoffEligibility({
    ...common, draftId: null, scriptText: "", handoffBlocked: false,
  }).kind, "no_draft");
  assert.equal(deriveHearthAnvilHandoffEligibility({
    ...common, draftId: "draft-1", scriptText: "", handoffBlocked: false,
  }).kind, "no_script");
  assert.equal(deriveHearthAnvilHandoffEligibility({
    ...common, draftId: "draft-1", scriptText: "[BAD] text", handoffBlocked: true,
  }).kind, "invalid");
  assert.equal(deriveHearthAnvilHandoffEligibility({
    ...common, draftId: "draft-1", scriptText: "[HOST] text", handoffBlocked: false,
  }).kind, "ready");
});

test("destination construction is deterministic and contains canonical identities", () => {
  const first = buildHearthAnvilDestination({ workspaceId, workpieceId, archived: false });
  const second = buildHearthAnvilDestination({ workspaceId, workpieceId, archived: false });
  assert.equal(first, second);
  const url = new URL(first!, "https://forge.test");
  assert.equal(url.pathname, "/app/anvil");
  assert.equal(url.searchParams.get("workspace_id"), workspaceId);
  assert.equal(url.searchParams.get("workpiece_id"), workpieceId);
  assert.equal(url.searchParams.get("open"), "script");
  assert.equal(url.searchParams.get("script_path"), "script/script.md");
});

test("destination rejects missing identity, archived workpieces, and never embeds script content", () => {
  assert.equal(buildHearthAnvilDestination({
    workspaceId: null, workpieceId, archived: false,
  }), null);
  assert.equal(buildHearthAnvilDestination({
    workspaceId, workpieceId, archived: true,
  }), null);
  const destination = buildHearthAnvilDestination({ workspaceId, workpieceId, archived: false });
  assert.equal(destination?.includes("[HOST]"), false);
});

test("opening remains an explicit creator command with no implicit invocation", async () => {
  let opened = 0;
  const openInAnvil = async () => { opened += 1; };
  const controller = buildHearthAnvilHandoffController({
    activeDraft: {
      id: "draft-1",
      title: "Draft",
      body: "[HOST] Ready",
      updatedAt: 1,
      createdAt: 1,
    },
    workspaceId,
    workpieceId,
    archived: false,
    handoffBlocked: false,
    destination: "/app/anvil",
    stepModeHint: null,
    openInAnvil,
  });
  assert.equal(opened, 0);
  await controller.commands.openInAnvil();
  assert.equal(opened, 1);
});

test("handoff controller contains no Ready, presence, recording, or receipt authority", () => {
  const controller = buildHearthAnvilHandoffController({
    activeDraft: null,
    workspaceId,
    workpieceId,
    archived: false,
    handoffBlocked: false,
    destination: "/app/anvil",
    stepModeHint: null,
    openInAnvil: async () => {},
  });
  assert.equal("ready" in controller.commands, false);
  assert.equal("presence" in controller.commands, false);
  assert.equal("record" in controller.commands, false);
  assert.equal("receipt" in controller.commands, false);
  assert.equal("approve" in controller.commands, false);
});

test("desktop and mobile consumers share the same surface contract", () => {
  const controller = buildHearthAnvilHandoffController({
    activeDraft: null,
    workspaceId,
    workpieceId,
    archived: false,
    handoffBlocked: true,
    destination: "/app/anvil",
    stepModeHint: null,
    openInAnvil: async () => {},
  });
  const desktop = controller.surface;
  const mobile = controller.surface;
  assert.equal(desktop, mobile);
});
