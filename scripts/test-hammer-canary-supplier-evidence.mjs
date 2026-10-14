import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  CANARY_USAGE_ANCHOR,
  EVIDENCE_WINDOW,
  analyzeEvidence,
  collectEvidence,
  evidenceQueries,
  fetchReadOnlyPages,
  writeEvidenceArtifacts,
} from "./lib/hammer-canary-supplier-evidence.mjs";

const SECRET = "admin-secret-must-never-appear";
const PROJECT = "proj_test_private_identity";

function response(payload, headers = {}) {
  return new Response(JSON.stringify(payload), { status: 200, headers });
}

function usageBucket(startTime, results = []) {
  return {
    object: "bucket",
    start_time: startTime,
    end_time: startTime + 60,
    results,
  };
}

function completeUsagePayload() {
  const data = [];
  for (
    let cursor = EVIDENCE_WINDOW.startTime;
    cursor < EVIDENCE_WINDOW.endTime;
    cursor += 60
  ) {
    const results =
      cursor === EVIDENCE_WINDOW.startTime
        ? [
            {
              project_id: PROJECT,
              api_key_id: "key_target",
              model: CANARY_USAGE_ANCHOR.model,
              service_tier: CANARY_USAGE_ANCHOR.serviceTier,
              batch: false,
              api_source: "api",
              input_tokens: 118,
              input_cached_tokens: 0,
              output_tokens: 35,
              num_model_requests: 1,
            },
          ]
        : [];
    data.push(usageBucket(cursor, results));
  }
  return { object: "page", data, has_more: false, next_page: null };
}

function costPayload() {
  return {
    object: "page",
    data: [
      {
        object: "bucket",
        start_time: EVIDENCE_WINDOW.startTime,
        end_time: EVIDENCE_WINDOW.endTime,
        results: [
          {
            project_id: PROJECT,
            api_key_id: "key_target",
            line_item: "completions",
            api_source: "api",
            amount: { value: 0.000246, currency: "usd" },
            quantity: 1,
            quantity_unit: "requests",
          },
        ],
      },
    ],
    has_more: false,
    next_page: null,
  };
}

function rawPage(payload, headers = {}) {
  return {
    request: {
      method: "GET",
      url: "https://api.openai.com/v1/organization/costs",
    },
    response: { status: 200, headers, raw_body: JSON.stringify(payload) },
  };
}

test("queries are fixed to the exact exclusive UTC window and documented grouping", () => {
  const queries = evidenceQueries(PROJECT);
  for (const query of [queries.usage, queries.costs]) {
    assert.equal(query.parameters.start_time, 1_791_331_200);
    assert.equal(query.parameters.end_time, 1_791_417_600);
    assert.deepEqual(query.parameters.project_ids, [PROJECT]);
  }
  assert.equal(queries.usage.parameters.bucket_width, "1m");
  assert.deepEqual(queries.usage.parameters.group_by, [
    "project_id",
    "api_key_id",
    "model",
    "service_tier",
    "batch",
    "api_source",
  ]);
  assert.equal(queries.costs.parameters.bucket_width, "1d");
  assert.deepEqual(queries.costs.parameters.group_by, [
    "project_id",
    "api_key_id",
    "line_item",
    "api_source",
  ]);
});

test("collector can issue only allowlisted GET requests and paginates to a terminal page", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1
      ? response({ data: [], has_more: true, next_page: "cursor-2" })
      : response({ data: [], has_more: false, next_page: null });
  };
  const pages = await fetchReadOnlyPages({
    fetchImpl,
    adminKey: SECRET,
    path: "/v1/organization/costs",
    parameters: {
      start_time: EVIDENCE_WINDOW.startTime,
      end_time: EVIDENCE_WINDOW.endTime,
    },
  });
  assert.equal(pages.length, 2);
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.body, undefined);
  assert.match(calls[1].url, /page=cursor-2/);
  assert.doesNotMatch(JSON.stringify(pages), new RegExp(SECRET));
  await assert.rejects(
    () =>
      fetchReadOnlyPages({
        fetchImpl,
        adminKey: SECRET,
        path: "/v1/chat/completions",
        parameters: {},
      }),
    /endpoint_not_allowed/,
  );
});

test("API errors and malformed pagination fail closed", async () => {
  await assert.rejects(
    () =>
      fetchReadOnlyPages({
        fetchImpl: async () => new Response("private failure", { status: 503 }),
        adminKey: SECRET,
        path: "/v1/organization/costs",
        parameters: {},
      }),
    /http_503/,
  );
  await assert.rejects(
    () =>
      fetchReadOnlyPages({
        fetchImpl: async () =>
          response({ data: [], has_more: true, next_page: null }),
        adminKey: SECRET,
        path: "/v1/organization/costs",
        parameters: {},
      }),
    /next_page_missing/,
  );
});

