import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import {
  commitCanonicalHearthResearch,
  commitHearthPreflight,
  completeHearthPreflightReview,
  decideHearthPreflightFinding,
  readCurrentHearthPreflight,
} from "../src/lib/hearth-research-preflight-authority";
import type { HearthResearchResult } from "../src/lib/hearth-research-contract";

const WORKSPACE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORKPIECE_ID = "11111111-1111-4111-8111-111111111111";
const REPORT_ID = "22222222-2222-4222-8222-222222222222";
const ARTIFACT_ID = "33333333-3333-4333-8333-333333333333";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function installRuntime(): () => void {
  const runtime = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const previousWindow = runtime.window;
  const previousCrypto = globalThis.crypto;
  runtime.window = { location: { search: "?tongs_api_token=test-token" }, localStorage: { getItem: () => null } } as unknown as Window & typeof globalThis;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
  return () => {
    if (previousWindow === undefined) Reflect.deleteProperty(runtime, "window"); else runtime.window = previousWindow;
    Object.defineProperty(globalThis, "crypto", { configurable: true, value: previousCrypto });
  };
}

function result(summary: string): HearthResearchResult {
  return {
    mode: "retrieval_first",
    runtimeStatus: "partial",
    brief: { schema: "forge.hearth.research-brief.v1", workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, briefFingerprint: "brief-12345678", creatorRequest: "Use these notes", episodeTitle: "Episode", goals: ["Check the claim"], queries: [], sourcePriorities: [] },
    artifact: { briefFingerprint: "brief-12345678", workpieceId: WORKPIECE_ID, status: "partial", findings: [{ text: "Creator supplied lead", status: "uncertain", provenanceStatus: "creator_supplied_unverified", sourceIds: [] }], uncertainties: ["Claim remains unresolved"], editorialInterpretation: [] },
    creatorClaims: [{ claimId: "claim-1", text: "Creator supplied lead", provenanceStatus: "creator_supplied_unverified", scope: "current_subject", sourceIds: [] }],
    sources: [],
    synthesis: { summary, keyPoints: [], uncertainties: [], coverageNote: "Partial" },
  };
}

test("research commits are workpiece-scoped and retry-stable without provider traffic", async () => {
  const restore = installRuntime();
  const originalFetch = globalThis.fetch;
  const posts: Record<string, unknown>[] = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    assert.match(url, new RegExp(`/tongs/workpieces/${WORKPIECE_ID}/hearth-research`));
    assert.doesNotMatch(url, /\/api\/hearth\/chat|openai|runway/i);
    if ((init?.method ?? "GET") === "GET") return response({ ok: true, data: { disposition: "empty", artifact: null } });
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    posts.push(body);
    return response({ ok: true, data: { disposition: "committed", artifact: { id: ARTIFACT_ID, revision: 1, artifact_content_hash: "a".repeat(64) } } });
  }) as typeof fetch;
  try {
    await commitCanonicalHearthResearch({ workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, result: result("One") });
    await commitCanonicalHearthResearch({ workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, result: result("One") });
    await commitCanonicalHearthResearch({ workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, result: result("Two") });
    assert.equal(posts.length, 3);
    assert.equal(posts[0]?.workspace_id, WORKSPACE_ID);
    assert.equal(posts[0]?.operation_id, posts[1]?.operation_id);
    assert.notEqual(posts[0]?.operation_id, posts[2]?.operation_id);
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test("preflight, acknowledgement, and review use only deterministic Tongs routes", async () => {
  const restore = installRuntime();
  const originalFetch = globalThis.fetch;
  const script = "[s1]\nA creator-supplied claim remains unresolved, and the project costs $12 million.\n[/s1]\n";
  const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(script));
  const scriptHash = Buffer.from(digest).toString("hex");
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    requests.push({ url, body });
    assert.doesNotMatch(url, /\/api\/hearth\/chat|openai|runway/i);
    if (url.includes("read-file")) return response({ ok: true, file_row: { revision: 4, hash_value: scriptHash } });
    if (url.includes("hearth-preflight/finding")) return response({ ok: true, data: { disposition: "saved" } });
    if (url.includes("hearth-preflight/review")) return response({ ok: true, data: { disposition: "reviewed" } });
    if ((init?.method ?? "GET") === "GET") return response({ ok: true, data: { disposition: "empty", report: null } });
    return response({ ok: true, data: { disposition: "committed", report: { id: REPORT_ID, revision: 1 } } });
  }) as typeof fetch;
  try {
    const authority = await commitHearthPreflight({ workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, scriptText: script, research: null });
    assert.equal(authority.report.usedPaidAi, false);
    const warning = authority.findings.find((finding) => finding.severity === "warning");
    assert.ok(warning);
    await decideHearthPreflightFinding({ workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, reportId: REPORT_ID, finding: warning, action: "acknowledge" });
    await completeHearthPreflightReview({ workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID, reportId: REPORT_ID });
    assert.ok(requests.some((entry) => entry.url.includes("hearth-preflight/finding")));
    assert.ok(requests.some((entry) => entry.url.includes("hearth-preflight/review")));
    assert.equal(requests.some((entry) => entry.url.includes("/api/hearth/chat")), false);
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test("reload and navigation hydrate durable handled dispositions from Tongs", async () => {
  const restore = installRuntime();
  const originalFetch = globalThis.fetch;
  const finding = {
    id: "unsupported-name-stable",
    code: "unsupported_name",
    severity: "warning",
    category: "claims",
    message: "Review this name.",
    excerpt: "The same canonical claim.",
  } as const;
  let reads = 0;
  globalThis.fetch = (async () => {
    reads += 1;
    return response({ ok: true, data: {
      disposition: "current",
      report: {
        id: REPORT_ID,
        revision: 3,
        source_file_revision: 4,
        script_content_hash: "b".repeat(64),
        research_artifact_id: null,
        research_artifact_hash: null,
        report_json: {
          schema: "forge.hearth.editorial-preflight.v1",
          checkerContractVersion: "forge.hearth.editorial-preflight.deterministic.v1",
          usedPaidAi: false,
          findings: [finding],
          summary: { blockers: 0, warnings: 1, notes: 0 },
        },
      },
      review: null,
      findings: [{ finding_json: finding, latest_action: "resolve" }],
    } });
  }) as typeof fetch;
  try {
    const first = await readCurrentHearthPreflight({ workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID });
    const afterNavigation = await readCurrentHearthPreflight({ workspaceId: WORKSPACE_ID, workpieceId: WORKPIECE_ID });
    assert.equal(first?.findings[0]?.latestAction, "resolve");
    assert.equal(afterNavigation?.findings[0]?.latestAction, "resolve");
    assert.equal(first?.reviewed, false);
    assert.equal(reads, 2);
  } finally { globalThis.fetch = originalFetch; restore(); }
});
