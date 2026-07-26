import assert from "node:assert/strict";
import test from "node:test";
import type { HearthWorkpiecePresence } from "../src/lib/hearth-presence";
import {
  deriveHearthPresenceLoadStatus,
  orderHearthPresenceParticipants,
} from "../src/routes/hearth-shell/buildHearthPresenceViewModel";
import { buildHearthPresenceController } from "../src/routes/hearth-shell/useHearthPresenceController";

const participant = (
  userId: string,
  mode: "viewing" | "editing",
): HearthWorkpiecePresence => ({
  workspaceId: "11111111-1111-4111-8111-111111111111",
  workpieceId: "22222222-2222-4222-8222-222222222222",
  userId,
  displayName: userId,
  mode,
  lastSeenAt: "2026-07-26T12:00:00.000Z",
});

test("zero participants remains distinct from failed presence loading", () => {
  assert.equal(deriveHearthPresenceLoadStatus("available", []), "empty");
  assert.equal(deriveHearthPresenceLoadStatus("failed", []), "failed");
  assert.equal(deriveHearthPresenceLoadStatus("unavailable", []), "failed");
});

test("participant projection preserves repository ordering", () => {
  const participants = [
    participant("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "viewing"),
    participant("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "editing"),
  ];
  assert.deepEqual(orderHearthPresenceParticipants(participants), participants);
});

test("controller exposes equivalent participant state to every indicator surface", () => {
  const participants = [participant("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "editing")];
  const controller = buildHearthPresenceController({
    participants,
    connection: "available",
    userId: null,
    displayName: "Local",
    mode: "viewing",
    editingParticipants: participants,
    viewingParticipants: [],
    clearPresence() {},
    refreshPresence() {},
    updateActivity() {},
    resolveWorkpiecePresenceBadge: () => "Editor editing",
    resolveWorkpiecePresenceClass: () => "is-editing",
  });
  assert.equal(controller.state.participants, participants);
  assert.equal(controller.surface.editingParticipants, participants);
  assert.equal(controller.status.load, "loaded");
});

test("presence contract contains no locking or canonical authority", () => {
  const controller = buildHearthPresenceController({
    participants: [],
    connection: "available",
    userId: null,
    displayName: "Local",
    mode: "viewing",
    editingParticipants: [],
    viewingParticipants: [],
    clearPresence() {},
    refreshPresence() {},
    updateActivity() {},
    resolveWorkpiecePresenceBadge: () => "Idle",
    resolveWorkpiecePresenceClass: () => "is-idle",
  });
  assert.equal("lock" in controller, false);
  assert.equal("approval" in controller, false);
  assert.equal("script" in controller, false);
  assert.equal("ready" in controller, false);
});

test("clear and retry remain explicit operational commands", () => {
  let clears = 0;
  let refreshes = 0;
  const controller = buildHearthPresenceController({
    participants: [],
    connection: "failed",
    userId: null,
    displayName: "Local",
    mode: "viewing",
    editingParticipants: [],
    viewingParticipants: [],
    clearPresence: () => { clears += 1; },
    refreshPresence: () => { refreshes += 1; },
    updateActivity() {},
    resolveWorkpiecePresenceBadge: () => "Presence unavailable",
    resolveWorkpiecePresenceClass: () => "is-unavailable",
  });
  controller.commands.clearPresence();
  controller.commands.retryPresence();
  assert.equal(clears, 1);
  assert.equal(refreshes, 1);
});
