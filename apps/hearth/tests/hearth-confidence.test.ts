import assert from "node:assert/strict";
import { LocalHearthStore } from "../src/storage/local-store";
import { LocalSessionStore } from "../src/storage/local-session-store";
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
}

type LocalStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

function resetLocalStorage(): LocalStorageLike {
  const storage = new MemoryStorage();
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
    await store.saveRevision(createRevision(`rev-${i}`, draft.id, 1000 + i));
  }

  const revisions = await store.listRevisions(draft.id);
  assert.equal(revisions.length, 200, "Should cap revisions at 200");
  assert.equal(revisions[0]?.id, "rev-200", "Newest revision should be first");
  assert.equal(revisions[revisions.length - 1]?.id, "rev-1", "Oldest should be pruned");
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
