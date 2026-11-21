# H444 exporter offline integration

**NOT APPROVED — EXECUTION PROHIBITED for authentic acquisition.**

This report covers the user's separately authorized disposable synthetic tests.
The three security-profile proposals were committed locally as
`269e9245343b9376d2bb5927b7caddd4dc89424a`. No push is authorized.

## Implemented boundary

- `scripts/lib/storage-h444-acquisition.mjs` coordinates destination checks,
  PostgreSQL collection, rollback/close, encryption, disk verification and
  publication. It accepts only synthetic mode and the existing synthetic plan.
- `storage-h444-postgres.mjs` runs pinned `psql` and `pg_dump` binaries inside a
  labeled disposable fixture container. The container must match the selected
  cached image ID, have networking disabled, no published ports or host mounts,
  only tmpfs mounts, no privileged mode and no Docker log driver. Docker commands
  explicitly select the local Desktop Linux-engine named pipe; selected remote
  contexts and inherited Docker/PG credential settings cannot redirect them. Client
  connections force `fixture.invalid`/`127.0.0.1` inside that container. There is
  no way to pass a hosted hostname or production credential to this transport.
- A persistent `psql` session owns `REPEATABLE READ READ ONLY`. Every observation
  checks its backend/snapshot/settings; both schema dumps import that snapshot.
  TLS uses `verify-full`, a pinned synthetic CA and pinned actual client binaries.
  Client configuration is isolated from inherited PG/service/password settings.
  The synthetic login has SELECT privileges and read-only transaction defaults.
- Source failures expose fixed error codes. Queries/dumps have byte/deadline
  bounds; cleanup verifies that this transport's PostgreSQL sessions end,
  including interrupted dump sessions. Admin cleanup is confined to this labeled
  synthetic fixture; it is not a proposed hosted cleanup implementation.
- The secret screen rejects prohibited table/column projections and recognizable
  secrets in selected row values and schema output. Migration history and all
  required financial authority remain unchanged. Screening is defense in depth,
  not proof that arbitrary text contains no secret or personal information.

The fixture uses cached `postgres:17` (tested clients PostgreSQL 17.11), with no
image pull or external network. It creates only generated fixture tables/rows,
including explicitly synthetic lineage/history-shaped records. It is **not an
installed Forge historical or baseline database**. No historical migration SQL
is replayed, no baseline is applied and no restored state is claimed. Fixture
TLS keys are generated inside disposable tmpfs; no production credential is read.

## Encrypted evidence

The six exact logical artifacts, source observation and synthetic receipt form a
bounded length-delimited container. The existing artifact hash/proof validation
is reused through an in-memory entrypoint; no plaintext directory is required.
AES-256-GCM uses a fresh 32-byte key, 12-byte nonce and 16-byte tag. Windows DPAPI
CurrentUser wraps the key through a supervised private pipe, with a fixed
synthetic-format entropy label. The exact envelope header is authenticated.

Only ciphertext is written to an exclusively created staging file under a
verified owner/SYSTEM DACL. Readback performs DPAPI unwrap, GCM authentication and
all member/proof checks before publication. A same-volume hard link publishes
without replacing an existing file; final bytes are rehashed. Failed publication
retains ciphertext staging files for reviewed disposition. Tests delete only
their uniquely named synthetic temporary directory and their labeled container.
Windows settings, existing evidence and user-owned Docker Desktop are unchanged.

Untrusted decrypted bytes are not parsed or returned before GCM tag validation.
Plaintext artifact hashes are deterministic; encrypted envelopes intentionally
differ across encryptions. Ciphertext hashes do not establish authentic provenance.
Receipts retain `acquisitionApproved:false` and `confidentialityVerified:false`.
No output is accepted as authentic by the existing approval/certification contracts.

## Offline validation commands

```text
node --test --test-reporter=spec scripts/test-storage-h444-integration.mjs
node --test --test-reporter=spec scripts/test-storage-h444-exporter.mjs scripts/test-storage-logical-restoration-certification.mjs scripts/test-storage-authentic-certification.mjs scripts/test-storage-h444-447-proposal.mjs
node scripts/verify-storage-h444-447-proposal.mjs
node scripts/verify-frozen-git-evidence.mjs --scope all --require-exact-worktree-bytes
```

The integration command requires Windows, an already-running Docker engine and
cached `postgres:17`; it fails rather than starting Docker or silently skipping
DPAPI. It tests actual TLS rejection for an untrusted CA and wrong hostname,
snapshot isolation against concurrent row/schema changes, rejected writes,
timeouts/backend cleanup, missing SELECT/history/authority, secret rejection,
all six artifacts, DPAPI recovery in a fresh process, ciphertext tampering,
invalid wrapped keys, incomplete artifacts, restrictive ACLs, exclusive output
publication and the complete synthetic workflow. The other suites exercise
protocol and evidence/approval rejection without restoration or certification.

Validation on 2026-11-21:

| Check | Result |
| --- | --- |
| Real local PostgreSQL + Windows DPAPI integration | PASS: 14 tests, zero failures/skips; includes 13 scenarios and the parent test. |
| Exporter, logical/authentic evidence validators and 447 proposal regressions | PASS: 118 tests, zero failures/skips. |
| 447 proposal validator | PROPOSAL_VALID; execution/evidence acceptance false, certification NOT_RUN. |
| Frozen-byte verification | PASS: 451 anchored files, 32 successor files, zero byte differences. |
| Documentation references and diff whitespace | PASS. |

All database and encryption test inputs were synthetic. No hosted CI was
triggered or queried; these are local results, not PR CI or release approval.

## Remaining limitations and prerequisites

- Hosted/authentic transport, actual source eligibility and source credential
  injection remain unimplemented/unverified. The local fixture uses loopback-only
  trust authentication; it does not test production password or certificate
  credential handling. No local success authorizes replacing that boundary.
- Actual extraction/dependency scope, financial authorities, original Storage
  version/body reconciliation and secret screening require independent review.
  The seven-table fixture is not an approved authentic extraction scope.
- DPAPI tests demonstrate fresh-process recovery under the current Windows
  account. They do not demonstrate account/profile-loss or machine-loss recovery,
  another account's access behavior, or a custodian recovery procedure.
- Owner must choose the authentic destination/account and retention/budget/window,
  approve recovery, and explicitly accept residual paging/dump/telemetry and
  same-account/elevated-access risks, including transient credentials and keys.
  Buffer clearing is best effort; no claim of complete memory erasure is made.
- Atomic no-replacement publication is tested on this NTFS workstation. Power-loss
  durability, disk-full handling and adversarial filesystem races require further
  review/testing before authentic use. No durable-success claim follows from an
  interrupted run; verification of the final envelope remains mandatory.
- The independent authentic package approval and separate 447-capable H/B1
  certification authorization remain outstanding. No acquisition authorization,
  certification, restoration, production operation, merge or deployment occurred.
