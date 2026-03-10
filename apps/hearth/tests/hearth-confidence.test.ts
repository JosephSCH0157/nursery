import assert from "node:assert/strict";
import {
  createEmptyRevisionSnapshot,
  revisionToEntry,
  type HearthRevisionSnapshot,
} from "../src/lib/hearth-revisions-contract";
import { LocalHearthStore } from "../src/storage/local-store";
import { LocalSessionStore } from "../src/storage/local-session-store";
import {
  loadRevisionSnapshotFallback,
  saveRevisionSnapshotFallback,
} from "../src/storage/revision-storage";
import { TongsHearthStore } from "../src/storage/tongs-store";
import type { Draft } from "../src/domain/draft";
import type { Revision } from "../src/domain/revision";
import { applyHearthOps, buildEpisodeContext } from "../src/lib/hearth-ai-ops";
import { requestHearthChatReply } from "../src/lib/hearth-chat-api";
import { formatScriptToAnvilTagsNoAi, validateAnvilTagContract } from "../src/lib/anvil-tag-contract";

class MemoryStorage {
  private store = new Map<string, string>();

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  get length() {
    return this.store.size;
  }
}

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function resetLocalStorage(): LocalStorageLike {
  const storage = new MemoryStorage();
  storage.setItem("forge_tongs_api_token_v1", "DEV_TOKEN");
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: {
      localStorage: storage,
      location: { search: "" },
    },
    configurable: true,
  });
  return storage;
}

function createDraft(id: string, overrides?: Partial<Draft>): Draft {
  const now = Date.now();
  return {
    id,
    title: "Draft",
    body: "Body",
    createdAt: now,
    updatedAt: now,
    revisionCount: 0,
    lastRevisionAt: undefined,
    archived: false,
    pinned: false,
    ...overrides,
  };
}

function createRevision(id: string, draftId: string, createdAt: number): Revision {
  return {
    id,
    draftId,
    createdAt,
    titleSnapshot: "Title",
    bodySnapshot: "Body",
    kind: "manual",
    note: "Note",
  };
}

const WORKPIECE_A = "2980fc39-8c8b-489a-a900-8d3bd3248432";
const WORKPIECE_B = "54d58d65-7abf-4d50-b17f-5905f4b1ee61";

function buildRevisionSnapshot(workpieceId: string, revisions: Revision[]): HearthRevisionSnapshot {
  return {
    ...createEmptyRevisionSnapshot(workpieceId),
    updated_at: new Date().toISOString(),
    revisions: revisions.map((revision) => revisionToEntry(revision)),
  };
}

