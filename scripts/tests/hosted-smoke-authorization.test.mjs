import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  HOSTED_SMOKE_AUTHORIZATION,
  HOSTED_SMOKE_ENVIRONMENT,
  verifyHostedSmokeAuthorization,
} from "../verify-hosted-smoke-authorization.mjs";
import { verifyGitHubHostedSmokeEnvironment } from "../verify-github-hosted-smoke-environment.mjs";

const root = path.resolve(import.meta.dirname, "..", "..");
const prWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "pr-smoke.yml"), "utf8");
const hostedWorkflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "hosted-nonproduction-smoke.yml"),
  "utf8",
);
const databaseWorkflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "database-frozen-evidence.yml"),
  "utf8",
);

const valid = Object.freeze({
  eventName: "workflow_dispatch",
  gitRef: "refs/heads/main",
  gitSha: "a".repeat(40),
  authorization: HOSTED_SMOKE_AUTHORIZATION,
  environmentName: HOSTED_SMOKE_ENVIRONMENT,
  enabled: "true",
  configuredProjectRef: "abcdefghijklmnopqrst",
  supabaseUrl: "https://abcdefghijklmnopqrst.supabase.co/",
  anonKeyPresent: true,
  serviceRoleKeyPresent: true,
  authEmailPresent: true,
  authPasswordPresent: true,
  workspaceIdPresent: true,
  workpieceIdPresent: true,
});

function reject(overrides, pattern) {
  assert.throws(() => verifyHostedSmokeAuthorization({ ...valid, ...overrides }), pattern);
}

test("ordinary PR workflows contain no hosted Supabase credentials or write smokes", () => {
  assert.match(prWorkflow, /pull_request:/);
  assert.doesNotMatch(prWorkflow, /secrets\.NURSERY_SUPABASE/);
  assert.doesNotMatch(prWorkflow, /smoke:team/);
  assert.doesNotMatch(prWorkflow, /smoke:hearth-phase4/);
  assert.doesNotMatch(prWorkflow, /pull_request_target:/);
  assert.match(prWorkflow, /packages: read/);
  assert.match(prWorkflow, /docker login ghcr\.io --username "\$GITHUB_ACTOR" --password-stdin/);
  assert.ok(
    prWorkflow.indexOf("Authenticate public-image pulls to GHCR") <
      prWorkflow.indexOf("Start certified baseline Supabase"),
    "registry authentication must precede disposable Supabase startup",
  );
  assert.doesNotMatch(prWorkflow, /docker login[^\n]*--password(?:\s|=)/);
  assert.match(prWorkflow, /diagnostic\.errorCategories\?\.includes\('registry_rate_limit'\)/);
  assert.match(prWorkflow, /for attempt in 1 2 3/);
  assert.match(prWorkflow, /COMPOSE_PARALLEL_LIMIT: "1"/);
  assert.doesNotMatch(prWorkflow, /includes\('image_pull_failed'\)/);
});

test("database-only PR workflow is credential-free and local", () => {
  assert.match(databaseWorkflow, /pull_request:/);
  assert.doesNotMatch(databaseWorkflow, /secrets\./);
  assert.doesNotMatch(databaseWorkflow, /supabase db push|migration repair|--include-all/);
});

