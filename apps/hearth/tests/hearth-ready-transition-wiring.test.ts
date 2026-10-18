import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";
import { commitHearthPrimaryScript } from "../src/lib/hearth-script-repo";
import { commitPublishedScriptApprovalAuthority, reconcileApprovedScriptRecordingReadiness } from "../src/lib/hearth-script-approval-authority";

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
    const url = String(input);
    requests.push(url);
    if (url.includes("read-file")) return response({ ok: true, exists: false });
    return response({ ok: true, data: { workspace_id: WORKSPACE_ID, hash: await hash(VALID_SCRIPT), file_row: { revision: 4 } } });
  }) as typeof fetch;
  try {
    const result = await commitHearthPrimaryScript(WORKPIECE_ID, VALID_SCRIPT);
    assert.equal(result.ok, true);
    assert.equal(requests.length, 2);
    assert.match(requests[0] ?? "", /read-file/);
    assert.match(requests[1] ?? "", /commit-file$/);
  } finally { globalThis.fetch = originalFetch; restoreWindow(); }
});

test("byte-identical working-document commit is a no-op and preserves its canonical revision", async () => {
  const originalFetch = globalThis.fetch;
  const restoreWindow = installWindow();
  const scriptHash = await hash(VALID_SCRIPT);
  const requests: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    requests.push(url);
    return response({
      ok: true,
      data: VALID_SCRIPT,
      file_row: { revision: 4, hash_value: scriptHash, updated_at: "2026-09-18T00:00:00Z" },
    });
  }) as typeof fetch;
  try {
    const result = await commitHearthPrimaryScript(WORKPIECE_ID, VALID_SCRIPT);
    assert.deepEqual(result, { ok: true, outcome: "duplicate", revision: 4, hash: scriptHash, transitionId: "" });
    assert.equal(requests.length, 1);
    assert.match(requests[0] ?? "", /read-file/);
    assert.equal(requests.some((url) => /commit-file$/.test(url)), false);
  } finally { globalThis.fetch = originalFetch; restoreWindow(); }
});

test("approval returns recording-ready authority without a second client transition", async () => {
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
    if (url.endsWith("/script-approval")) return response({ ok: true, data: { disposition: "committed", approval: { id: APPROVAL_ID, approval_revision: 1, source_file_revision: 4, script_content_hash: scriptHash }, recording_readiness: { state: "ready", basis: "current_script_approval", ready: { transition_id: TRANSITION_ID } } } });
    return response({ ok: true, data: { outcome: "saved", ready: { transition_id: TRANSITION_ID } } });
  }) as typeof fetch;
  try {
    const result = await commitPublishedScriptApprovalAuthority({ workpieceId: WORKPIECE_ID, workspaceId: WORKSPACE_ID, creatorVersion: 1, scriptText: VALID_SCRIPT, isCurrent: () => true });
    assert.equal(result.ok, true);
    assert.equal(requests.some((entry) => entry.url.endsWith("/ready-transition")), false);
    assert.equal(requests.some((entry) => entry.url.endsWith("/recording-readiness")), false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreWindow();
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
  }
});

test("Brad regression: an existing current approval safely acquires its missing Ready receipt", async () => {
  const originalFetch = globalThis.fetch;
  const restoreWindow = installWindow();
  const outcomes = ["saved", "duplicate"];
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    requests.push({ url, body });
    const outcome = outcomes.shift() ?? "duplicate";
    return response({ ok: true, data: { outcome, reason: null, basis: "current_script_approval", ready: { transition_id: TRANSITION_ID } } });
  }) as typeof fetch;
  try {
    const first = await reconcileApprovedScriptRecordingReadiness({ workpieceId: WORKPIECE_ID, workspaceId: WORKSPACE_ID });
    const retry = await reconcileApprovedScriptRecordingReadiness({ workpieceId: WORKPIECE_ID, workspaceId: WORKSPACE_ID });
    assert.deepEqual(first, { ok: true, readyTransitionId: TRANSITION_ID });
    assert.deepEqual(retry, { ok: true, readyTransitionId: TRANSITION_ID });
    assert.equal(requests.length, 2);
    assert.ok(requests.every((entry) => entry.url.endsWith("/recording-readiness")));
    assert.ok(requests.every((entry) => entry.body.workspace_id === WORKSPACE_ID));
    assert.ok(requests.every((entry) => !("script_approval_id" in entry.body)));
  } finally { globalThis.fetch = originalFetch; restoreWindow(); }
});

for (const reason of ["current_approval_not_found", "approved_script_is_not_current", "active_episode_membership_invalid"] as const) {
  test(`recording-readiness reconciliation fails closed for ${reason}`, async () => {
    const originalFetch = globalThis.fetch;
    const restoreWindow = installWindow();
    globalThis.fetch = (async () => response({ ok: true, data: { outcome: reason === "approved_script_is_not_current" ? "stale" : "not_found", reason, ready: null } })) as typeof fetch;
    try {
      const result = await reconcileApprovedScriptRecordingReadiness({ workpieceId: WORKPIECE_ID, workspaceId: WORKSPACE_ID });
      assert.equal(result.ok, false);
    } finally { globalThis.fetch = originalFetch; restoreWindow(); }
  });
}

test("approval CAS rejects source bytes different from the creator-visible draft", async () => {
  const originalFetch = globalThis.fetch; const originalCrypto = globalThis.crypto; const restoreWindow = installWindow();
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  globalThis.fetch = (async (input) => String(input).includes("read-file")
    ? response({ ok: true, file_row: { revision: 21, hash_value: "a".repeat(64) } })
    : response({ ok: true, data: { current_revision: 2 } })) as typeof fetch;
  try {
    const result = await commitPublishedScriptApprovalAuthority({ workpieceId: WORKPIECE_ID, workspaceId: WORKSPACE_ID, creatorVersion: 3, scriptText: VALID_SCRIPT, isCurrent: () => true });
    assert.deepEqual(result, { ok: false, error: "The working draft changed before approval. Reload the current script and approve it deliberately." });
  } finally { globalThis.fetch = originalFetch; restoreWindow(); Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto }); }
});

test("an unauthorized response keeps its auth meaning even behind an outer 502", async () => {
  const originalFetch = globalThis.fetch; const originalCrypto = globalThis.crypto; const restoreWindow = installWindow();
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  globalThis.fetch = (async (input) => String(input).includes("read-file")
    ? response({ ok: true, file_row: { revision: 3, hash_value: await hash(VALID_SCRIPT) } })
    : response({ ok: false, error: { code: "unauthorized", message: "Missing or invalid API token" } }, 502)) as typeof fetch;
  try {
    const result = await commitPublishedScriptApprovalAuthority({ workpieceId: WORKPIECE_ID, workspaceId: WORKSPACE_ID, creatorVersion: 1, scriptText: VALID_SCRIPT, isCurrent: () => true });
    assert.deepEqual(result, {
      ok: false,
      status: 401,
      code: "unauthorized",
      error: "Tongs rejected the local API credential. Reload after restoring the configured Tongs request token.",
    });
  } finally { globalThis.fetch = originalFetch; restoreWindow(); Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto }); }
});

test("malformed script validation is rejected before canonical commit", async () => {
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return response({}); }) as typeof fetch;
  try { assert.equal((await commitHearthPrimaryScript(WORKPIECE_ID, "text outside speaker tags")).ok, false); assert.equal(calls, 0); }
  finally { globalThis.fetch = originalFetch; }
});
