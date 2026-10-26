# Gate 6C PR hosted-write isolation

Gate 6C removes hosted Supabase credentials and write-capable tests from ordinary pull-request validation. It does not authorize a hosted run, create an environment, configure secrets, open a pull request, or change any external integration.

## Repository audit

Two workflows run for a pull request targeting `main`:

- `.github/workflows/pr-smoke.yml` runs `nursery:fast`, `nursery:build`, `nursery:integration`, `barstock:production`, `database:lineage`, `nursery:media`, `nursery:browser`, `hammer:production`, `hammer:test-all`, `hammer:coverage`, `vsm:evolution-check`, and `smoke:core`. The database and browser jobs create job-owned disposable local Supabase stacks. No job now references a hosted Supabase secret. `vsm:evolution-check` can create or update a GitHub pull-request comment using the workflow token; it does not receive provider credentials.
- `.github/workflows/database-frozen-evidence.yml` verifies frozen Git evidence on Ubuntu. It has `contents: read`, receives no secret, starts no database, and performs no hosted operation.

Before Gate 6C, `smoke:preflight` treated secret presence as authorization. It passed repository secrets to two jobs after checkout of the pull-request merge commit:

- `smoke:team` could obtain a service-role key directly or through a Supabase management access token, create nine Auth users, create workspaces and invites, update memberships and invite expiry, and delete workspaces/Auth users during best-effort cleanup.
- `smoke:hearth-phase4` signed in a hosted test account, wrote an authenticated Playwright state file, and exercised hosted workspace/workpiece application paths with the service-role key available to the checked-out code.

Fork pull requests normally do not receive repository secrets, but same-repository pull requests did. Secret withholding for forks was not a sufficient boundary, and `workflow_dispatch` used the same weak secret-presence decision. No label or environment approval was involved.

Other repository workflows do not run on pull requests. `hammer-6c-supplier-evidence.yml` is manual and main-restricted; it reads OpenAI usage/cost evidence. `openai-billing-evidence.yml` is manual but is **not** main-restricted: its model-visibility and reconciliation paths run the selected workflow revision with environment credentials and POST evidence through a Supabase service role. The OpenAI requests are documented as non-generating, but the Supabase evidence writes are real. Both workflows reference `openai-billing-evidence`; their external protection configuration is unknown, and the unrestricted-ref workflow requires separate hardening/review before use. Repository YAML contains no `pull_request_target`, `workflow_run`, `repository_dispatch`, reusable `workflow_call`, hosted migration command, `netlify deploy`, or automatic provider deployment job.

## New trust boundary

Hosted team and Hearth smoke capability now exists only in `.github/workflows/hosted-nonproduction-smoke.yml`:

1. The only trigger is `workflow_dispatch`; a label, pull request, comment, or dispatch payload cannot start it.
2. The job-level condition requires the workflow to run from `refs/heads/main` and requires the exact `RUN_NONPRODUCTION_HOSTED_SMOKE` confirmation. A failed condition occurs before environment secrets are released.
3. The job references the fixed `forge-nonproduction-hosted-smoke` GitHub environment. Before any Supabase operation, trusted main code uses the read-only workflow token and GitHub's fixed environment APIs to require at least one reviewer, prevention of self-review, custom branch-policy mode, and exactly one permitted branch: `main`. An API denial, malformed response, missing control, broad pattern, or extra branch fails the run. The owner must also store all hosted credentials only in that environment; repository secrets are not an acceptable substitute.
4. The environment must independently define `FORGE_HOSTED_SMOKE_ENABLED=true` and `FORGE_NONPROD_SUPABASE_PROJECT_REF`. The verifier matches that reviewed project ref to the project ref parsed from the secret HTTPS Supabase URL. It rejects malformed refs, mismatches, and the known production ref `wtvdjndyxegudufrompx`.
5. The workflow checks out only `github.sha` from the main dispatch and proves that SHA is an ancestor of `origin/main` before running repository code. It accepts no caller-provided checkout ref or SQL. Pull-request code is never executed with hosted credentials.
6. Every credential is mandatory. The former management-token fallback is removed. Hosted credentials are scoped only to the validation and smoke steps that need them; checkout, action setup, dependency installation, and browser installation do not receive them. The verifier returns only non-secret identity facts and credential-presence booleans.
7. The job removes its generated `.env.local` and Playwright state in an `always()` step. GitHub-hosted runners are still relied on for ephemeral runner disposal; this is not a claim of forensic memory erasure.

The environment approval is the authorizing boundary. The typed phrase is deliberate confirmation, not authorization by itself. The API readback independently establishes the protection configuration at execution time; owner review must still establish secret placement and the nonproduction project identity. Until those external properties are verified, the hosted workflow must remain disabled.

## Regression contract

Run:

```powershell
node --test scripts/tests/hosted-smoke-authorization.test.mjs
```

The tests use synthetic strings and mock GitHub responses only and make no network request. They prove rejection of an ordinary PR, a fork-like pull ref, a same-repository feature ref, a forged phrase, a wrong environment, missing enablement, a missing/malformed/mismatched project, the known production project, missing credentials, a malformed commit SHA, absent reviewers, permitted self-review, and missing/broad/extra deployment branch policies. Static assertions also require both PR workflows to remain hosted-secret-free and forbid a management-token fallback in the manual workflow.

## External owner verification before a pull request or merge

Repository inspection cannot establish external settings. The owner must record screenshots or exported settings, timestamps, and reviewer identity for each item below without changing it during this gate:

1. **Supabase GitHub integration:** In Project Settings > Integrations, identify the connected repository, working directory, Automatic branching state, Supabase-changes-only state, production branch, and **Deploy to production** state. Current Supabase behavior applies repository migrations to GitHub-connected branches and can automatically deploy new migrations and Edge Functions when production deployment is enabled. Any automatic production migration path is a release blocker until separately approved.
2. **GitHub environment:** Confirm `forge-nonproduction-hosted-smoke` exists; its deployment branch policy permits only `main`; required reviewers are configured; self-review is prevented; `FORGE_HOSTED_SMOKE_ENABLED` and the one nonproduction project ref are environment variables; and all listed Supabase/test credentials are environment secrets rather than repository/organization secrets. Confirm no bypass policy defeats the review requirement.
3. **GitHub repository/organization settings:** Inventory Actions secrets, variables, environment inheritance, Actions event/actor policies, branch protection, required checks, deploy keys, installed GitHub Apps, webhooks, and Actions allowed to run. Confirm no secret with hosted write authority remains available to `pull_request` jobs.
4. **Netlify:** Confirm deploy previews for pull requests, the production branch, build hooks, deploy hooks, environment-variable scopes, and whether a merge/push to `main` automatically publishes. Forge production remains Git-backed from `main`; this audit makes no Netlify change.
5. **Other external automation:** Inventory Supabase branches, scheduled jobs, provider dashboards, repository webhooks, and installed integrations that react to pull requests, pushes, or merges. Repository YAML cannot prove their absence.

Supabase preview branches are data-less by default but still apply repository migrations; their creation can also incur plan-dependent resources. Gate 6C neither enables nor treats them as disposable-local proof. No integration pull request or merge is safe while the owner cannot rule out an automatic write to the production Supabase project.

## Owner approval gates

Opening the database integration pull request requires: clean local certification, the two PR workflows remaining credential-free, recorded external-settings review, and a demonstrated block on automatic production migration. Running hosted nonproduction smoke is a separate authorization through the protected environment. Merging, hosted migration, application deployment, and production smoke are each later and independent approvals.