function installTongsRevisionFetchHarness(options?: { failReads?: boolean }) {
  const originalFetch = globalThis.fetch;
  const files = new Map<string, { json: unknown; updatedAt: string }>();
  let sequence = 0;

  const keyFor = (workpieceId: string, path: string) => `${workpieceId}:${path}`;
  const nextUpdatedAt = () => {
    sequence += 1;
    return new Date(Date.UTC(2026, 2, 10, 12, 0, sequence)).toISOString();
  };

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const rawUrl = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : String(input);
    const url = new URL(rawUrl, "https://example.test");
    const match = url.pathname.match(/^\/tongs\/workpieces\/([^/]+)\/(read-file|commit-file)$/);
    if (!match) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const workpieceId = decodeURIComponent(match[1] ?? "");
    const action = match[2];
    if (action === "read-file") {
      if (options?.failReads) {
        return new Response(JSON.stringify({ ok: false }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      const path = url.searchParams.get("path") ?? "";
      const found = files.get(keyFor(workpieceId, path));
      if (!found) {
        return new Response(JSON.stringify({ ok: true, exists: false }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        data: found.json,
        file_row: { updated_at: found.updatedAt },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    const body = init?.body ? JSON.parse(String(init.body)) as {
      path?: string;
      json?: unknown;
      expected_previous_updated_at?: string;
    } : {};
    const path = typeof body.path === "string" ? body.path : "";
    const existing = files.get(keyFor(workpieceId, path));
    if (body.expected_previous_updated_at && existing && existing.updatedAt !== body.expected_previous_updated_at) {
      return new Response(JSON.stringify({
        error: {
          code: "file_conflict",
          details: {
            path,
            expected_previous_updated_at: body.expected_previous_updated_at,
            current_updated_at: existing.updatedAt,
          },
        },
      }), {
        status: 409,
        headers: { "content-type": "application/json" },
      });
    }

    const updatedAt = nextUpdatedAt();
    files.set(keyFor(workpieceId, path), { json: body.json ?? null, updatedAt });
    return new Response(JSON.stringify({
      ok: true,
      data: { file_row: { updated_at: updatedAt } },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    restore() {
      globalThis.fetch = originalFetch;
    },
    setSnapshot(workpieceId: string, snapshot: HearthRevisionSnapshot) {
      files.set(keyFor(workpieceId, "hearth/revisions.v1.json"), {
        json: snapshot,
        updatedAt: nextUpdatedAt(),
      });
    },
  };
}

async function testDraftFlagsRoundtrip() {
  resetLocalStorage();
  const store = new LocalHearthStore();
  const draft = createDraft("draft-flags", { pinned: true, archived: true });
  await store.saveDraft(draft);

  const loaded = await store.getDraft(draft.id);
  assert.ok(loaded, "Draft should load");
  assert.equal(loaded?.pinned, true, "Pinned flag should roundtrip");
  assert.equal(loaded?.archived, true, "Archived flag should roundtrip");
}

async function testRevisionCap() {
  resetLocalStorage();
  const store = new LocalHearthStore();
  const draft = createDraft("draft-rev");
  await store.saveDraft(draft);

  for (let i = 0; i < 201; i += 1) {
    await store.saveRevision(WORKPIECE_A, createRevision(`rev-${i}`, draft.id, 1000 + i));
  }

  const revisions = await store.listRevisions(WORKPIECE_A, draft.id);
  assert.equal(revisions.length, 200, "Should cap revisions at 200");
  assert.equal(revisions[0]?.id, "rev-200", "Newest revision should be first");
  assert.equal(revisions[revisions.length - 1]?.id, "rev-1", "Oldest should be pruned");
}

async function testTongsRevisionRoundtrip() {
  resetLocalStorage();
  const harness = installTongsRevisionFetchHarness();
  const store = new TongsHearthStore();

  try {
    const revision = createRevision("rev-remote", "draft-remote", 1_000);
    await store.saveRevision(WORKPIECE_A, revision);

    const revisions = await store.listRevisions(WORKPIECE_A, revision.draftId);
    assert.equal(revisions.length, 1, "Tongs-backed revision should roundtrip");
    assert.equal(revisions[0]?.id, revision.id, "Saved revision should load from canonical snapshot");

    const restored = await store.restoreRevision(WORKPIECE_A, revision.id);
    assert.equal(restored?.title, revision.titleSnapshot, "Restore should read canonical title snapshot");
    assert.equal(restored?.body, revision.bodySnapshot, "Restore should read canonical body snapshot");
  } finally {
    harness.restore();
  }
}

async function testTongsRevisionIsolationByWorkpiece() {
  resetLocalStorage();
  const harness = installTongsRevisionFetchHarness();
  const store = new TongsHearthStore();

  try {
    await store.saveRevision(WORKPIECE_A, createRevision("rev-a", "draft-a", 1_000));
    await store.saveRevision(WORKPIECE_B, createRevision("rev-b", "draft-b", 2_000));

    const revisionsA = await store.listRevisions(WORKPIECE_A);
    const revisionsB = await store.listRevisions(WORKPIECE_B);
    assert.deepEqual(revisionsA.map((revision) => revision.id), ["rev-a"]);
    assert.deepEqual(revisionsB.map((revision) => revision.id), ["rev-b"]);
  } finally {
    harness.restore();
  }
}

async function testTongsRevisionFallbackPrecedence() {
  resetLocalStorage();
  const store = new TongsHearthStore();
  const staleRevision = createRevision("rev-stale", "draft-stale", 1_000);
  saveRevisionSnapshotFallback(WORKPIECE_A, buildRevisionSnapshot(WORKPIECE_A, [staleRevision]));

  const harness = installTongsRevisionFetchHarness();
  try {
    const remoteRevision = createRevision("rev-remote", "draft-remote", 2_000);
    harness.setSnapshot(WORKPIECE_A, buildRevisionSnapshot(WORKPIECE_A, [remoteRevision]));

    const revisions = await store.listRevisions(WORKPIECE_A);
    assert.deepEqual(revisions.map((revision) => revision.id), ["rev-remote"], "Remote snapshot should beat stale fallback");

    const mirroredFallback = loadRevisionSnapshotFallback(WORKPIECE_A);
    assert.equal(mirroredFallback?.revisions[0]?.id, "rev-remote", "Fallback mirror should be updated from remote");
  } finally {
    harness.restore();
  }

  const failHarness = installTongsRevisionFetchHarness({ failReads: true });
  try {
    const revisions = await store.listRevisions(WORKPIECE_A);
    assert.deepEqual(revisions.map((revision) => revision.id), ["rev-remote"], "Fallback should be used when canonical read fails");
  } finally {
    failHarness.restore();
  }
}

async function testTongsRevisionCap() {
  resetLocalStorage();
  const harness = installTongsRevisionFetchHarness();
  const store = new TongsHearthStore();

  try {
    for (let i = 0; i < 201; i += 1) {
      await store.saveRevision(WORKPIECE_A, createRevision(`remote-${i}`, "draft-remote", 1_000 + i));
    }

    const revisions = await store.listRevisions(WORKPIECE_A, "draft-remote");
    assert.equal(revisions.length, 200, "Canonical snapshot should cap revision history");
    assert.equal(revisions[0]?.id, "remote-200");
    assert.equal(revisions[revisions.length - 1]?.id, "remote-1");
  } finally {
    harness.restore();
  }
}

async function testSessionRoundtrip() {
  const storage = resetLocalStorage();
  storage.setItem("forge_workspace_id_v1", "2980fc39-8c8b-489a-a900-8d3bd3248432");
  const sessionStore = new LocalSessionStore();
  await sessionStore.saveSession({
    id: "default",
    createdAt: 1,
    updatedAt: 2,
    activeDraftId: "draft-1",
    lastOpenedAt: 3,
    uiState: {
      cursorPosition: 120,
      scrollTop: 456,
      splitPane: true,
      selectedTab: "compare",
    },
  });

  const restored = await sessionStore.getSession();
  assert.ok(restored, "Session should restore");
  assert.equal(restored?.uiState?.cursorPosition, 120, "Cursor position should roundtrip");
  assert.equal(restored?.uiState?.scrollTop, 456, "Scroll position should roundtrip");
}

function createEpisodeContextFixture() {
  return buildEpisodeContext({
    episodeId: "episode-123",
    workspaceId: "2980fc39-8c8b-489a-a900-8d3bd3248432",
    draft: {
      id: "draft-episode",
      title: "Episode Title",
      body: "Intro line [src_alpha] and closing [src_alpha]",
    },
    planningSession: {
      title: "Planning Title",
      title_variants: {
        A: "Title A",
        B: "Title B",
        C: "Title C",
      },
      outline: ["Hook", "Main", "CTA"],
      tone_preset: "newsroom_neutral",
    },
    workpieceSources: [
      { source_id: "src_alpha", notes: "Primary source" },
    ],
    sourceIndexById: new Map([
      ["src_alpha", { source_id: "src_alpha", title: "Alpha Source", url: "https://example.com/alpha" }],
    ]),
    sparks: [
      { id: "spark-1", body: "Spark body" },
    ],
  });
}

async function testBuildEpisodeContextIncludesFields() {
  const context = createEpisodeContextFixture();
  assert.equal(context.episodeId, "episode-123");
  assert.equal(context.workspaceId, "2980fc39-8c8b-489a-a900-8d3bd3248432");
  assert.equal(context.title, "Episode Title");
  assert.equal(context.titleVariants.A, "Title A");
  assert.equal(context.outline, "Hook\nMain\nCTA");
  assert.equal(context.tonePreset, "newsroom_neutral");
  assert.equal(context.body, "Intro line [src_alpha] and closing [src_alpha]");
  assert.equal(context.sources.length, 1);
  assert.equal(context.sources[0]?.id, "src_alpha");
  assert.equal(context.sources[0]?.title, "Alpha Source");
  assert.equal(context.sources[0]?.note, "Primary source");
  assert.deepEqual(context.sources[0]?.citedIn, ["[src_alpha]"]);
}

async function testApplyHearthOpsRequestsSave() {
  const writes: string[] = [];
  let requestedSave = 0;

  await applyHearthOps({
    setTitle: (value) => writes.push(`title:${value}`),
    setTitleVariant: (slot, value) => writes.push(`variant:${slot}:${value}`),
    setOutline: (value) => writes.push(`outline:${value}`),
    setBody: (value) => writes.push(`body:${value}`),
    addSource: (source) => writes.push(`add:${source.title ?? ""}`),
    updateSource: (id, patch) => writes.push(`update:${id}:${patch.note ?? ""}`),
    removeSource: (id) => writes.push(`remove:${id}`),
    requestSave: (reason) => {
      assert.equal(reason, "ai_apply_ops");
      requestedSave += 1;
    },
  }, [
    { op: "set_title", value: "New Title" },
    { op: "set_title_variant", slot: "A", value: "A/B title" },
    { op: "set_outline", value: "Outline" },
    { op: "set_body", value: "Body" },
    { op: "add_source", source: { title: "Added Source", note: "note" } },
    { op: "update_source", id: "src_alpha", patch: { note: "updated" } },
    { op: "remove_source", id: "src_alpha" },
  ]);

  assert.ok(writes.includes("title:New Title"));
  assert.ok(writes.includes("variant:A:A/B title"));
  assert.ok(writes.includes("outline:Outline"));
  assert.ok(writes.includes("body:Body"));
  assert.ok(writes.includes("add:Added Source"));
  assert.ok(writes.includes("update:src_alpha:updated"));
  assert.ok(writes.includes("remove:src_alpha"));
  assert.equal(requestedSave, 1, "apply ops should request save once");
}

async function testAiRequestPayloadIncludesEpisodeId() {
  resetLocalStorage();
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (_input: unknown, init?: { body?: unknown }) => {
    capturedBody = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null;
    return new Response(JSON.stringify({
      assistant_text: "All set.",
      ops: [],
      script_text: "[s1]\nHello\n[/s1]",
      tag_audit: { speaker_blocks_closed: true },
      billing_mode: "forge",
      token_balance: 99,
      total_tokens: 11,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await requestHearthChatReply(
      [{ role: "user", content: "Refine this." }],
      createEpisodeContextFixture(),
    );
    assert.ok(result.ok, "AI request should succeed in mocked fetch");
    if (result.ok) {
      assert.equal(result.scriptText, "[s1]\nHello\n[/s1]");
      assert.equal((result.tagAudit as { speaker_blocks_closed?: boolean } | undefined)?.speaker_blocks_closed, true);
    }
    assert.equal(capturedBody?.episode_context && (capturedBody.episode_context as { episodeId?: string }).episodeId, "episode-123");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testAnvilTagValidatorAndFormatter() {
  const invalidScript = [
    "**Brad:** intro line",
    "(Joe:) response line",
  ].join("\n");

  const invalid = validateAnvilTagContract(invalidScript);
  assert.equal(invalid.ok, false, "Invalid script should fail tag contract");
  assert.ok(
    invalid.problems.some((item) => item.includes("Forbidden markup")),
    "Validator should report forbidden markup",
  );

  const formatted = formatScriptToAnvilTagsNoAi(invalidScript);
  const fixed = validateAnvilTagContract(formatted);
  assert.equal(fixed.ok, true, "Formatter should produce valid canonical tag output for common label issues");
  assert.ok(formatted.includes("[s1]"), "Formatter should map Joe/S1 labels to [s1]");
  assert.ok(formatted.includes("[s2]"), "Formatter should map Brad/S2 labels to [s2]");

  const cadenceScript = [
    "# Opening",
    "[s1] Hello there.",
    "(pause)",
    "Brad: Copy that.",
  ].join("\n");
  const cadenceFormatted = formatScriptToAnvilTagsNoAi(cadenceScript);
  assert.ok(cadenceFormatted.includes("Opening"), "Formatter should keep heading text");
  assert.ok(!cadenceFormatted.includes("# Opening"), "Formatter should strip markdown heading markers");
  assert.ok(cadenceFormatted.includes("[pause]"), "Formatter should convert (pause) to [pause]");
  assert.ok(
    /\[s1\]\nHello there\.\n(?:\[pause\]\n)?\[\/s1\]/.test(cadenceFormatted),
    "Formatter should force speaker tags to their own lines and close blocks",
  );
  assert.ok(
    cadenceFormatted.includes("[s2]\nCopy that.\n[/s2]"),
    "Formatter should convert Brad label into canonical S2 block",
  );

  const cadenceFormattedTwice = formatScriptToAnvilTagsNoAi(cadenceFormatted);
  assert.equal(
    cadenceFormattedTwice,
    cadenceFormatted,
    "Formatter should be idempotent across repeated formatting passes",
  );

  const misnestedSpeakerScript = [
    "[s1]",
    "First line.",
    "[s2]",
    "Second line.",
  ].join("\n");
  const misnestedFormatted = formatScriptToAnvilTagsNoAi(misnestedSpeakerScript);
  assert.ok(
    !misnestedFormatted.includes("[s1]\n[s2]"),
    "Formatter should not keep nested speaker opens when healing malformed scripts",
  );
  assert.ok(
    misnestedFormatted.includes("[/s1]\n[s2]"),
    "Formatter should close the currently open speaker block before opening another one",
  );
  assert.equal(
    (misnestedFormatted.match(/\[\/s1\]/g) ?? []).length,
    1,
    "Formatter should only add one close tag for S1 when auto-closing at EOF",
  );
  assert.equal(
    (misnestedFormatted.match(/\[\/s2\]/g) ?? []).length,
    1,
    "Formatter should close only the currently open speaker block at EOF",
  );
  assert.equal(
    validateAnvilTagContract(misnestedFormatted).ok,
    true,
    "Formatter healing should produce a valid script without introducing invalid nesting",
  );
}

async function run() {
  await testDraftFlagsRoundtrip();
  await testRevisionCap();
  await testTongsRevisionRoundtrip();
  await testTongsRevisionIsolationByWorkpiece();
  await testTongsRevisionFallbackPrecedence();
  await testTongsRevisionCap();
  await testSessionRoundtrip();
  await testBuildEpisodeContextIncludesFields();
  await testApplyHearthOpsRequestsSave();
  await testAiRequestPayloadIncludesEpisodeId();
  await testAnvilTagValidatorAndFormatter();
  // eslint-disable-next-line no-console
  console.log("Hearth confidence tests passed.");
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Hearth confidence tests failed:", err);
  process.exit(1);
});
