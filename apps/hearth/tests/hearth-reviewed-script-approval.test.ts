import assert from "node:assert/strict";
import test from "node:test";
import { createHash, webcrypto } from "node:crypto";
import { buildHearthApprovedScriptReplacement, canonicalHearthApprovalText } from "../src/lib/hearth-script-approval";
import { commitPublishedScriptApprovalAuthority } from "../src/lib/hearth-script-approval-authority";
import { buildHearthEditorialPreflightReport } from "../src/lib/hearth-editorial-preflight";
import type { HearthResearchResult } from "../src/lib/hearth-research-contract";
import { evaluateHearthScriptValidation } from "../src/lib/hearth-script-tag-policy";
import { shapeHearthScriptForRecording } from "../src/lib/hearth-recording-ready-script";
import { createHearthOperationAuthority } from "../src/lib/hearth-operation-authority";

const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workpieceId = "11111111-1111-4111-8111-111111111111";
const A = "[s1]\nA neutral introduction.\n\nThis first sentence establishes a careful recording plan for a small creative project. The second sentence explains how the creator compares the material against their sources before approval. The third sentence describes reviewing the result without changing its authority. A fourth sentence provides enough text to exercise the existing recording layout helper. A fifth sentence closes this entirely synthetic demonstration.\n[/s1]\n";
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const prepare = (body: string) => buildHearthApprovedScriptReplacement({
  draft: { id: workpieceId, title: "Synthetic reviewed script", body, createdAt: 1, updatedAt: 1, revisionCount: 0, archived: false },
  evaluateScriptValidation: evaluateHearthScriptValidation,
  buildPersistedValidationMeta: () => undefined,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function withAuthority(run: (h: {
  requests: Array<{ method: string; url: string; body: Record<string, unknown> }>;
  state: { text: string; revision: number; onRead?: () => void; rejection?: string; deny?: boolean };
  submit: (overrides?: Partial<Parameters<typeof commitPublishedScriptApprovalAuthority>[0]>) => ReturnType<typeof commitPublishedScriptApprovalAuthority>;
}) => Promise<void>) {
  const originalFetch = globalThis.fetch, originalCrypto = globalThis.crypto;
  const runtime = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const originalWindow = runtime.window;
  runtime.window = { location: { search: "?tongs_api_token=test-token" }, localStorage: { getItem: () => null } } as unknown as Window & typeof globalThis;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  const requests: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
  const state: { text: string; revision: number; onRead?: () => void; rejection?: string; deny?: boolean } = { text: A, revision: 2 };
  const committed = new Set<string>();
  globalThis.fetch = (async (input, init) => {
    const url = String(input), method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    requests.push({ method, url, body });
    if (state.deny) return json({ ok: false }, 403);
    if (url.includes("read-file")) {
      state.onRead?.();
      return json({ ok: true, data: state.text, file_row: { revision: state.revision, hash_value: hash(state.text) } });
    }
    assert.match(url, /\/script-approval$/);
    if (method === "GET") return json({ ok: true, data: { current_revision: committed.size } });
    if (state.rejection) return json({ ok: true, data: { disposition: state.rejection } });
    assert.equal(body.expected_source_file_revision, state.revision);
    assert.equal(body.expected_source_content_hash, hash(state.text));
    assert.equal("preflight_report_id" in body, false);
    const operation = String(body.operation_id), duplicate = committed.has(operation);
    committed.add(operation);
    return json({ ok: true, data: { disposition: duplicate ? "no_change" : "committed", approval: { id: "33333333-3333-4333-8333-333333333333", approval_revision: 1, source_file_revision: state.revision, script_content_hash: hash(state.text) } } });
  }) as typeof fetch;
  const submit = (overrides: Partial<Parameters<typeof commitPublishedScriptApprovalAuthority>[0]> = {}) => commitPublishedScriptApprovalAuthority({
    workspaceId, workpieceId, creatorVersion: 1, scriptText: prepare(A).scriptText,
    isCurrent: () => true, ...overrides,
  });
  try { await run({ requests, state, submit }); }
  finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: originalCrypto });
    if (originalWindow === undefined) Reflect.deleteProperty(runtime, "window"); else runtime.window = originalWindow;
  }
}

test("approval preserves reviewed A instead of converting it into recording representation B", async () => {
  const B = evaluateHearthScriptValidation(shapeHearthScriptForRecording(A)).normalizedText;
  assert.notEqual(hash(A), hash(B));
  const prepared = prepare(A);
  assert.equal(prepared.validation.ok, true);
  assert.equal(prepared.scriptText, A);
  assert.equal(prepared.draft.body, A);
  await withAuthority(async ({ submit, requests }) => {
    const result = await submit();
    assert.equal(result.ok, true);
    assert.equal(requests.filter(r => r.method === "POST").length, 1);
    assert.equal(requests.at(-1)?.body.expected_source_content_hash, hash(A));
    assert.equal(requests.some(r => r.url.endsWith("ready-transition")), false);
  });
});

test("already recording-shaped reviewed bytes are preserved", () => {
  const B = evaluateHearthScriptValidation(shapeHearthScriptForRecording(A)).normalizedText;
  assert.equal(prepare(B).scriptText, B);
  assert.equal(prepare(B).draft.body, B);
});

