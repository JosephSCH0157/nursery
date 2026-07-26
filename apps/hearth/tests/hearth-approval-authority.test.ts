import assert from "node:assert/strict";
import test from "node:test";
import { createDraft } from "../src/domain/draft";
import { createRevision, type Revision } from "../src/domain/revision";
import { commitCanonicalScriptApproval } from "../src/lib/hearth-approval-commit";
import {
  NO_CANONICAL_SCRIPT_APPROVAL,
  nextApprovedScriptVersion,
  resolveCanonicalScriptApproval,
} from "../src/lib/hearth-approval-authority";
import { LocalHearthStore } from "../src/storage/local-store";
import { TongsHearthStore } from "../src/storage/tongs-store";

const WORKPIECE_ID = "22222222-2222-4222-8222-222222222222";
const DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const COMMITTED_AT = "2026-07-11T21:00:00.000Z";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();
  get length(): number { return this.#values.size; }
  clear(): void { this.#values.clear(); }
  getItem(key: string): string | null { return this.#values.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.#values.keys())[index] ?? null; }
  removeItem(key: string): void { this.#values.delete(key); }
  setItem(key: string, value: string): void { this.#values.set(key, String(value)); }
}

function installStoreRuntime(fetchImpl?: typeof fetch): () => void {
  const runtime = globalThis as typeof globalThis & {
    window?: Window & typeof globalThis;
    localStorage?: Storage;
  };
  const previousWindow = runtime.window;
  const previousStorage = runtime.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = new MemoryStorage();
  runtime.window = {
    location: { search: `?workspace_id=${WORKSPACE_ID}&workpiece_id=${WORKPIECE_ID}&tongs_api_token=test-token` },
    localStorage: storage,
  } as unknown as Window & typeof globalThis;
  runtime.localStorage = storage;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  return () => {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) Reflect.deleteProperty(runtime, "window");
    else runtime.window = previousWindow;
    if (previousStorage === undefined) Reflect.deleteProperty(runtime, "localStorage");
    else runtime.localStorage = previousStorage;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function approvalRevision(version: number, createdAt: number, draftId = DRAFT_ID): Revision {
  return {
    ...createRevision({
      draftId,
      title: "Approved",
      body: "Approved body",
      kind: "milestone",
      note: `script_version_approved:v${version}`,
    }),
    createdAt,
  };
}

test("approval authority: canonical reload with zero approvals defeats any recovery claim", () => {
  assert.deepEqual(resolveCanonicalScriptApproval([], DRAFT_ID), NO_CANONICAL_SCRIPT_APPROVAL);
});

test("approval authority: local revision storage is explicitly recovery-only", async () => {
  const restore = installStoreRuntime();
  try {
    const store = new LocalHearthStore();
    const revision = approvalRevision(1, 100);
    const saved = await store.saveRevision(WORKPIECE_ID, revision);
    assert.equal(saved.kind, "recovery_only");
    const canonical = await store.readCanonicalRevisions(WORKPIECE_ID, DRAFT_ID);
    assert.equal(canonical.ok, false);
    assert.equal(canonical.kind, "unavailable");
    assert.equal((await store.listRevisions(WORKPIECE_ID, DRAFT_ID)).length, 1);
  } finally {
    restore();
  }
});

test("approval authority: Tongs revision writes return committed canonical evidence", async () => {
  const restore = installStoreRuntime(async (input, init) => {
    const url = String(input);
    if ((init?.method ?? "GET") === "GET" && url.includes("/read-file")) {
      return jsonResponse({ ok: true, exists: false }, 404);
    }
    if ((init?.method ?? "GET") === "POST" && url.includes("/commit-file")) {
      return jsonResponse({ ok: true, data: { file_row: { updated_at: COMMITTED_AT } } });
    }
    return jsonResponse({ ok: false }, 404);
  });
  try {
    const store = new TongsHearthStore();
    const saved = await store.saveRevision(WORKPIECE_ID, approvalRevision(1, 100));
    assert.deepEqual(saved, {
      ok: true,
      kind: "canonical",
      authority: "tongs",
      artifact: "revision_snapshot",
      workpieceId: WORKPIECE_ID,
      committedAt: COMMITTED_AT,
    });
    const canonical = await store.readCanonicalRevisions(WORKPIECE_ID, DRAFT_ID);
    assert.equal(canonical.ok, true);
  } finally {
    restore();
  }
});

test("approval authority: an unavailable canonical read never promotes revision fallback", async () => {
  const restore = installStoreRuntime(async () => jsonResponse({ ok: false }, 503));
  try {
    const local = new LocalHearthStore();
    await local.saveRevision(WORKPIECE_ID, approvalRevision(9, 900));
    const store = new TongsHearthStore();
    const canonical = await store.readCanonicalRevisions(WORKPIECE_ID, DRAFT_ID);
    assert.equal(canonical.ok, false);
    assert.equal(canonical.kind, "unavailable");
    assert.equal((await local.listRevisions(WORKPIECE_ID, DRAFT_ID)).length, 1);
  } finally {
    restore();
  }
});

test("approval authority: canonical revisions are draft-scoped and choose the latest approved version", () => {
  const revisions = [
    approvalRevision(7, 700, "different-draft"),
    approvalRevision(2, 200),
    approvalRevision(3, 300),
    approvalRevision(3, 350),
  ];
  assert.deepEqual(resolveCanonicalScriptApproval(revisions, DRAFT_ID), {
    hasApprovedScript: true,
    approvedScriptVersion: 3,
    approvedAt: 350,
  });
  assert.equal(nextApprovedScriptVersion(revisions.filter((revision) => revision.draftId === DRAFT_ID)), 4);
});

test("approval authority: the canonical approval marker is committed last", async () => {
  const order: string[] = [];
  const draft = { ...createDraft({ title: "Episode", body: "Canonical script" }), id: DRAFT_ID };
  const result = await commitCanonicalScriptApproval({
    episodeId: WORKPIECE_ID,
    draft,
    readCanonicalRevisions: async () => {
      order.push("read");
      return {
        ok: true,
        kind: "canonical",
        authority: "tongs",
        workpieceId: WORKPIECE_ID,
        fileUpdatedAt: null,
        revisions: [],
      };
    },
    nextApprovedVersion: nextApprovedScriptVersion,
    persistDraft: async () => {
      order.push("draft");
      return true;
    },
    publishScript: async () => {
      order.push("script");
      return true;
    },
    commitApprovalRevision: async (input) => {
      order.push("approval");
      assert.equal(input.approvalNote, "script_version_approved:v1");
      return { ok: true, approvedAt: 400 };
    },
  });

  assert.deepEqual(order, ["read", "draft", "script", "approval"]);
  assert.deepEqual(result, { ok: true, version: 1, approvedAt: 400 });
});

test("approval authority: unavailable canonical history prevents every approval mutation", async () => {
  const mutations: string[] = [];
  const draft = { ...createDraft({ title: "Episode", body: "Canonical script" }), id: DRAFT_ID };
  const result = await commitCanonicalScriptApproval({
    episodeId: WORKPIECE_ID,
    draft,
    readCanonicalRevisions: async () => ({
      ok: false,
      kind: "unavailable",
      authority: "none",
      reason: "request_failed",
      status: 503,
    }),
    nextApprovedVersion: nextApprovedScriptVersion,
    persistDraft: async () => { mutations.push("draft"); return true; },
    publishScript: async () => { mutations.push("script"); return true; },
    commitApprovalRevision: async () => { mutations.push("approval"); return { ok: true, approvedAt: 1 }; },
  });
  assert.deepEqual(result, { ok: false, stage: "canonical_read" });
  assert.deepEqual(mutations, []);
});

test("approval authority: failed script publication cannot leave an approval marker", async () => {
  const mutations: string[] = [];
  const draft = { ...createDraft({ title: "Episode", body: "Canonical script" }), id: DRAFT_ID };
  const result = await commitCanonicalScriptApproval({
    episodeId: WORKPIECE_ID,
    draft,
    readCanonicalRevisions: async () => ({
      ok: true,
      kind: "canonical",
      authority: "tongs",
      workpieceId: WORKPIECE_ID,
      fileUpdatedAt: null,
      revisions: [],
    }),
    nextApprovedVersion: nextApprovedScriptVersion,
    persistDraft: async () => { mutations.push("draft"); return true; },
    publishScript: async () => { mutations.push("script"); return false; },
    commitApprovalRevision: async () => { mutations.push("approval"); return { ok: true, approvedAt: 1 }; },
  });
  assert.deepEqual(result, { ok: false, stage: "script_publish" });
  assert.deepEqual(mutations, ["draft", "script"]);
});
