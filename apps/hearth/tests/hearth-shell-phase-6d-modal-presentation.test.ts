import assert from "node:assert/strict";
import test from "node:test";
import type { ProductionDefaults } from "../src/domain/compose";
import { buildHearthModalViewModel } from "../src/routes/hearth-shell/buildHearthModalViewModel";
import type { HearthModalViewModelInput } from "../src/routes/hearth-shell/hearth-modal-contracts";

const defaults: ProductionDefaults = {
  defaultSpeakerCount: 2,
  defaultSpeakers: ["s1", "s2"],
  defaultMode: "outline_by_speaker",
  defaultTargetSpeaker: null,
  assumeStandardUnlessOverridden: true,
};

function input(): HearthModalViewModelInput {
  const noop = () => {};
  return {
    composeModalOpen: false,
    productionDefaults: defaults,
    onCloseComposeModal: noop,
    onComposeSetupSubmit: noop,
    revisionModalOpen: false,
    revisionKind: "manual",
    onRevisionKindChange: noop,
    revisionNote: "",
    onRevisionNoteChange: noop,
    closeRevisionModal: noop,
    onConfirmRevision: noop,
    activeDraftId: null,
  };
}

test("inactive modal state passes through without inventing a visible modal", () => {
  const result = buildHearthModalViewModel(input());
  assert.equal(result.composeModalOpen, false);
  assert.equal(result.revisionModalOpen, false);
  assert.equal(Object.isFrozen(result), true);
});

test("compose state, defaults, and commands pass through by identity", () => {
  const source = { ...input(), composeModalOpen: true };
  const result = buildHearthModalViewModel(source);
  assert.equal(result.composeModalOpen, true);
  assert.equal(result.productionDefaults, source.productionDefaults);
  assert.equal(result.onCloseComposeModal, source.onCloseComposeModal);
  assert.equal(result.onComposeSetupSubmit, source.onComposeSetupSubmit);
});

test("revision form state and commands pass through without selecting authority", () => {
  const source: HearthModalViewModelInput = {
    ...input(),
    revisionModalOpen: true,
    revisionKind: "milestone",
    revisionNote: "Approved structure",
    activeDraftId: "draft-1",
  };
  const result = buildHearthModalViewModel(source);
  assert.equal(result.revisionModalOpen, true);
  assert.equal(result.revisionKind, "milestone");
  assert.equal(result.revisionNote, "Approved structure");
  assert.equal(result.hasActiveDraft, true);
  assert.equal(result.onConfirmRevision, source.onConfirmRevision);
  assert.equal("selectedRevision" in result, false);
  assert.equal("approved" in result, false);
});

test("revision disabled presentation derives only from supplied active identity", () => {
  const absent = buildHearthModalViewModel(input());
  const active = buildHearthModalViewModel({
    ...input(),
    activeDraftId: "draft-1",
  });
  assert.equal(absent.hasActiveDraft, false);
  assert.equal(active.hasActiveDraft, true);
});

test("supplied modal actions are not invoked during projection", () => {
  let calls = 0;
  const command = () => { calls += 1; };
  const result = buildHearthModalViewModel({
    ...input(),
    onCloseComposeModal: command,
    onConfirmRevision: command,
  });
  assert.equal(calls, 0);
  result.onCloseComposeModal();
  assert.equal(calls, 1);
});
