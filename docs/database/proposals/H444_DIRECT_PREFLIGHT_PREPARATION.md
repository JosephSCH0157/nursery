# H444 direct PostgreSQL metadata preflight preparation

**Proposal/Draft — NOT APPROVED — EXECUTION PROHIBITED for authentic sources.**

Prepared offline against `7a58235c1e395dfc30146d6783d0efc115b71e45` on
2026-11-21. This is a narrow supplement to the
[acquisition package](H444_ACQUISITION_AUTHORIZATION_NOT_APPROVED.md) and
[capability evidence](H444_OFFLINE_INTEGRATION.md). It is not an amendment to
[the supported operating runbook](../DATABASE_OPERATIONS.md), a new source
authorization, or an acquisition/certification receipt.

## Existing client and permitted invocation

Docker Desktop was already running when used. No image was pulled, software
installed, hosted endpoint contacted, or credential retrieved. The existing
local `postgres:17` image supplied:

| Component | Observed identity |
| --- | --- |
| Cached image ID | `sha256:d74eeac9a635390a49bc21bd49fccd973de707e2a53a76ac49b552b8712ec46f` |
| Client | `/usr/lib/postgresql/17/bin/psql`, PostgreSQL 17.11, Debian `17.11-1.pgdg13+2` |
| Client SHA-256 | `292a3063f4712a759ec558e2f7f050b3f8a64d83d04404c9521202c299b5830a` |
| libpq | `/usr/lib/x86_64-linux-gnu/libpq.so.5` |
| libpq SHA-256 | `9cce9bfae9405a71e0d642457d9d8748093cea9fdc0f785b5d2ed9575aec168d` |

From the canonical checkout, the prepared invocation is **synthetic only**:

```text
node scripts/preflight-h444-source.mjs --synthetic
node --test --test-reporter=spec scripts/test-storage-h444-preflight.mjs
```

The first command creates a generated disposable fixture, runs only the metadata
preflight, prints its explicitly synthetic receipt, then removes its own labeled
container. The second tests normal and rejected cases. Docker must already be
available, Windows is required by the existing transport, and the image must be
cached. Unknown arguments, authentic mode and hosted hostnames are rejected.
These commands do not run the acquisition exporter, create the six artifacts,
write encrypted output, restore a database or certify a lineage.

The existing fixture transport is reused unchanged. It selects the local Docker
named pipe, uses `--pull=never`, a pinned image ID, network `none`, loopback only,
tmpfs-only mounts, no published ports and no Docker log driver. The future
authentic procedure must not remove those fixture guards to reach a real source.

## Fixed observations and acceptance

Queries and validation are in
[`storage-h444-preflight.mjs`](../../../scripts/lib/storage-h444-preflight.mjs).
There is no query-file, endpoint, SQL-string or credential option in the runner.

1. Record database, named role, server version, TLS indication, backend PID,
   snapshot, transaction isolation/read-only settings and UTC time. Reject a
   principal with superuser, BYPASSRLS, role/database creation or replication
   attributes. Identity must stay identical through the final observation.
2. Inspect catalog metadata for seven required relations: the lineage marker,
   migration history, Storage objects and four financial-authority tables from
   the existing exporter contract. Require tables rather than views/foreign
   tables; required columns and schema usage must be present. Report their
   observed types and SELECT/RLS capabilities. This is minimum structural
   eligibility, not full schema/type/dependency parity or an approved export scope.
3. Read only `singleton` and `lineage`, with a two-row bound. Require one
   `historical-v1` singleton, actual access and no possible RLS filtering.
4. Read only migration `version`: count, distinct count, null count and head.
   Require exactly 444 distinct non-null versions ending `20261111201029`, then
   fetch a maximum of 445 versions and compare the entire ordered list against
   the first 444 entries of the existing 446 contract. The expected UTF-8
   newline-joined list, with no trailing newline, has SHA-256
   `b6642437f694d11e9ca29fb82046f556e699f7952a7e33f1f10916b71afeecc1`.
5. Verify the unchanged snapshot and effective timeout settings. Roll back and
   close successfully before returning a passing synthetic receipt.

History must contain all six original column names, but values from `statements`,
`name`, `created_by`, `idempotency_key` and `rollback` are never selected. No
financial authority rows, financial-mode function, Storage rows/bodies, sequence
values, Auth rows, credentials, role password verifiers or function definitions
are read. Financial/Storage SELECT capability is reported, not exercised.
Missing export privileges do not invalidate the narrower metadata observation;
the receipt keeps acquisition readiness `NOT_VERIFIED`.

The synthetic principal has schema usage and SELECT only on the two lineage
columns and migration `version`, plus the fixture identity sentinel needed by the
existing transport. Other table/sequence grants are revoked in the disposable
fixture. Those setup writes are synthetic fixture construction, never proposed
source changes. No authentic role/grant change is authorized by this procedure.

## Supervision, TLS and cleanup

The tested invocation uses pinned `psql` and CA bytes with `PGSSLMODE=verify-full`,
`PGHOST=fixture.invalid`, `PGHOSTADDR=127.0.0.1`, `PGPORT=5432`, database `postgres`
and role `fixture_reader`. It clears inherited environment overrides and disables
password/service-file discovery. `psql` runs with:

```text
-X -qAt --no-password -v ON_ERROR_STOP=1 -P pager=off -f -
```

