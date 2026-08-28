import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { commitHearthPrimaryScript } from "../src/lib/hearth-script-repo";
import { commitPublishedScriptApprovalAuthority } from "../src/lib/hearth-script-approval-authority";

const WORKPIECE_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const APPROVAL_ID = "33333333-3333-4333-8333-333333333333";
const TRANSITION_ID = "22222222-2222-4222-8222-222222222222";
const VALID_SCRIPT = "[s1]\nCanonical script.\n[/s1]\n";

function response(body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
async function hash(text: string): Promise<string> {
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Buffer.from(digest).toString("hex");
}
function installWindow(): () => void {
  const runtime = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const previous = runtime.window;
  runtime.window = { location: { search: "?tongs_api_token=test-token" }, localStorage: { getItem: () => null } } as unknown as Window & typeof globalThis;
  return () => { if (previous === undefined) Reflect.deleteProperty(runtime, "window"); else runtime.window = previous; };
}

test("working-document commit does not independently publish Ready", async () => {
  const originalFetch = globalThis.fetch;
  const restoreWindow = installWindow();
  const requests: string[] = [];
  globalThis.fetch = (async (input) => {
    requests.push(String(input));
    return response({ ok: true, data: { workspace_id: WORKSPACE_ID, hash: await hash(VALID_SCRIPT), file_row: { revision: 4 } } });
  }) as typeof fetch;
  try {
    const result = await commitHearthPrimaryScript(WORKPIECE_ID, VALID_SCRIPT);
    assert.equal(result.ok, true);
    assert.equal(requests.length, 1);
    assert.match(requests[0] ?? "", /commit-file$/);
  } finally { globalThis.fetch = originalFetch; restoreWindow(); }
});

test("Ready publishes the explicit immutable approval identity", async () => {
  const originalFetch = globalThis.fetch;
  const restoreWindow = installWindow();
  const originalCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  const scriptHash = await hash(VALID_SCRIPT);
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input); const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    requests.push({ url, body });
    if (url.includes("read-file")) return response({ ok: true, file_row: { revision: 4, hash_value: scriptHash } });
    if (url.endsWith("/script-approval") && (init?.method ?? "GET") === "GET") return response({ ok: true, data: { current_revision: 0, current_approval: null } });
    if (url.endsWith("/script-approval")) return response({ ok: true, data: { disposition: "committed", approval: { id: APPROVAL_ID, approval_revision: 1, source_file_revision: 4, script_content_hash: scriptHash } } });
    return response({ ok: true, data: { outcome: "saved", ready: { transition_id: TRANSITION_ID } } });
  }) as typeof fetch;
  try {
    const result = await commitPublishedScriptApprovalAuthority({ workpieceId: WORKPIECE_ID, workspaceId: WORKSPACE_ID, creatorVersion: 1, scriptText: VALID_SCRIPT });
    assert.equal(result.ok, true);
    const ready = requests.find((entry) => entry.url.endsWith("/ready-transition"));
    assert.equal(ready?.body.script_approval_id, APPROVAL_ID);
    assert.deepEqual(ready?.body.publish_evidence, { transition: "hearth.approved-script.ready.v2", script_approval_id: APPROVAL_ID, script_approval_revision: 1, script_approval_hash: scriptHash });
  } finally {
    globalThis.fetch = originalFetch;
    restoreWindow();
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  }
});

test("approval CAS rejects source bytes different from the creator-visible draft", async () => {
  const originalFetch = globalThis.fetch; const originalCrypto = globalThis.crypto; const restoreWindow = installWindow();
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  globalThis.fetch = (async (input) => String(input).includes("read-file")
    ? response({ ok: true, file_row: { revision: 21, hash_value: "a".repeat(64) } })
    : response({ ok: true, data: { current_revision: 2 } })) as typeof fetch;
  try {
    const result = await commitPublishedScriptApprovalAuthority({ workpieceId: WORKPIECE_ID, workspaceId: WORKSPACE_ID, creatorVersion: 3, scriptText: VALID_SCRIPT });
    assert.deepEqual(result, { ok: false, error: "The working draft changed before approval. Reload the current script and approve it deliberately." });
  } finally { globalThis.fetch = originalFetch; restoreWindow(); Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto }); }
});

test("malformed script validation is rejected before canonical commit", async () => {
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return response({}); }) as typeof fetch;
  try { assert.equal((await commitHearthPrimaryScript(WORKPIECE_ID, "text outside speaker tags")).ok, false); assert.equal(calls, 0); }
  finally { globalThis.fetch = originalFetch; }
});
