import assert from "node:assert/strict";
import test from "node:test";
import { listHearthAttachments, uploadHearthAttachment } from "../src/lib/hearth-attachments-api";

type MockStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  key: (index: number) => string | null;
  readonly length: number;
};

function createMockStorage(): MockStorage {
  const store = new Map<string, string>();
  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

function installMockWindow(): () => void {
  const previousWindow = (globalThis as Record<string, unknown>).window;
  const localStorage = createMockStorage();
  const mockWindow = {
    location: { search: "" },
    localStorage,
    __forgeTongsApiToken: "test-token",
  };
  (globalThis as Record<string, unknown>).window = mockWindow;
  return () => {
    if (previousWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
      return;
    }
    (globalThis as Record<string, unknown>).window = previousWindow;
  };
}

test("listHearthAttachments reports unavailable when the attachment route is absent", async () => {
  const restoreWindow = installMockWindow();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    error: "not_found",
  }), {
    status: 404,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

  try {
    const result = await listHearthAttachments({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      episodeId: "22222222-2222-4222-8222-222222222222",
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    if (result.ok) assert.fail("Expected an unavailable result.");
    assert.equal(result.reason, "unavailable");
    assert.match(result.error, /unavailable/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreWindow();
  }
});

test("uploadHearthAttachment returns a sign-in message for unauthorized errors", async () => {
  const restoreWindow = installMockWindow();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: false,
    message: "unauthorized",
  }), {
    status: 401,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;

  try {
    const result = await uploadHearthAttachment({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      episodeId: "22222222-2222-4222-8222-222222222222",
      file: new File(["hello"], "note.txt", { type: "text/plain" }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 401);
    assert.equal(result.error, "unauthorized");
  } finally {
    globalThis.fetch = originalFetch;
    restoreWindow();
  }
});
