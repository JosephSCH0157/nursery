import assert from "node:assert/strict";
import test from "node:test";
import {
  createHearthOperationAuthority,
  type HearthOperationScope,
} from "../src/lib/hearth-operation-authority";

const SCOPE_A: HearthOperationScope = {
  workspaceId: "workspace-a",
  workpieceId: "workpiece-a",
  draftId: "draft-a",
  draftVersion: 1,
  revisionId: null,
};

test("operation authority: context epochs prevent A-B-A identity collisions", () => {
  const authority = createHearthOperationAuthority(SCOPE_A, {
    createAuthorityId: () => "authority-a",
  });
  const fromFirstA = authority.begin("chat.reply");
  assert.equal(authority.isCurrent(fromFirstA), true);

  authority.updateScope({ ...SCOPE_A, workpieceId: "workpiece-b", draftId: "draft-b" });
  assert.equal(authority.isCurrent(fromFirstA), false);

  authority.updateScope(SCOPE_A);
  assert.equal(authority.isCurrent(fromFirstA), false);
  assert.equal(authority.isCurrent(authority.begin("chat.reply")), true);
});

test("operation authority: workspace and workpiece switches reject prior async completions", () => {
  const authority = createHearthOperationAuthority(SCOPE_A, {
    createAuthorityId: () => "authority-switch",
  });
  const fromWorkspaceA = authority.begin("workpiece.hydrate");

  authority.updateScope({
    ...SCOPE_A,
    workspaceId: "workspace-b",
    workpieceId: "workpiece-b",
    draftId: "draft-b",
  });
  assert.equal(authority.isCurrent(fromWorkspaceA), false);

  const fromWorkpieceB = authority.begin("workpiece.hydrate");
  authority.updateScope({
    ...SCOPE_A,
    workspaceId: "workspace-b",
    workpieceId: "workpiece-c",
    draftId: "draft-c",
  });
  const effects: string[] = [];
  assert.equal(authority.commit(fromWorkpieceB, () => effects.push("stale")), false);
  assert.deepEqual(effects, []);
});

test("operation authority: a newer request supersedes the older request in the same lane", () => {
  const authority = createHearthOperationAuthority(SCOPE_A, {
    createAuthorityId: () => "authority-a",
  });
  const first = authority.begin("thumbnail.generate");
  const second = authority.begin("thumbnail.generate");
  assert.equal(authority.isCurrent(first), false);
  assert.equal(authority.isCurrent(second), true);
});

test("operation authority: independent lanes do not supersede each other", () => {
  const authority = createHearthOperationAuthority(SCOPE_A, {
    createAuthorityId: () => "authority-a",
  });
  const chat = authority.begin("chat.reply");
  const thumbnail = authority.begin("thumbnail.generate");
  assert.equal(authority.isCurrent(chat), true);
  assert.equal(authority.isCurrent(thumbnail), true);
});

test("operation authority: draft and revision changes invalidate pending work", () => {
  const authority = createHearthOperationAuthority(SCOPE_A, {
    createAuthorityId: () => "authority-a",
  });
  const draftOperation = authority.begin("script.repair");
  authority.updateScope({ ...SCOPE_A, draftVersion: 2 });
  assert.equal(authority.isCurrent(draftOperation), false);

  const revisionOperation = authority.begin("revision.restore");
  authority.updateScope({ ...SCOPE_A, draftVersion: 2, revisionId: "revision-2" });
  assert.equal(authority.isCurrent(revisionOperation), false);
});

test("operation authority: tokens cannot cross producer recreation", () => {
  const first = createHearthOperationAuthority(SCOPE_A, {
    createAuthorityId: () => "authority-a",
  });
  const second = createHearthOperationAuthority(SCOPE_A, {
    createAuthorityId: () => "authority-b",
  });
  assert.equal(second.isCurrent(first.begin("chat.reply")), false);
});

test("operation authority: commit applies effects only for the exact current token", () => {
  const authority = createHearthOperationAuthority(SCOPE_A, {
    createAuthorityId: () => "authority-a",
  });
  const stale = authority.begin("chat.reply");
  const current = authority.begin("chat.reply");
  const effects: string[] = [];
  assert.equal(authority.commit(stale, () => { effects.push("stale"); }), false);
  assert.equal(authority.commit(current, () => { effects.push("current"); }), true);
  assert.deepEqual(effects, ["current"]);
});
