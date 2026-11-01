# Forge Documentation Authority

Status: **Canonical documentation-governance policy**

Last reviewed: **2026-11-01**

This file routes readers to the document that governs each domain. It does not
replace those documents or turn plans and rollout records into current-state
evidence.

## Authority map

| Domain | Architectural or policy authority | Current operational state |
| --- | --- | --- |
| Billing and customer financial behavior | [`docs/billing/FORGE_FINANCIAL_ARCHITECTURE.md`](docs/billing/FORGE_FINANCIAL_ARCHITECTURE.md) | [`docs/billing/BILLING_CURRENT.md`](docs/billing/BILLING_CURRENT.md) |
| Persistence and database lineage | [`AGENTS.md`](AGENTS.md#ssot--persistence-policy-canonical) and [`docs/database/DATABASE_ARCHITECTURE.md`](docs/database/DATABASE_ARCHITECTURE.md) | A dated, cited observation in the applicable current-state record; use [`docs/database/DATABASE_OPERATIONS.md`](docs/database/DATABASE_OPERATIONS.md) for supported procedures |
| Storage paths and object ownership | [`TONGS_PATH_CHARTER.md`](TONGS_PATH_CHARTER.md) | Verified canonical reads; local or browser state is not operational authority |
| Spark-to-Anvil lifecycle | [`FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`](FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md) | [`STATE_MACHINE_DIAGRAM.md`](STATE_MACHINE_DIAGRAM.md) is a companion operational reference, not a second constitution |
| Tool behavior | The tool manifest or authority contract listed in [`README.md`](README.md#canonical-documentation-index), plus the nearest scoped `AGENTS.md` | Implementation and verified runtime evidence; a plan or release candidate is not current behavior |
| Production deployment policy | [`AGENTS.md`](AGENTS.md#production-deployment-policy-canonical) | [`docs/ops/PRODUCTION_CURRENT.md`](docs/ops/PRODUCTION_CURRENT.md) |

## Document statuses

- **Canonical**: governs its stated domain until deliberately amended.
- **Current operational record**: records dated, sourced observations; it does
  not define architecture and may become stale.
- **Runbook**: defines a supported procedure without proving that it was run or
  that its example values are current.
- **Proposal/Draft**: describes intended or candidate behavior and has no
  present-tense authority.
- **Historical evidence**: preserves a past decision, result, deployment, or
  observation. Keep it available and do not promote it to current state.
- **Needs reconciliation**: contains an unresolved conflict or mixed authority.
  Follow the named canonical authority for the conflicting domain and retain
  the document until the conflict is explicitly reviewed.

`Superseded` may be used only after identifying the actual successor and
reviewing the overlap and conflict. The label must name the successor and the
scope it replaces. Age, filename, or a newer plan is not sufficient.

## Conflict handling

1. Compare the documents' stated domains and statuses; a current-state record
   cannot amend canonical architecture.
2. Follow the domain authority in the table above only within its stated scope.
3. If two documents claim the same authority and disagree, do not silently
   choose one. Mark the conflict `Needs reconciliation`, cite both documents,
   and stop any work whose correctness depends on resolving it.
4. Preserve historical documents in place unless a separately approved
   preservation and removal process applies.

## Current-state verification

An operational claim must include the observed value, evidence reference,
verification date and time (with timezone), and material limitations. Prefer an
immutable provider receipt, deployment identifier, Git commit, or canonical
read. Repository configuration proves intended configuration only; a rollout
document proves what was planned or observed at its recorded time only.

If fresh evidence is unavailable, record **Unverified**. Never infer current
production state from architecture, migration contents, environment-variable
names, test fixtures, release candidates, or historical reports.

Update the applicable current-state record when an actual production
deployment, pricing state, or financial activation state changes. Ordinary code
or documentation changes that do not alter verified operational state do not
require a current-state update.
