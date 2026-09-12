# Owner-funded Hearth research release candidate

Status: inactive release candidate. It is not merged, deployed, migrated, funded, credentialed, canary-tested, or activated.

## Provenance

- Upstream baseline: `origin/main` at `55ac90d2ac6d6604771b14952418b5c5e7b3ed46`.
- Complete frozen Hearth baseline incorporated from `5a08fbbda9e78958efdd8507c7e23502c78f30bc`.
- Narrow paid-admission behavior incorporated from `c78593f834e985fec7d4bb7ddfe02c30b5169e13` without importing its ancestry.
- Baseline integration commit: `8c1219c7`.
- Dormant research implementation commit: `5fff5d05`.
- Migration identifier: `20261010120000_tongs_owner_funded_hearth_research.sql` (present but not applied).
- Original tested implementation snapshot: `C:\Users\Iam11\Documents\Codex\2026-09-12\next-bounded-owner-funded-hearth-research\work`.
- Isolated Git release-candidate worktree: `C:\Users\Iam11\Documents\Codex\2026-09-12\next-bounded-owner-funded-hearth-research\release-worktree`.

The eight existing cutover migrations `20260908180000` through `20260908180700` remain the `origin/main` versions. The eleven-route enforcement is unchanged. Owner chat remains unchanged and dormant.

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