test("approval uses the existing LF/BOM/NFC wire representation without a second layout normalization", () => {
  const input = "\uFEFF[s1]\r\nCafe\u0301 remains deliberately spaced.  \r\n[/s1]";
  const reviewed = "[s1]\nCaf\u00e9 remains deliberately spaced.  \n[/s1]";
  assert.equal(prepare(input).scriptText, reviewed);
  assert.equal(prepare(reviewed).scriptText, reviewed);
  assert.equal(canonicalHearthApprovalText(reviewed), reviewed);
  assert.notEqual(evaluateHearthScriptValidation(reviewed).normalizedText, reviewed);
  for (const suffix of ["", "\n", "\n\n", "  \n"]) {
    const text = "[s1]\nKeep this exact representation.\n[/s1]" + suffix;
    assert.equal(prepare(text).scriptText, text);
  }
  const upperTags = "[S1]\nKeep reviewed tag spelling.\n[/S1]\n";
  assert.equal(prepare(upperTags).scriptText, upperTags);
});

test("a local script different from canonical bytes is rejected before approval submission", async () => {
  await withAuthority(async ({ submit, requests }) => {
    assert.equal((await submit({ scriptText: A.replace("neutral", "changed") })).ok, false);
    assert.equal(requests.some(r => r.method === "POST"), false);
  });
});

test("the current canonical revision is bound at approval time even when its bytes are unchanged", async () => {
  await withAuthority(async ({ submit, state, requests }) => {
    state.revision = 3;
    assert.equal((await submit()).ok, true);
    assert.equal(requests.find(r => r.method === "POST")?.body.expected_source_file_revision, 3);
  });
});

test("canonical bytes different from the creator-visible draft cannot be approved", async () => {
  await withAuthority(async ({ submit, state, requests }) => {
    state.text = A.replace("neutral", "changed");
    assert.equal((await submit()).ok, false);
    assert.equal(requests.some(r => r.method === "POST"), false);
  });
});

for (const [code, sentence] of [
  ["unsupported_name", "The United States remains in view."],
  ["unsupported_number_or_date", "The figure reached 42 percent in 2026."],
  ["causal_assertion", "That decision caused the change."],
  ["superlative_claim", "This is the biggest shift and always will be."],
  ["wording_stronger_than_evidence", "This definitely proves the point."],
] as const) {
  test(`${code} is advisory and does not enter script approval authority`, async () => {
    const script = `[s1]\n${sentence} ${"Production-safe spoken copy. ".repeat(8)}\n[/s1]\n`;
    const report = buildHearthEditorialPreflightReport({ scriptText: script, researchResult: null });
    assert.equal(report.findings.some((finding) => finding.code === code), true);
    await withAuthority(async ({ submit, state, requests }) => {
      state.text = script;
      const result = await submit({ scriptText: script });
      assert.equal(result.ok, true);
      assert.equal("preflight_report_id" in (requests.find((request) => request.method === "POST")?.body ?? {}), false);
    });
  });
}

test("unresolved research warnings are advisory and do not enter script approval authority", async () => {
  const research: HearthResearchResult = {
    mode: "knowledge_first",
    runtimeStatus: "partial",
    sources: [],
    synthesis: { summary: "", keyPoints: [], uncertainties: ["Open question"], coverageNote: "Partial" },
    artifact: {
      briefFingerprint: "brief-1",
      workpieceId,
      status: "partial",
      findings: [],
      uncertainties: ["A source remains unresolved."],
      editorialInterpretation: [],
    },
  };
  const report = buildHearthEditorialPreflightReport({ scriptText: A, researchResult: research });
  assert.equal(report.findings.some((finding) => finding.code === "unanswered_research"), true);
  await withAuthority(async ({ submit, requests }) => {
    assert.equal((await submit()).ok, true);
    assert.equal("preflight_report_id" in (requests.find((request) => request.method === "POST")?.body ?? {}), false);
  });
});

test("a hydration/context change during canonical read prevents approval submission", async () => {
  await withAuthority(async ({ submit, state, requests }) => {
    const scope = { workspaceId, workpieceId, draftId: workpieceId, draftVersion: 1, revisionId: null };
    const authority = createHearthOperationAuthority(scope), token = authority.begin("ap");
    state.onRead = () => authority.updateScope({ ...scope, draftVersion: 2 });
    assert.equal((await submit({ isCurrent: () => authority.isCurrent(token) })).ok, false);
    assert.equal(requests.some(r => r.method === "POST"), false);
  });
});

test("duplicate approval reuses its operation identity and accepts canonical no_change", async () => {
  await withAuthority(async ({ submit, requests }) => {
    const first = await submit(), second = await submit();
    assert.equal(first.ok, true); assert.equal(second.ok, true);
    if (!first.ok || !second.ok) return;
    assert.equal(first.authority.disposition, "committed");
    assert.equal(second.authority.disposition, "no_change");
    assert.equal(first.authority.approvalId, second.authority.approvalId);
    const posts = requests.filter(r => r.method === "POST");
    assert.equal(posts[0]?.body.operation_id, posts[1]?.body.operation_id);
  });
});

for (const rejection of ["revision_conflict", "stale_source", "invalid_script"]) {
  test(`server-side ${rejection} remains a failed approval`, async () => {
    await withAuthority(async ({ submit, state }) => {
      state.rejection = rejection;
      assert.equal((await submit()).ok, false);
    });
  });
}

test("revoked authorization is not bypassed", async () => {
  await withAuthority(async ({ submit, state, requests }) => {
    state.deny = true;
    assert.equal((await submit()).ok, false);
    assert.equal(requests.some(r => r.method === "POST"), false);
  });
});
