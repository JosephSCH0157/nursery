# Owner-funded Hearth research release candidate

Status: inactive release candidate. It is not merged, deployed, migrated, funded, credentialed, canary-tested, or activated.

## Provenance

- Upstream baseline: `origin/main` at `55ac90d2ac6d6604771b14952418b5c5e7b3ed46`.
- Complete frozen Hearth baseline incorporated from `5a08fbbda9e78958efdd8507c7e23502c78f30bc`.
- Narrow paid-admission behavior incorporated from `c78593f834e985fec7d4bb7ddfe02c30b5169e13` without importing its ancestry.
- Baseline integration commit: `8c1219c7`.
- Dormant research implementation commit: `5fff5d05`.
- Inactive release preparation commit: `70b337ff`.
- Fail-closed integration correction commit: `150b9dce`.
- Migration identifier: `20261010120000_tongs_owner_funded_hearth_research.sql` (present but not applied).
- Original tested implementation snapshot: `C:\Users\Iam11\Documents\Codex\2026-09-12\next-bounded-owner-funded-hearth-research\work`.
- Isolated Git release-candidate worktree: `C:\Users\Iam11\Documents\Codex\2026-09-12\next-bounded-owner-funded-hearth-research\release-worktree`.

The eight existing cutover migrations `20260908180000` through `20260908180700` remain the `origin/main` versions. The eleven-route enforcement is unchanged. Owner chat remains unchanged and dormant.

## Exact changed-file list from origin/main

- `M apps/hearth/src/hooks/useApprovalFlow.ts`
- `M apps/hearth/src/hooks/useChatWorkspace.ts`
- `A apps/hearth/src/lib/hearth-ai-admission.ts`
- `M apps/hearth/src/lib/hearth-ai-runtime-contract.ts`
- `M apps/hearth/src/lib/hearth-chat-api.ts`
- `A apps/hearth/src/lib/hearth-chat-readiness.ts`
- `A apps/hearth/src/lib/hearth-editorial-preflight.ts`
- `M apps/hearth/src/lib/hearth-research-contract.ts`
- `A apps/hearth/src/lib/hearth-research-preflight-authority.ts`
- `M apps/hearth/src/lib/hearth-script-approval-authority.ts`
- `M apps/hearth/src/lib/hearth-script-mutation.ts`
- `M apps/hearth/src/lib/hearth-turn-contract.ts`
- `M apps/hearth/src/routes/HearthShell.tsx`
- `M apps/hearth/src/routes/hearth-shell/hearth-sources-contracts.ts`
- `M apps/hearth/src/routes/hearth-shell/useHearthCollectionController.ts`
- `M apps/hearth/src/routes/hearth-shell/useHearthSourcesController.ts`
- `M apps/hearth/src/views/SourcesView.tsx`
- `M apps/hearth/src/views/modes/HearthDraftScriptHeader.tsx`
- `A apps/hearth/src/views/modes/HearthPreflightPanel.tsx`
- `M apps/hearth/src/views/surfaces/ChatSurface.tsx`
- `A apps/hearth/tests/hearth-ai-admission-presentation.test.ts`
- `M apps/hearth/tests/hearth-chat-api.test.ts`
- `M apps/hearth/tests/hearth-confidence.test.ts`
- `A apps/hearth/tests/hearth-editorial-preflight.test.ts`
- `M apps/hearth/tests/hearth-format-only-wiring.test.ts`
- `M apps/hearth/tests/hearth-ready-transition-wiring.test.ts`
- `A apps/hearth/tests/hearth-research-preflight-authority.test.ts`
- `M apps/hearth/tests/hearth-script-mutation.test.ts`
- `M apps/hearth/tests/hearth-stabilization-blockers.test.tsx`
- `A apps/hearth/tests/hearth-turn-result.test.ts`
- `M apps/hearth/tests/hearth-writing-format.test.ts`
- `A apps/nursery/playwright/fixtures/hearth-authority-offline-harness.tsx`
- `A apps/nursery/playwright/fixtures/hearth-authority-offline.html`
- `A apps/nursery/playwright/hearth.nonbillable-authority.spec.ts`
- `M apps/nursery/server/billing/paid-json-openai-route.ts`
- `M apps/nursery/server/hearth/create-hearth-ai-handler.ts`
- `M apps/nursery/server/hearth/hearth-creator-research-ingest.ts`
- `M apps/nursery/server/hearth/hearth-research-runtime.ts`
- `M apps/nursery/server/hearth/hearth-runtime-config.ts`
- `A apps/nursery/server/hearth/hearth-source-evidence-policy.ts`
- `M apps/nursery/server/hearth/hearth-turn-decision.ts`
- `A apps/nursery/server/hearth/owner-hearth-research-execution.ts`
- `M apps/nursery/tests/hearth-ai-runtime.test.mts`
- `A apps/nursery/tests/hearth-episode-creation-certification-corpus.test.mts`
- `A apps/nursery/tests/hearth-episode-creation-sealed-canary.test.mts`
- `M apps/nursery/tests/hearth-paid-chat-handler.test.mts`
- `A apps/nursery/tests/hearth-prompt-isolation.test.mts`
- `M apps/nursery/tests/hearth-research-hygiene.test.mts`
- `A apps/nursery/tests/hearth-structural-ingestion.test.mts`
- `M apps/nursery/tests/hearth-turn-decision.test.mts`
- `A apps/nursery/tests/owner-hearth-research-execution.test.mts`
- `A docs/billing/OWNER_FUNDED_HEARTH_RESEARCH_IMPLEMENTATION.md`
- `A docs/billing/OWNER_FUNDED_HEARTH_RESEARCH_RELEASE_CANDIDATE.md`
- `A docs/billing/proposals/owner-hearth-research-v1.activation.sql`
- `A docs/billing/proposals/owner-hearth-research-v1.release-manifest.json`
- `M package.json`
- `M packages/tongs/src/customer-spending-confirmation.ts`
- `M packages/tongs/src/workpiece-commit-api.ts`
- `A packages/tongs/tests/hearth-research-preflight-authority.test.mjs`
- `M packages/tongs/tests/workpiece-commit-api.test.mjs`
- `A scripts/test-owner-hearth-research-release-candidate.mjs`
- `M scripts/verify-hearth-access-funding-isolated.mjs`
- `A supabase/migrations/20261010120000_tongs_owner_funded_hearth_research.sql`
- `A supabase/tests/owner_funded_hearth_research.sql`

