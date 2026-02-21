import assert from "node:assert/strict";
import { LocalHearthStore } from "../src/storage/local-store";
import { LocalSessionStore } from "../src/storage/local-session-store";
import type { Draft } from "../src/domain/draft";
import type { Revision } from "../src/domain/revision";

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
  resetLocalStorage();
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

async function run() {
  await testDraftFlagsRoundtrip();
  await testRevisionCap();
  await testSessionRoundtrip();
  // eslint-disable-next-line no-console
  console.log("Hearth confidence tests passed.");
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Hearth confidence tests failed:", err);
  process.exit(1);
});
