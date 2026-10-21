# Gate 3 certification results

Status: **blocked; not ready for integration or deployment**.

## Passed evidence

- Historical manifest: 414/414 files match; aggregate SHA-256 `66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40`.
- Linked post-Slice-A recapture: 15,924 entries and contract SHA-256 `817f42cfe0f57d2961b52a72b58a5273c3cc1e2bf306e3a527e6bc58bdbcbfbe`.
- Quench evidence: three scopes and four revisions match the approved source migrations and content hashes; all are global intent/manual-handoff metadata with no credential, customer, billing, activation, or external-account state.
- Baseline lineage static guard: passed with one reserved-range migration and no historical or shared-tail files.
- Noncanonical diagnostic replay: completed using the same baseline with only the unavailable `wrappers` version changed from 0.5.6 to 0.5.7 outside the repository.
- Diagnostic normalized catalog comparison: 15,900 of 15,901 entries match; the sole mismatch is `extension|wrappers`.
- Slice A relation/function/trigger fingerprint test: passed.
- Slice A authentication, profile, workspace, pairing, Anvil profile, subscription, billing, workpiece isolation, function execution, and Data API grant test: passed with synthetic data and transaction rollback.
- Baseline lineage, seven-record allowlist, zero-other-row state, cross-schema Storage policies, signup bootstrap, zero-credit behavior, paid-RPC ACL, and Quench discovery test: passed with synthetic data and transaction rollback.
- Financial static contract suite: 32 passed, 0 failed.
- No production or hosted write, migration-history change, deployment, customer-data copy, financial activation, or external provider call occurred.

## Blocking failure

Both permissive and restrictive certification entrypoints fail at statement zero of the immutable baseline:

`ERROR: extension "wrappers" has no installation script nor update path for version "0.5.6"`

Supabase CLI 2.84.2 selects `public.ecr.aws/supabase/postgres:17.6.1.095` for PostgreSQL 17. That image exposes only `wrappers` 0.5.7. The approved production fingerprint contains 0.5.6, and CLI configuration exposes only the PostgreSQL major version, not an image override. The baseline intentionally fails closed instead of silently upgrading the extension.

Because the exact baseline cannot complete, the following remain blocked rather than passed: canonical permissive replay, canonical restrictive replay, exact catalog parity, Data API testing against the exact extension contract, and full baseline certification.

## Owner decision required

Choose and separately approve one supported certification contract:

1. Pin a supported Supabase CLI/database image combination that contains `wrappers` 0.5.6, while retaining CLI 2.84.2 only if that combination is demonstrably supported; or
2. Approve `wrappers` 0.5.7 as an explicit, reviewed environmental normalization and update the production/application contract oracle accordingly.

Do not change the baseline assertion, production extension, or CLI pin without that decision.