test("hosted workflow is manual, main-only, protected, and has no management token fallback", () => {
  assert.match(hostedWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(hostedWorkflow, /pull_request(?:_target)?:/);
  assert.match(hostedWorkflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(hostedWorkflow, /environment: forge-nonproduction-hosted-smoke/);
  assert.match(hostedWorkflow, /git merge-base --is-ancestor/);
  assert.match(hostedWorkflow, /verify-github-hosted-smoke-environment\.mjs/);
  assert.match(hostedWorkflow, /actions: read/);
  assert.match(hostedWorkflow, /FORGE_NONPROD_SUPABASE_PROJECT_REF: \$\{\{ vars\./);
  assert.doesNotMatch(hostedWorkflow, /SUPABASE_ACCESS_TOKEN/);
  assert.doesNotMatch(hostedWorkflow, /github\.event\.pull_request|inputs\.commit|checkout@.*head/);
  assert.doesNotMatch(hostedWorkflow.slice(0, hostedWorkflow.indexOf("    steps:")), /secrets\./);
  assert.ok(
    hostedWorkflow.indexOf("pnpm install --frozen-lockfile") < hostedWorkflow.indexOf("secrets.NURSERY_SUPABASE_URL"),
    "dependency installation must occur before any hosted credential is injected",
  );
});

test("approved nonproduction dispatch passes without revealing credentials", () => {
  const result = verifyHostedSmokeAuthorization(valid);
  assert.deepEqual(result, {
    ok: true,
    eventName: "workflow_dispatch",
    gitRef: "refs/heads/main",
    gitSha: "a".repeat(40),
    environmentName: HOSTED_SMOKE_ENVIRONMENT,
    projectRef: "abcdefghijklmnopqrst",
    credentialsPresent: true,
  });
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("PR, fork-like ref, and same-repository branch dispatches fail closed", () => {
  reject({ eventName: "pull_request" }, /requires workflow_dispatch/);
  reject({ gitRef: "refs/pull/17/merge" }, /requires refs\/heads\/main/);
  reject({ gitRef: "refs/heads/feature" }, /requires refs\/heads\/main/);
});

test("forged authorization and unauthorized environment fail closed", () => {
  reject({ authorization: "run-it" }, /authorization phrase is invalid/);
  reject({ environmentName: "production" }, /environment is not approved/);
  reject({ enabled: "false" }, /has not enabled hosted smoke/);
});

test("missing, malformed, mismatched, and production targets fail closed", () => {
  reject({ configuredProjectRef: "" }, /project ref is missing/);
  reject({ configuredProjectRef: "not-a-ref" }, /project ref is malformed/);
  reject({ supabaseUrl: "https://differentprojectref1.supabase.co/" }, /do not match/);
  reject(
    {
      configuredProjectRef: "wtvdjndyxegudufrompx",
      supabaseUrl: "https://wtvdjndyxegudufrompx.supabase.co/",
    },
    /known production project/,
  );
  reject({ supabaseUrl: "https://example.com/" }, /hosted HTTPS project endpoint/);
});

test("missing credentials and malformed commit fail closed", () => {
  for (const field of [
    "anonKeyPresent",
    "serviceRoleKeyPresent",
    "authEmailPresent",
    "authPasswordPresent",
    "workspaceIdPresent",
    "workpieceIdPresent",
  ]) {
    reject({ [field]: false }, /is missing/);
  }
  reject({ gitSha: "main" }, /full lowercase commit SHA/);
});

const protectedEnvironment = Object.freeze({
  name: HOSTED_SMOKE_ENVIRONMENT,
  protection_rules: [
    {
      type: "required_reviewers",
      prevent_self_review: true,
      reviewers: [{ type: "Team", reviewer: { id: 7 } }],
    },
    { type: "branch_policy" },
  ],
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
});

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function environmentFetch(environment = protectedEnvironment, policies = {
  total_count: 1,
  branch_policies: [{ id: 1, name: "main", type: "branch" }],
}) {
  return async (url, options) => {
    assert.match(url, /^https:\/\/api\.github\.com\/repos\/owner\/repo\/environments\//);
    assert.equal(options.method, "GET");
    assert.equal(options.headers.authorization, "Bearer synthetic-token");
    return url.includes("deployment-branch-policies")
      ? jsonResponse(policies)
      : jsonResponse(environment);
  };
}

test("protected GitHub environment and exact main policy pass", async () => {
  const result = await verifyGitHubHostedSmokeEnvironment(
    {
      repository: "owner/repo",
      token: "synthetic-token",
      environmentName: HOSTED_SMOKE_ENVIRONMENT,
    },
    environmentFetch(),
  );
  assert.deepEqual(result, {
    ok: true,
    repository: "owner/repo",
    environmentName: HOSTED_SMOKE_ENVIRONMENT,
    requiredReviewers: 1,
    preventSelfReview: true,
    branchPolicy: "main",
  });
  assert.doesNotMatch(JSON.stringify(result), /synthetic-token/);
});

test("missing environment review protection fails closed", async () => {
  const noReview = {
    ...protectedEnvironment,
    protection_rules: [{ type: "branch_policy" }],
  };
  await assert.rejects(
    verifyGitHubHostedSmokeEnvironment(
      { repository: "owner/repo", token: "synthetic-token" },
      environmentFetch(noReview),
    ),
    /require reviewers/,
  );

  const selfReview = {
    ...protectedEnvironment,
    protection_rules: [{
      type: "required_reviewers",
      prevent_self_review: false,
      reviewers: [{ type: "User", reviewer: { id: 1 } }],
    }],
  };
  await assert.rejects(
    verifyGitHubHostedSmokeEnvironment(
      { repository: "owner/repo", token: "synthetic-token" },
      environmentFetch(selfReview),
    ),
    /prevent self-review/,
  );
});

test("missing, broad, or extra branch policies fail closed", async () => {
  const cases = [
    { total_count: 0, branch_policies: [] },
    { total_count: 1, branch_policies: [{ id: 1, name: "*" }] },
    { total_count: 2, branch_policies: [{ id: 1, name: "main" }, { id: 2, name: "release/*" }] },
  ];
  for (const policies of cases) {
    await assert.rejects(
      verifyGitHubHostedSmokeEnvironment(
        { repository: "owner/repo", token: "synthetic-token" },
        environmentFetch(protectedEnvironment, policies),
      ),
      /exactly one deployment branch policy|allow only the main branch/,
    );
  }
});

test("GitHub API errors and malformed local identities fail closed without body disclosure", async () => {
  await assert.rejects(
    verifyGitHubHostedSmokeEnvironment(
      { repository: "owner/repo", token: "synthetic-token" },
      async () => jsonResponse({ secret: "raw-body-must-not-appear" }, 403),
    ),
    (error) => error.message.includes("HTTP 403") && !error.message.includes("raw-body"),
  );
  await assert.rejects(
    verifyGitHubHostedSmokeEnvironment({ repository: "bad", token: "synthetic-token" }, environmentFetch()),
    /repository identity is missing or malformed/,
  );
  await assert.rejects(
    verifyGitHubHostedSmokeEnvironment({ repository: "owner/repo", token: "" }, environmentFetch()),
    /workflow token is missing/,
  );
});
