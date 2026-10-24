import { pathToFileURL } from "node:url";
import { HOSTED_SMOKE_ENVIRONMENT } from "./verify-hosted-smoke-authorization.mjs";

const apiVersion = "2026-03-10";
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

async function readJson(response, label) {
  if (!response || response.status !== 200) {
    throw new Error(`${label} could not be verified (HTTP ${response?.status ?? "unknown"}).`);
  }
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${label} returned an unexpected content type.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${label} returned invalid JSON.`);
  }
}

export async function verifyGitHubHostedSmokeEnvironment(
  { repository, token, environmentName = HOSTED_SMOKE_ENVIRONMENT },
  fetchImpl = globalThis.fetch,
) {
  if (!repositoryPattern.test(String(repository ?? ""))) {
    throw new Error("GitHub repository identity is missing or malformed.");
  }
  if (!String(token ?? "")) {
    throw new Error("GitHub workflow token is missing.");
  }
  if (environmentName !== HOSTED_SMOKE_ENVIRONMENT) {
    throw new Error("GitHub environment identity is not approved.");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("GitHub environment verification is unavailable.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const base = `https://api.github.com/repos/${repository}/environments/${encodeURIComponent(environmentName)}`;
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": apiVersion,
    "user-agent": "podcasters-forge-hosted-smoke-guard",
  };

  try {
    const environment = await readJson(
      await fetchImpl(base, { method: "GET", headers, signal: controller.signal }),
      "GitHub environment",
    );
    if (environment?.name !== environmentName) {
      throw new Error("GitHub environment response identified a different environment.");
    }
    const reviewerRule = Array.isArray(environment?.protection_rules)
      ? environment.protection_rules.find((rule) => rule?.type === "required_reviewers")
      : null;
    if (!reviewerRule || reviewerRule.prevent_self_review !== true) {
      throw new Error("GitHub environment must require reviewers and prevent self-review.");
    }
    if (!Array.isArray(reviewerRule.reviewers) || reviewerRule.reviewers.length < 1) {
      throw new Error("GitHub environment has no required reviewer.");
    }
    const branchPolicy = environment?.deployment_branch_policy;
    if (branchPolicy?.protected_branches !== false || branchPolicy?.custom_branch_policies !== true) {
      throw new Error("GitHub environment must use an explicit custom branch policy.");
    }

    const policies = await readJson(
      await fetchImpl(`${base}/deployment-branch-policies?per_page=100`, {
        method: "GET",
        headers,
        signal: controller.signal,
      }),
      "GitHub environment branch policy",
    );
    if (policies?.total_count !== 1 || !Array.isArray(policies?.branch_policies)) {
      throw new Error("GitHub environment must have exactly one deployment branch policy.");
    }
    const policy = policies.branch_policies[0];
    if (policy?.name !== "main" || (policy?.type != null && policy.type !== "branch")) {
      throw new Error("GitHub environment deployment policy must allow only the main branch.");
    }

    return Object.freeze({
      ok: true,
      repository,
      environmentName,
      requiredReviewers: reviewerRule.reviewers.length,
      preventSelfReview: true,
      branchPolicy: "main",
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("GitHub environment verification timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const result = await verifyGitHubHostedSmokeEnvironment({
    repository: process.env.FORGE_GITHUB_REPOSITORY,
    token: process.env.FORGE_GITHUB_TOKEN,
    environmentName: process.env.FORGE_HOSTED_SMOKE_ENVIRONMENT,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "GitHub environment verification failed."}\n`);
    process.exitCode = 1;
  });
}
