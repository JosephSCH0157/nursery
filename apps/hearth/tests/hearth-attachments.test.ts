import assert from "node:assert/strict";
import test from "node:test";
import {
  type HearthAttachmentRecord,
  type HearthListAttachmentsResult,
  type HearthUploadAttachmentResult,
  listHearthAttachments,
  uploadHearthAttachment,
} from "../src/lib/hearth-attachments-api";

// ---------------------------------------------------------------------------
// Minimal fetch stub helpers
// ---------------------------------------------------------------------------

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function installWindowAuthStub(): () => void {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const storage = new Map<string, string>();
  const jwtHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const jwtPayload = Buffer.from(JSON.stringify({
    sub: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  storage.set("forge-auth", `${jwtHeader}.${jwtPayload}.sig`);

  (globalThis as { window?: unknown }).window = {
    location: { search: "" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
      clear: () => void storage.clear(),
      key: (index: number) => Array.from(storage.keys())[index] ?? null,
      get length() {
        return storage.size;
      },
    },
  };

  return () => {
    (globalThis as { window?: unknown }).window = originalWindow;
  };
}

function installFetchStub(stub: FetchStub): () => void {
  const original = globalThis.fetch;
  (globalThis as Record<string, unknown>).fetch = stub;
  return () => {
    (globalThis as Record<string, unknown>).fetch = original;
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// listHearthAttachments tests
// ---------------------------------------------------------------------------

test("listHearthAttachments returns normalized attachment records on success", async () => {
  const restoreWindow = installWindowAuthStub();
  const record = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workspace_id: "11111111-1111-4111-8111-111111111111",
    episode_id: "22222222-2222-4222-8222-222222222222",
    filename: "notes.txt",
    mime_type: "text/plain",
    size_bytes: 22,
    storage_path: "hearth/attachments/aaa/notes.txt",
    storage_key: "hearth/attachments/ws/ep/id/notes.txt",
    extracted_text: "hello world",
    parse_status: "attached",
    parse_error: null,
    created_at: "2026-05-05T00:00:00.000Z",
    updated_at: "2026-05-05T00:00:00.000Z",
  };

  const restore = installFetchStub(() =>
    Promise.resolve(jsonResponse(200, { ok: true, data: { attachments: [record] } })),
  );

  try {
    const result: HearthListAttachmentsResult = await listHearthAttachments({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      episodeId: "22222222-2222-4222-8222-222222222222",
    });

    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.attachments.length, 1);
    const a = result.attachments[0] as HearthAttachmentRecord;
    assert.equal(a.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(a.filename, "notes.txt");
    assert.equal(a.parse_status, "attached");
    assert.equal(a.extracted_text, "hello world");
  } finally {
    restore();
    restoreWindow();
  }
});

test("listHearthAttachments reports unavailable on 404", async () => {
  const restoreWindow = installWindowAuthStub();
  const restore = installFetchStub(() =>
    Promise.resolve(new Response(null, { status: 404 })),
  );

  try {
    const result = await listHearthAttachments({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      episodeId: "22222222-2222-4222-8222-222222222222",
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "unavailable");
  } finally {
    restore();
    restoreWindow();
  }
});

test("listHearthAttachments returns error result on 401", async () => {
  const restoreWindow = installWindowAuthStub();
  const restore = installFetchStub(() =>
    Promise.resolve(jsonResponse(401, { error: "Unauthorized" })),
  );

  try {
    const result = await listHearthAttachments({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      episodeId: "22222222-2222-4222-8222-222222222222",
    });
    assert.ok(!result.ok);
    if (result.ok) return;
    assert.equal(result.status, 401);
    assert.ok(result.error.length > 0);
  } finally {
    restore();
    restoreWindow();
  }
});

test("listHearthAttachments skips rows that fail normalization", async () => {
  const restoreWindow = installWindowAuthStub();
  const validRecord = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    workspace_id: "11111111-1111-4111-8111-111111111111",
    episode_id: "22222222-2222-4222-8222-222222222222",
    filename: "notes.txt",
    mime_type: "text/plain",
    size_bytes: 22,
    storage_path: "hearth/attachments/aaa/notes.txt",
    storage_key: "hearth/attachments/ws/ep/id/notes.txt",
    extracted_text: null,
    parse_status: "pending",
    parse_error: null,
    created_at: "2026-05-05T00:00:00.000Z",
    updated_at: "2026-05-05T00:00:00.000Z",
  };
  // invalid: missing id
  const invalidRecord = { workspace_id: "11111111-1111-4111-8111-111111111111" };

  const restore = installFetchStub(() =>
    Promise.resolve(jsonResponse(200, { ok: true, data: { attachments: [validRecord, invalidRecord] } })),
  );

  try {
    const result = await listHearthAttachments({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      episodeId: "22222222-2222-4222-8222-222222222222",
    });
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.attachments.length, 1);
    assert.equal(result.attachments[0]?.id, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  } finally {
    restore();
    restoreWindow();
  }
});

// ---------------------------------------------------------------------------
// uploadHearthAttachment tests
// ---------------------------------------------------------------------------

test("uploadHearthAttachment returns normalized record on success", async () => {
  const restoreWindow = installWindowAuthStub();
  let capturedFormData: FormData | null = null;

  const restore = installFetchStub(async (_input, init) => {
    capturedFormData = init?.body as FormData;
    return jsonResponse(201, {
      ok: true,
      data: {
        attachment: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          workspace_id: "11111111-1111-4111-8111-111111111111",
          episode_id: "22222222-2222-4222-8222-222222222222",
          filename: "research.md",
          mime_type: "text/markdown",
          size_bytes: 100,
          storage_path: "hearth/attachments/bbb/research.md",
          storage_key: "hearth/attachments/ws/ep/id/research.md",
          extracted_text: "# Research notes",
          parse_status: "attached",
          parse_error: null,
          created_at: "2026-05-05T00:00:00.000Z",
          updated_at: "2026-05-05T00:00:00.000Z",
        },
      },
    });
  });

  try {
    const file = new File(["# Research notes"], "research.md", { type: "text/markdown" });
    const result: HearthUploadAttachmentResult = await uploadHearthAttachment({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      episodeId: "22222222-2222-4222-8222-222222222222",
      file,
    });

    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.attachment.filename, "research.md");
    assert.equal(result.attachment.parse_status, "attached");
    assert.equal(result.attachment.extracted_text, "# Research notes");

    // Confirm form fields were sent
    const submittedFormData = capturedFormData as unknown;
    assert.ok(submittedFormData instanceof FormData, "FormData should be sent");
    assert.equal(submittedFormData.get("workspace_id"), "11111111-1111-4111-8111-111111111111");
    assert.equal(submittedFormData.get("episode_id"), "22222222-2222-4222-8222-222222222222");
    assert.equal(submittedFormData.get("original_filename"), "research.md");
    assert.equal(submittedFormData.get("mime_type"), "text/markdown");
  } finally {
    restore();
    restoreWindow();
  }
});

test("uploadHearthAttachment returns error result on 415 unsupported type", async () => {
  const restoreWindow = installWindowAuthStub();
  const restore = installFetchStub(() =>
    Promise.resolve(jsonResponse(415, { ok: false, error: { code: "unsupported_attachment_type", message: "Unsupported file type." } })),
  );

  try {
    const file = new File(["alert(1)"], "malware.js", { type: "application/javascript" });
    const result = await uploadHearthAttachment({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      episodeId: "22222222-2222-4222-8222-222222222222",
      file,
    });
    assert.ok(!result.ok);
    if (result.ok) return;
    assert.equal(result.status, 415);
  } finally {
    restore();
    restoreWindow();
  }
});
