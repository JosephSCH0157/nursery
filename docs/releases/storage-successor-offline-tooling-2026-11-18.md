# Storage successors 445–446: bounded local closeout

Historical record of the earlier bounded authorization. Later local preparation
is recorded in the [November 19 checklist](pr92-morning-checklist-2026-11-19.md).
Its wrapper and application changes supersede the tooling inventory below;
the authentic historical certification hold remains in force.

Status: **Local preparation complete; release blocked.**
Recorded: 2026-11-18, America/New_York (checks completed 2026-11-19 00:44 UTC).
Branch: `codex/legacy-storage-billing-exclusion-20261118`.
Migration/configuration payload: `4de38126e51070ea4b5e90b418f1e66e5b7095f0`.

The owner's final scope permits local tooling and focused offline checks only.
It prohibits snapshot acquisition, cloud infrastructure, hosted changes,
financial activation, merge, and deployment. This closeout does not authorize a
continuation of the broader Forge recovery plan.

Implemented:

- Separate closed contracts for 445 (`20261113175455`) and 446
  (`20261113214832`), with exact migration hashes, predecessor count/head,
  Test mode, and prior receipt/financial fingerprint validation. The 444-to-445
  transition explicitly retains the original 444 payload identity.
- Offline, unlinked migration/configuration packages with exact Git bytes,
  inventory and tamper checks. Packages contain no connection descriptors,
  credentials, customer data exports, or application source checkout.
- Input-only policy validators that reject every Apply request on the missing
  historical certification hold. There is no new hosted executor or mechanism
  to override the hold. Policy fixtures are unit-test inputs, never historical
  certification evidence.
- A cumulative read-only schema/ACL/RLS/trigger contract through 446, wired into
  the existing guarded CI collector. It has **not** been executed against a
  database in this closeout.
- Windows-compatible CLI selection in the existing offline tests. The file
  symlink assertion is separate and explicitly skips only Windows EPERM;
  Linux CI retains the assertion. Existing 441–444 release implementations,
  migration bytes, and frozen database artifacts remain unchanged.

Validation:

| Check | Result |
|---|---|
| `node --test --test-reporter=spec scripts/test-storage-billing-hosted-deployment.mjs scripts/test-storage-successor-hosted-deployment.mjs scripts/test-storage-http-source.mjs` | 66 passed; 0 failed; 1 Windows file-symlink privilege skip |
| `invoke-frozen-git-evidence.ps1 -Scope all -RequireExactWorktreeBytes` | Passed; zero worktree byte differences |
| `verify-forge-database-entrypoints.ps1` | Passed; CLI pin remains 2.84.2 |
| `node --check scripts/certify-storage-hosted-ci-contract.mjs` | Passed |
| `git diff --check` | Passed |

No database certification, full application build, hardware acceptance,
hosted mutation, entitlement activation, merge, push, or deployment was performed
for this bounded package. Disposable package test directories were removed.
The pre-existing untracked Hammer release note was left untouched.

The exact remaining historical blocker is the absence of an owner-approved,
restorable **authentic H444 predecessor**. It must include the actual schema,
lineage marker, complete six-column migration history, operational financial
data required by the tail, and provenance/transfer approval. The owner confirmed
that previous Google Cloud attempts stopped before historical capture. There is
no known approved snapshot to restore. Synthetic 411-row history, synthetic B1
operational fixtures, and prior closeout notes cannot replace that predecessor.

Authentic H upgrade/certification through 446 and H/B1 comparison therefore
remain unperformed. The separate inactive fresh-B1 initialization limitation
also remains unresolved. The full requirements are in
[`STORAGE_FULL_TAIL_CERTIFICATION.md`](../database/STORAGE_FULL_TAIL_CERTIFICATION.md);
the offline operating scope is in
[`DATABASE_OPERATIONS.md`](../database/DATABASE_OPERATIONS.md#storage-successors-445446-offline-preparation-only).
Hosted execution tooling and the later recovery phases remain deferred pending
separate approval. Preserve this candidate and stop here.
