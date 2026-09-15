import assert from "node:assert/strict";
import { test } from "node:test";
import { assertCanonicalReadyCandidates } from "./hearth-phase4-assertions.ts";

const workspace = "5361f0b0-c2e7-591e-8805-e33310896027";
const alpha = "d1a9e8b7-501c-5696-849e-5c85e4ee1fd0";
const beta = "0b52a0e4-ad3d-525d-afac-accf9ff44d6a";
const handoff = "d0c669b4-5bb4-5f32-8b62-49903c4359c2";
const row = (id: string, title: string) => ({
  workspace_id: workspace, workpiece_id: id, title,
  path: "script/script.md", primary_script_path: "script/script.md", hidden_at: null as string | null,
});
const initial = [row(beta, "Beta"), row(alpha, "Alpha")];
const next = row(handoff, "Hearth authenticated handoff");
const authority = {
  workspaceId: workspace, requiredWorkpieceIds: [alpha, beta], hiddenWorkpieceIds: [] as string[], hiddenTitles: [] as string[],
};
const options = (rows = initial) => rows.map((item) => ({ value: `ready:${item.workpiece_id}:${item.path}`, title: item.title }));
const payload = (rows = initial) => ({ ok: true, data: rows });

test("initial Alpha/Beta matches canonical identities, regardless of display order", () => {
  assertCanonicalReadyCandidates(payload(), options().reverse(), authority);
});

test("legitimate handoff Ready state is included only when current canonical authority includes it", () => {
  const rows = [next, ...initial];
  assertCanonicalReadyCandidates({ ok: true, data: { scripts: rows } }, options(rows), authority);
});

test("extra rendered candidate absent from canonical response fails even with a seeded title", () => {
  assert.throws(() => assertCanonicalReadyCandidates(payload(), [...options(), ...options([row(handoff, "Alpha")])], authority));
});

test("missing canonical candidate fails", () => {
  assert.throws(() => assertCanonicalReadyCandidates(payload([next, ...initial]), options(), authority));
});

test("duplicates are not deduplicated away", () => {
  assert.throws(() => assertCanonicalReadyCandidates(payload(), [...options(), options()[0]!], authority));
  assert.throws(() => assertCanonicalReadyCandidates(payload([...initial, initial[0]!]), options(), authority));
});

test("hidden candidates fail whether leaked by response or only by UI", () => {
  const hidden = { ...next, hidden_at: "2026-09-15T00:00:00Z" };
  assert.throws(() => assertCanonicalReadyCandidates(payload([hidden, ...initial]), options([hidden, ...initial]), authority));
  assert.throws(() => assertCanonicalReadyCandidates(payload(), options([hidden, ...initial]), authority));
  assert.throws(() => assertCanonicalReadyCandidates(payload([next, ...initial]), options([next, ...initial]), {
    ...authority, hiddenWorkpieceIds: [handoff],
  }));
  assert.throws(() => assertCanonicalReadyCandidates(payload([next, ...initial]), options([next, ...initial]), {
    ...authority, hiddenTitles: [next.title],
  }));
});

test("foreign-workspace authority cannot legitimize an extra rendered candidate", () => {
  const foreign = { ...next, workspace_id: "11111111-1111-4111-8111-111111111111" };
  assert.throws(() => assertCanonicalReadyCandidates(payload([foreign, ...initial]), options([foreign, ...initial]), authority));
  assert.throws(() => assertCanonicalReadyCandidates(payload(), options([foreign, ...initial]), authority));
});

test("current response cannot silently drop required Alpha or Beta", () => {
  assert.throws(() => assertCanonicalReadyCandidates(payload([initial[0]!]), options([initial[0]!]), authority));
});

test("canonical script path is part of the identity, not just the title", () => {
  const rendered = options();
  rendered[0]!.value = `ready:${beta}:script/stale.md`;
  assert.throws(() => assertCanonicalReadyCandidates(payload(), rendered, authority));
});

test("Ready display decoration does not change canonical identity", () => {
  assertCanonicalReadyCandidates(payload(), options().map((item) => ({ ...item, title: `${item.title} — Ready by Fixture User` })), authority);
});

test("malformed or unsuccessful canonical responses fail closed", () => {
  for (const invalid of [null, { ok: false, data: initial }, { ok: true, data: {} }, payload([{ ...next, workspace_id: undefined } as unknown as typeof next])]) {
    assert.throws(() => assertCanonicalReadyCandidates(invalid, options(), authority));
  }
});