test("analysis distinguishes complete collection from unresolved model-level cost attribution", () => {
  const analysis = analyzeEvidence({
    usagePages: [
      rawPage(completeUsagePayload(), {
        "openai-organization": "org_test",
        "openai-project": PROJECT,
      }),
    ],
    costPages: [
      rawPage(costPayload(), {
        "openai-organization": "org_test",
        "openai-project": PROJECT,
      }),
    ],
    projectId: PROJECT,
  });
  assert.equal(analysis.collection_status, "complete");
  assert.equal(analysis.usage.known_canary_anchor_matches, true);
  assert.equal(analysis.costs.model_level_attribution_available, false);
  assert.equal(analysis.costs.exact_canary_cost_attribution_established, false);
  assert.equal(
    analysis.costs.unrelated_traffic_sharing_bucket_status,
    "not_observed_but_not_excluded_at_daily_cost_granularity",
  );
  assert.equal(analysis.costs.target_api_key_total_usd, 0.000246);
});

test("missing buckets are explicitly incomplete rather than silently accepted", () => {
  const analysis = analyzeEvidence({
    usagePages: [
      rawPage({
        data: [usageBucket(EVIDENCE_WINDOW.startTime)],
        has_more: false,
        next_page: null,
      }),
    ],
    costPages: [rawPage(costPayload())],
    projectId: PROJECT,
  });
  assert.equal(analysis.collection_status, "incomplete");
  assert.equal(
    analysis.bucket_completeness.usage_bucket_coverage_complete,
    false,
  );
});

test("artifacts preserve raw evidence, redact identities from the summary, and include digests", async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(init.method, "GET");
    return String(url).includes("/usage/completions")
      ? response(completeUsagePayload(), {
          "openai-organization": "org_test",
          "openai-project": PROJECT,
        })
      : response(costPayload(), {
          "openai-organization": "org_test",
          "openai-project": PROJECT,
        });
  };
  const evidence = await collectEvidence({
    fetchImpl,
    adminKey: SECRET,
    projectId: PROJECT,
  });
  assert.doesNotMatch(evidence.rawJson, new RegExp(SECRET));
  assert.doesNotMatch(evidence.summary, new RegExp(SECRET));
  assert.doesNotMatch(evidence.summary, new RegExp(PROJECT));
  assert.match(evidence.rawJson, new RegExp(PROJECT));

  const parent = await mkdtemp(join(tmpdir(), "hammer-evidence-test-"));
  const output = join(parent, "evidence");
  try {
    await writeEvidenceArtifacts({ outputDirectory: output, ...evidence });
    assert.deepEqual((await readdir(output)).sort(), [
      "SHA256SUMS",
      "SUMMARY.md",
      "evidence-manifest.json",
      "raw-openai-evidence.json",
    ]);
    const checksums = await readFile(join(output, "SHA256SUMS"), "utf8");
    assert.match(checksums, /^[a-f0-9]{64}  raw-openai-evidence\.json/m);
    const manifest = JSON.parse(
      await readFile(join(output, "evidence-manifest.json"), "utf8"),
    );
    assert.equal(manifest.reconciliation_authorized, false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("workflow is manual-only, least privilege, short-lived, and disconnected from reconciliation/database paths", async () => {
  const workflow = await readFile(
    new URL(
      "../.github/workflows/hammer-6c-supplier-evidence.yml",
      import.meta.url,
    ),
    "utf8",
  );
  const collector = await readFile(
    new URL("./collect-hammer-canary-supplier-evidence.mjs", import.meta.url),
    "utf8",
  );
  const helper = await readFile(
    new URL("./lib/hammer-canary-supplier-evidence.mjs", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /\bon:\s*\r?\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\b(schedule|push|pull_request):/);
  assert.match(workflow, /permissions:\s*\r?\n\s+contents: read/);
  assert.match(workflow, /environment: openai-billing-evidence/);
  assert.match(
    workflow,
    /HAMMER_SUPPLIER_EVIDENCE_DIR: \$\{\{ runner\.temp \}\}\/hammer-6c-supplier-evidence/,
  );
  assert.match(workflow, /retention-days: 1/);
  assert.doesNotMatch(workflow, /SUPABASE|SERVICE_ROLE|reconcile-openai/);
  assert.doesNotMatch(
    `${collector}\n${helper}`,
    /recordOpenAiOrganizationEvidence|supabase|reconcile-openai-organization-costs/iu,
  );
  assert.match(collector, /HAMMER_SUPPLIER_EVIDENCE_DIR_required/);
  assert.doesNotMatch(collector, /\.private-evidence/);
  assert.doesNotMatch(helper, /method:\s*["']POST["']/);
});
