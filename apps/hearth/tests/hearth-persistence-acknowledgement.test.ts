import assert from "node:assert/strict";
import test from "node:test";
import { createDraft, type Draft } from "../src/domain/draft";
import { persistHearthDraft } from "../src/lib/hearth-draft-persistence";
import type { HearthDraftSaveAcknowledgement } from "../src/storage/hearth-store";
import { LocalHearthStore } from "../src/storage/local-store";
import { TongsHearthStore } from "../src/storage/tongs-store";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const WORKPIECE_ID = "22222222-2222-4222-8222-222222222222";
const COMMITTED_AT = "2026-07-11T20:00:00.000Z";

class MemoryStorage implements Storage {
  readonly #values = new Map<string, string>();
  get length(): number { return this.#values.size; }
  clear(): void { this.#values.clear(); }
  getItem(key: string): string | null { return this.#values.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.#values.keys())[index] ?? null; }
  removeItem(key: string): void { this.#values.delete(key); }
  setItem(key: string, value: string): void { this.#values.set(key, String(value)); }
}

function installPersistenceRuntime(fetchImpl?: typeof fetch): { storage: MemoryStorage; restore: () => void } {
  const runtime = globalThis as typeof globalThis & {
    window?: Window & typeof globalThis;
    localStorage?: Storage;
  };
  const previousWindow = runtime.window;
  const previousStorage = runtime.localStorage;
  const previousFetch = globalThis.fetch;
  const storage = new MemoryStorage();
  storage.setItem(`forge_hearth_script_workpiece_v1:${WORKSPACE_ID}`, WORKPIECE_ID);
  const windowStub = {
    location: {
      search: `?workspace_id=${WORKSPACE_ID}&workpiece_id=${WORKPIECE_ID}&tongs_api_token=test-token`,
    },
    localStorage: storage,
  } as unknown as Window & typeof globalThis;
  runtime.window = windowStub;
  runtime.localStorage = storage;
  if (fetchImpl) globalThis.fetch = fetchImpl;
  return {
    storage,
    restore: () => {
      globalThis.fetch = previousFetch;
      if (previousWindow === undefined) Reflect.deleteProperty(runtime, "window");
      else runtime.window = previousWindow;
      if (previousStorage === undefined) Reflect.deleteProperty(runtime, "localStorage");
      else runtime.localStorage = previousStorage;
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("persistence acknowledgement: the local store reports recovery-only evidence", async () => {
  const runtime = installPersistenceRuntime();
  try {
    const result = await new LocalHearthStore().saveDraft(createDraft({ title: "Local", body: "Recovery" }));
    assert.deepEqual(result, {
      ok: false,
      kind: "recovery_only",
      authority: "browser_cache",
      artifact: "draft_snapshot",
      reason: "local_store",
      status: null,
    });
  } finally {
    runtime.restore();
  }
});

test("persistence acknowledgement: an explicit Tongs commit produces canonical evidence", async () => {
  const calls: string[] = [];
  const runtime = installPersistenceRuntime(async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/tongs/cradles")) {
      return jsonResponse({ ok: true, data: { id: WORKPIECE_ID } });
    }
    if (url.includes(`/tongs/workpieces/${WORKPIECE_ID}/commit-file`)) {
      return jsonResponse({ ok: true, data: { file_row: { updated_at: COMMITTED_AT } } });
    }
    return jsonResponse({ ok: false }, 404);
  });
  try {
    const draft = { ...createDraft({ title: "Canonical", body: "Acknowledged" }), id: WORKPIECE_ID };
    const result = await new TongsHearthStore().saveDraft(draft);
    assert.deepEqual(result, {
      ok: true,
      kind: "canonical",
      authority: "tongs",
      artifact: "draft_snapshot",
      workspaceId: WORKSPACE_ID,
      workpieceId: WORKPIECE_ID,
      committedAt: COMMITTED_AT,
    });
    assert.equal(calls.length, 1);
  } finally {
    runtime.restore();
  }
});

test("persistence acknowledgement: a generic ok without committed artifact metadata is not canonical", async () => {
  const runtime = installPersistenceRuntime(async (input) => {
    const url = String(input);
    if (url.endsWith("/tongs/cradles")) {
      return jsonResponse({ ok: true, data: { id: WORKPIECE_ID } });
    }
    if (url.includes(`/tongs/workpieces/${WORKPIECE_ID}/commit-file`)) {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ ok: false }, 404);
  });
  try {
    const draft = { ...createDraft({ title: "Ambiguous", body: "No file row" }), id: WORKPIECE_ID };
    const result = await new TongsHearthStore().saveDraft(draft);
    assert.deepEqual(result, {
      ok: false,
      kind: "recovery_only",
      authority: "browser_cache",
      artifact: "draft_snapshot",
      reason: "canonical_response_invalid",
      status: 200,
    });
  } finally {
    runtime.restore();
  }
});

test("persistence acknowledgement: request failure preserves recovery evidence without claiming success", async () => {
  const runtime = installPersistenceRuntime(async (input) => {
    const url = String(input);
    if (url.endsWith("/tongs/cradles")) {
      return jsonResponse({ ok: true, data: { id: WORKPIECE_ID } });
    }
    throw new TypeError("network unavailable");
  });
  try {
    const draft = { ...createDraft({ title: "Offline", body: "Recovery copy" }), id: WORKPIECE_ID };
    const result = await new TongsHearthStore().saveDraft(draft);
    assert.equal(result.ok, false);
    assert.equal(result.kind, "recovery_only");
    if (result.ok) assert.fail("A failed request cannot carry canonical acknowledgement.");
    assert.equal(result.reason, "canonical_request_failed");
    assert.match(runtime.storage.getItem("hearth:tongs:cache:v1") ?? "", new RegExp(WORKPIECE_ID));
  } finally {
    runtime.restore();
  }
});

function createPersistenceDeps(
  acknowledgement: HearthDraftSaveAcknowledgement,
  observed: {
    activeDraftWrites: Draft[];
    snapshotWrites: unknown[];
    draftListWrites: number;
    sessionWrites: number;
    errors: Array<string | null>;
  },
) {
  const draftRef = { current: null as Draft | null };
  return {
    mode: "focus" as const,
    focusTab: "draft" as const,
    revisionView: "list" as const,
    hearthUser: { userId: "user-a", displayName: "Creator" },
    evaluateScriptValidation: (rawText: string) => ({
      normalizedText: rawText,
      validation: { ok: true, issues: [], normalizedText: rawText },
    }),
    buildValidationReport: () => "",
    normalizeTitle: (value: string) => value.trim(),
    buildDraftAttribution: () => ({ userId: "user-a", displayName: "Creator" }),
    buildPersistedValidationMeta: () => null,
    resolveRevisionWorkpieceId: () => WORKPIECE_ID,
    reportRevisionPersistenceWarning: () => undefined,
    refreshRevisions: async () => [],
    persistSession: async () => { observed.sessionWrites += 1; },
    syncSources: () => undefined,
    syncSessionToTongs: async () => undefined,
    dedupeDraftListById: (drafts: Draft[]) => drafts,
    draftEditVersionRef: { current: 1 },
    activeDraftRef: draftRef,
    store: {
      saveRevision: async () => ({
        ok: true as const,
        kind: "canonical" as const,
        authority: "tongs" as const,
        artifact: "revision_snapshot" as const,
        workpieceId: WORKPIECE_ID,
        committedAt: COMMITTED_AT,
      }),
      saveDraft: async () => acknowledgement,
    },
    setIsSaving: () => undefined,
    setDraftConflictState: () => undefined,
    setError: (next: string | null) => { observed.errors.push(next); },
    setScriptValidation: () => undefined,
    setAiAutosaveWarning: () => undefined,
    setAiRuntimeWarning: () => undefined,
    setActiveDraft: (next: Draft | ((previous: Draft | null) => Draft | null)) => {
      const resolved = typeof next === "function" ? next(draftRef.current) : next;
      draftRef.current = resolved;
      if (resolved) observed.activeDraftWrites.push(resolved);
    },
    setDraftSnapshot: (next: unknown) => { observed.snapshotWrites.push(next); },
    setDrafts: () => { observed.draftListWrites += 1; },
    setSelectedRevision: () => undefined,
    setRevisionView: () => undefined,
  };
}

test("persistence acknowledgement: recovery-only completion cannot advance saved draft state", async () => {
  const observed = {
    activeDraftWrites: [] as Draft[],
    snapshotWrites: [] as unknown[],
    draftListWrites: 0,
    sessionWrites: 0,
    errors: [] as Array<string | null>,
  };
  const draft = { ...createDraft({ title: "Not acknowledged", body: "Recovery only" }), id: WORKPIECE_ID };
  const saved = await persistHearthDraft({
    draft,
    updatedAt: draft.updatedAt + 1,
    createRevision: null,
  }, createPersistenceDeps({
    ok: false,
    kind: "recovery_only",
    authority: "browser_cache",
    artifact: "draft_snapshot",
    reason: "canonical_commit_failed",
    status: 503,
  }, observed));

  assert.equal(saved, false);
  assert.equal(observed.activeDraftWrites.length, 0);
  assert.equal(observed.snapshotWrites.length, 0);
  assert.equal(observed.draftListWrites, 0);
  assert.equal(observed.sessionWrites, 0);
  assert.match(observed.errors.at(-1) ?? "", /Tongs did not acknowledge/i);
});

test("persistence acknowledgement: canonical completion alone advances saved draft state", async () => {
  const observed = {
    activeDraftWrites: [] as Draft[],
    snapshotWrites: [] as unknown[],
    draftListWrites: 0,
    sessionWrites: 0,
    errors: [] as Array<string | null>,
  };
  const draft = { ...createDraft({ title: "Acknowledged", body: "Canonical" }), id: WORKPIECE_ID };
  const saved = await persistHearthDraft({
    draft,
    updatedAt: draft.updatedAt + 1,
    createRevision: null,
  }, createPersistenceDeps({
    ok: true,
    kind: "canonical",
    authority: "tongs",
    artifact: "draft_snapshot",
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    committedAt: COMMITTED_AT,
  }, observed));

  assert.equal(saved, true);
  assert.equal(observed.activeDraftWrites.length, 1);
  assert.equal(observed.snapshotWrites.length, 1);
  assert.equal(observed.draftListWrites, 1);
  assert.equal(observed.sessionWrites, 1);
});