## Corrected owner limits

The proposed additional owner authorization is exactly `21526788` micros. It comprises `136456` canary execution, `21306560` ten-action session execution, and `83772` for eleven retained packages and bounded recovery. With 33 micros of aggregate risk and the existing `10840000` micros, the one shared ceiling is `32366821` micros.

The canary is Astra-only: 8,000 input tokens, 1,000 output tokens, one Brave search, two retained sources, 24 total HTTP attempts, one OpenAI attempt, concurrency one, 60 seconds, and 24-hour authority. Its OpenAI, search, and platform ceilings are 130000, 5000, and 1456 micros. Package-one storage is 7616 micros, making the quote 144072 and aggregate admission 144075 micros.

The ten-action session is dormant until a reconciled canary. Its maximum execution cost is 2130656 micros per action before storage. Packages two through ten receive 7616 micros each and package eleven receives 7612, producing nine quotes of 2138272 and one of 2138268 micros. The unreconciled session loss limit is 4276544 micros.

“Reconciled canary” is the database-enforced result of `read_owner_hearth_research_canary_reconciliation`: terminal settlement, zero customer charge, conservative supplier exposure retained, no unknown or resubmittable stage, no active provider lease, exact frozen/provider/canonical identities, saved package and sources, review state, and bounded recovery readback. Authoritative provider billing is used when available but is not a prerequisite and creates no waiting period.

## Files in the dormant implementation commit

- `package.json`
- `scripts/verify-hearth-access-funding-isolated.mjs`
- `supabase/tests/owner_funded_hearth_research.sql`
- `docs/billing/OWNER_FUNDED_HEARTH_RESEARCH_IMPLEMENTATION.md`
- `supabase/migrations/20261010120000_tongs_owner_funded_hearth_research.sql`
- `packages/tongs/src/customer-spending-confirmation.ts`
- `apps/hearth/src/hooks/useChatWorkspace.ts`
- `apps/hearth/src/lib/hearth-chat-api.ts`
- `apps/nursery/server/hearth/owner-hearth-research-execution.ts`
- `apps/nursery/server/hearth/hearth-runtime-config.ts`
- `apps/nursery/server/hearth/hearth-research-runtime.ts`
- `apps/nursery/server/hearth/create-hearth-ai-handler.ts`
- `apps/nursery/tests/owner-hearth-research-execution.test.mts`
- `apps/nursery/server/billing/paid-json-openai-route.ts`

## Activation boundary

The checksum-bound SQL proposal under `docs/billing/proposals` is outside the migration chain, contains an unconditional fail-closed guard, and ends with `rollback`. A later approval must separately authorize: migration promotion/application, verified rates and hosting/storage evidence, the exact budget and shared ceiling, dedicated server credentials, the paid Astra canary, and transaction-two session creation. Search or extraction without that pricing and execution authority remains unavailable.

## Unpaid release-candidate certification

- Hearth application suite: 144 test files passed.
- OpenAI cutover handler suite: 29 tests passed, including all five paid Hearth handler cases and the explicit no-authority-before-retrieval case.
- Owner-funded research execution suite: 6 tests passed.
- Focused server research, isolation, and episode-creation suites: 84 tests passed.
- Tongs preflight and commit API suites: 169 tests passed.
- Shared and Tongs builds, Nursery typecheck, and Hearth typecheck passed.
- Release-manifest checksum, limit arithmetic, two fail-closed guards, and two rollbacks passed the local release-candidate verifier.
- Every existing `20260908180000` through `20260908180700` migration has the same Git blob hash as `origin/main`.

The disposable PostgreSQL migration-chain suite passed on 2026-09-12 against release-candidate source commit `dcf0a803362e7cee300e19f94ebac34d14f6edd4` using the existing healthy `supabase_db_nursery` container. The harness created a uniquely named disposable database, applied the isolated baseline and complete selected migration chain through `20261010120000`, ran the Hearth access/funding, non-spending repair, owner-funded research, activation/cutover, and concurrent shared-ceiling proofs, and dropped that database in its `finally` cleanup. No production database or migration state was touched.