Only fixed SQL is sent through the private stdin pipe. Every observation runs in
one `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` transaction. Search path is
`pg_catalog`; UTC is explicit; `row_security=off` requests errors instead of silent
filtering, not an RLS bypass. Read-only defaults are also set at connection startup.

| Bound | Tested configuration |
| --- | --- |
| libpq connection | 5 seconds, stricter than the proposed 10 seconds |
| Statement / client query wait | At most 30 seconds |
| Lock wait | 2 seconds |
| Idle transaction | 60 seconds |
| Observation sequence | 120 seconds, including local comparisons |
| Cumulative observation result bytes | 65,536 |
| Raw transport diagnostics | At most 65,536 bytes, discarded rather than returned |

Tests lower bounds to exercise failures; callers cannot raise them. The
120-second observation budget starts after verified fixture transport creation;
it is **not** an end-to-end invocation deadline. Local Docker identity/hash
inspection has its existing per-process bounds. The runner performs no automatic
preflight retry; the fixture builder's local database-start readiness polling is
separate. Fixed error codes replace source errors; the CLI suppresses details.

Normal completion requires acknowledged `ROLLBACK` and closed transport. Query
errors, limits, interruption or cleanup failure produce no passing receipt.
Existing fixture cleanup may inspect/terminate only its own tagged database
sessions using its local fixture administrator, then removes its own container.
Tests verify those sessions are absent. **This administrator cleanup is not a
hosted procedure.** Network partition/process-tree behavior on a real source and
an overall setup-to-cleanup deadline remain unverified.

## Requirements for a later authentic invocation

There is deliberately no executable hosted invocation or approval override here.
The smallest future extension is a separately reviewed metadata-only launcher
for the same client/queries; it must leave the acquisition exporter untouched.
Before any live connection the owner must independently approve:

- Exact project `wtvdjndyxegudufrompx`, verified endpoint-to-project binding,
  database `postgres`, port, DNS hostname, CA trust/hash and an existing named
  least-privilege principal. TLS server authentication and database identity must
  both pass; a SQL `ssl=true` value alone is insufficient.
- Exact launcher/query digests and a runbook extension. The launcher must provide
  approved credential delivery without command-line secrets, inherited PG/service
  overrides, raw logs or deliberate plaintext credential files. Hosted credential
  delivery is not implemented or tested by the trust-authenticated local fixture.
- Client placement and permitted source-only networking using existing resources;
  Docker image availability does not itself provide authorized network access.
  A verified total deadline, rollback/close on every path, and cancellation of
  only the owned session are required. Do not import fixture-admin termination.
  Lost cleanup acknowledgement must report UNKNOWN/BLOCKED, never success.
- Named operator, new bounded authorization addressing the previous stop, window
  and UTC expiry, restricted receipt destination/retention, and acceptance or
  mitigation of credential exposure through paging, diagnostics and privileged
  processes. No workstation configuration change is implied.
- Confirmed existing-resource cost/allowance and an explicit ceiling. No spending
  or new infrastructure is proposed; hosted compute/egress costs remain unverified.

Stop on any source/lineage/prefix/schema/access/TLS mismatch, limit, missing
approval or uncertain cleanup. Do not repair privileges, switch methods, retry,
restore a backup or manufacture H444. A passing future preflight would describe
only its observation snapshot; acquisition must recheck eligibility. Required
financial rows, all six history-column contents, original Storage reconciliation,
full extraction scope and independent authentic package approval remain separate.

## Offline validation

Local validation on 2026-11-21:

| Command/check | Result |
| --- | --- |
| `node scripts/preflight-h444-source.mjs --synthetic` | PASS; 444-prefix matched, verified TLS/RR/read-only context, approximately 12 KiB observed, acknowledged rollback/close, authentic verification and acquisition approval false. |
| `node --test --test-reporter=spec scripts/test-storage-h444-preflight.mjs` | PASS: 17 tests (16 scenarios and parent), zero failures/skips. |
| `node --test --test-reporter=spec scripts/test-storage-h444-exporter.mjs scripts/test-storage-h444-447-proposal.mjs` | PASS: 68 tests, zero failures/skips. |
| `node scripts/verify-storage-h444-447-proposal.mjs` | PROPOSAL_VALID; execution/evidence acceptance false, certification NOT_RUN. |
| `node scripts/verify-frozen-git-evidence.mjs --scope all --require-exact-worktree-bytes` | PASS: 451 anchored files, 32 successors, zero worktree byte differences. |

The regression suite covers denied sensitive-column access, wrong exact prefix,
advanced/duplicate history, changed/duplicate lineage, missing schema/history
columns, denied privileges, RLS, privileged roles, concurrent committed changes,
snapshot drift, rejected writes, byte/deadline/statement/lock/idle limits, real CA
and hostname rejection, a stalled postmaster triggering libpq's connection
timeout, sanitized failures, uncertain cleanup, and prohibited hosted arguments.
The temporary postmaster signal is confined to the test-owned container; Docker
Desktop is never signaled or restarted. All test-owned containers/sessions were
removed. These are synthetic regression results, not hosted or certification
evidence, and no CI run was requested for the uncommitted preparation files.

**Acquisition remains NOT APPROVED — EXECUTION PROHIBITED.** No hosted preflight,
acquisition, certification, merge, deployment, commit or push is performed by this
preparation procedure.
