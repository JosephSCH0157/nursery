import assert from "node:assert/strict";
import test from "node:test";
import { validateScriptTags } from "@forge/shared/script-tags";
import { coalesceScriptTextIntoOps, requestHearthChatReply, resolveScriptTextFromChatPayload } from "../src/lib/hearth-chat-api";
import type { HearthOp } from "../src/lib/hearth-ai-runtime-contract";
import { resolveHearthAttachmentStatusLabel } from "../src/views/surfaces/ChatSurface";

function assertMaxSpeakerSpokenLines(script: string, maxLines: number): void {
  let insideSpeaker = false;
  let count = 0;
  for (const line of script.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\[(?:s1|s2|g1|g2)\]$/i.test(trimmed)) {
      insideSpeaker = true;
      count = 0;
      continue;
    }
    if (/^\[\/(?:s1|s2|g1|g2)\]$/i.test(trimmed)) {
      assert.ok(count <= maxLines, `speaker block had ${count} spoken lines:\n${script}`);
      insideSpeaker = false;
      count = 0;
      continue;
    }
    if (insideSpeaker && trimmed && !/^\[(?:beat|pause|reflective pause)\]$/i.test(trimmed)) count += 1;
  }
}

test("resolveScriptTextFromChatPayload promotes canonical assistant text into script text", () => {
  const ops: HearthOp[] = [];
  const assistantText = [
    "[s1]",
    "- Open with the basic fact.",
    "- Frame the episode as a media-framing comparison.",
    "[/s1]",
    "",
    "[s2]",
    "- Close with the practical takeaway.",
    "[/s2]",
  ].join("\n");

  const result = resolveScriptTextFromChatPayload({
    assistantText,
    ops,
    scriptText: undefined,
  });

  assert.equal(result, assistantText);
});

test("resolveScriptTextFromChatPayload extracts canonical script from wrapped assistant prose", () => {
  const ops: HearthOp[] = [];
  const result = resolveScriptTextFromChatPayload({
    assistantText: [
      "Here is the panel-ready bullet script:",
      "",
      "[s1]",
      "- Hook.",
      "[/s1]",
      "",
      "[s2]",
      "- Close.",
      "[/s2]",
      "",
      "Use Step mode in Anvil.",
    ].join("\n"),
    ops,
    scriptText: undefined,
  });

  assert.equal(result, ["[s1]", "- Hook.", "[/s1]", "", "[s2]", "- Close.", "[/s2]"].join("\n"));
});

test("resolveScriptTextFromChatPayload does not promote ordinary assistant prose", () => {
  const result = resolveScriptTextFromChatPayload({
    assistantText: "This is a great angle. Want me to turn it into a bullet script?",
    ops: [],
    scriptText: undefined,
  });

  assert.equal(result, undefined);
});

test("resolveScriptTextFromChatPayload respects an existing body op", () => {
  const result = resolveScriptTextFromChatPayload({
    assistantText: "[s1]\n- Alternate draft\n[/s1]",
    ops: [{ op: "set_body", value: "[s1]\nExisting draft\n[/s1]" }],
    scriptText: undefined,
  });

  assert.equal(result, undefined);
});

test("ChatSurface attachment chip status labels are stable", () => {
  assert.equal(resolveHearthAttachmentStatusLabel("uploading"), "Uploading...");
  assert.equal(resolveHearthAttachmentStatusLabel("reading"), "Reading file...");
  assert.equal(resolveHearthAttachmentStatusLabel("attached"), "Attached");
  assert.equal(resolveHearthAttachmentStatusLabel("failed"), "Failed");
});

test("coalesceScriptTextIntoOps shapes set_body proposals before review display", () => {
  const blobScript = [
    "[s1]",
    "Alright. I want to talk about voting rights. And I want to talk about racism. Here is the thesis. If we actually want to end racism, we have to stop governing through race. Not stop noticing reality. Not stop enforcing fairness. But stop using race as the steering wheel for public policy.",
    "[/s1]",
  ].join("\n");

  const ops = coalesceScriptTextIntoOps([{ op: "set_body", value: blobScript }], undefined);
  const body = ops.find((op) => op.op === "set_body")?.value ?? "";

  assert.notEqual(body, blobScript);
  assert.equal(validateScriptTags(body).ok, true);
  assert.ok((body.match(/\[s1\]/g) ?? []).length >= 1);
  assertMaxSpeakerSpokenLines(body, 8);
});

test("requestHearthChatReply includes attachment context metadata in payload", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = (globalThis as { window?: unknown }).window;
  let capturedBody: Record<string, unknown> | null = null;

  const storage = new Map<string, string>();
  const jwtHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const jwtPayload = Buffer.from(JSON.stringify({
    sub: "55555555-5555-4555-8555-555555555555",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  storage.set("forge-auth", `${jwtHeader}.${jwtPayload}.sig`);
  (globalThis as { window?: unknown }).window = {
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
    __forgeSupabaseUrl: "https://supabase.example.test",
    __forgeSupabaseAnonKey: "anon-test-key",
  };

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/rest/v1/workspaces")) {
      return new Response(JSON.stringify([{ org_id: "44444444-4444-4444-8444-444444444444" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/rest/v1/rpc/resolve_ai_policy")) {
      return new Response(JSON.stringify([{ decision_type: "ALLOW", reason_code: null }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/api/ai-keys/status")) {
      return new Response(JSON.stringify({
        ok: true,
        provider: "openai",
        connected: false,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.includes("/api/hearth/chat")) {
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return new Response(JSON.stringify({
        ok: true,
        assistant_text: "Ready.",
        ops: [],
        script_text: null,
        tag_audit: null,
        billing_mode: "forge",
        token_balance: 42,
        total_tokens: 10,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await requestHearthChatReply(
      [{ role: "user", content: "Use my attachments" }],
      {
        episodeId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
        title: "Episode",
        titleVariants: { A: "", B: "", C: "" },
        outline: "",
        body: "",
        tonePreset: null,
        sources: [],
        sparks: [],
      },
      {
        attachmentContext: {
          includeEpisodeAttachments: true,
          attachmentIds: ["33333333-3333-4333-8333-333333333333"],
        },
      },
    );

    assert.equal(result.ok, true);
    assert.ok(capturedBody);
    const attachmentContext = capturedBody?.attachment_context as Record<string, unknown> | undefined;
    assert.ok(attachmentContext);
    assert.equal(attachmentContext?.include_episode_attachments, true);
    assert.deepEqual(attachmentContext?.attachment_ids, ["33333333-3333-4333-8333-333333333333"]);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as { window?: unknown }).window = originalWindow;
  }
});

test("coalesceScriptTextIntoOps shapes script_text before adding a body proposal", () => {
  const blobScript = [
    "[s1]",
    "This is the point. It lands hard. Then the next idea needs room. The audience needs to breathe before the argument turns.",
    "[/s1]",
  ].join("\n");

  const ops = coalesceScriptTextIntoOps([], blobScript);
  const body = ops.find((op) => op.op === "set_body")?.value ?? "";

  assert.notEqual(body, blobScript);
  assert.equal(validateScriptTags(body).ok, true);
  assertMaxSpeakerSpokenLines(body, 8);
});
