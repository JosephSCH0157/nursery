# H444 exporter offline integration

**NOT APPROVED — EXECUTION PROHIBITED for authentic acquisition.**

The original sections below record the 2026-11-21 synthetic-only implementation.
The separately guarded acquisition extension is documented at the end; it does
not change the authorization status above.

This historical record covers the user's separately authorized disposable synthetic tests.
The three security-profile proposals were committed locally as
`269e9245343b9376d2bb5927b7caddd4dc89424a`. No push is authorized.

## Original synthetic boundary (2026-11-21)

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

## Original limitations and prerequisites (2026-11-21)

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


## Guarded acquisition extension (2026-11-24; not executed)

Publication is permission to review code, **not permission to connect**. The
existing collector, PostgreSQL transport, encrypted container and logical
artifact validator now have a separately approved acquisition route. The
original synthetic entrypoint still rejects authentic endpoints. Synthetic
results retain their synthetic receipt and cannot certify historical state.

The only authentic method implemented is a direct PostgreSQL connection to
`db.wtvdjndyxegudufrompx.supabase.co:5432/postgres` plus **reuse of the preserved
475 original bodies**. There is no Storage HTTP client, pooler fallback, new
project, migration executor, restore command or credential resolver. Direct
endpoint reachability (including IPv6) and actual principal availability remain
unverified. If unavailable, stop; changing method requires review.

### Independently approved input package

The private package JSON contains exactly five absolute file paths: `approval`,
`plan`, `ca`, `bodyReceipts`, `inventory`. The approval is
`forge.h444-acquisition-approval.v1`; the exact field contract is in
`scripts/lib/storage-h444-authorization.mjs`. Its SHA-256 must be supplied
independently by the owner, not derived and accepted by the operator. No actual
approval has been prepared or issued by this implementation.

Before approval, the owner and independent reviewer must bind:

- Clean candidate SHA; exact v2 plan SHA-256; complete reviewed table/column
  allowlist and schema/dependency scope; exact 444-version prefix; pinned CA,
  cached client image, `psql` and `pg_dump` bytes. The plan's financial list must
  include all 27 protected relations from the existing predecessor observation
  SQL, with every column. Lineage, Storage and six-column history must also have
  complete projections. No secret column may be silently dropped to pass checks.
  Schema-only scope retains the preserved eight-schema boundary: auth, extensions,
  forge_meta, public, storage, supabase_migrations, tongs and vault (no Vault data).
  The old 88-table projection omits 17 of the protected financial relations; it is
  insufficient as-is. A reviewed extension would contain at least 105 projections,
  with complete approved columns for those 17 relations. Prior omitted/empty rows
  are not evidence of their current contents. This scope extension needs an
  independently approved new plan digest; it is not an approved extraction.
- Current independently observed lineage/history/financial/Storage fingerprints
  and the approved Storage identity commitment. The collector executes the
  coordinator's existing fingerprint and cumulative contract SQL inside its
  snapshot; fixture serialization hashes are never substituted.
- Named existing read-only principal, operator and distinct reviewer; new owner
  authorization expressly addressing the prior stop; scope/secret review, risk
  acceptance, documented DPAPI recovery, payer and cost approval references.
  Principal must not be an administrative built-in, superuser, role/database
  creator, replication role, or hold table-write privileges. Required read/USAGE,
  sequence and unfiltered RLS capability must already exist. `pg_dump` also locks
  tables in its selected schemas, so schema-only extraction can need SELECT
  capability beyond data projections. The synthetic test uses `pg_read_all_data`
  and BYPASSRLS; this is **not permission to grant those roles on the source**.
- Exact unused destination below `.git/forge-private-evidence/h444-acquisition/`,
  already protected by the current-owner/SYSTEM-only DACL, with no reparse points.
  Proposed final directory name is `owner-approved-h444-attempt-01`; existence,
  ACL, capacity, key custodian and account recovery still require owner confirmation.
- Original inventory digest `7e2813b2774533a5d84330e393923a23e6e17e8efabef2504683d822966e7b07`
  and byte-receipt digest `5fdc1e5a24be1530acfc9b9975ba96bbec4370bbe249d43d33ceb512a89ae154`.
  Bodies are read only from the existing `accounting-repair/historical-bytes`
  directory. Exact object ID/path/version/eTag/size, SHA-256 and the snapshot's
  complete metadata commitment must agree; no current-version substitution.
- A UTC start/end window of at most one hour, at least the bounded run time
  remaining at start, an explicit retention deadline (at most seven days after
  expiry), named custodian, approved payload/time limits and dollar ceiling.
  Prior authorizations are never reused. Dollar limits require an independently
  justified cost assessment: payload limits are **not** a provider billing meter.

### Supervised invocation after separate authorization

`invoke-h444-acquisition.ps1 -Package <private-package.json> -ApprovalSha256
<independently-approved-digest>` performs local validation only. With a complete
approved package, the owner may separately authorize adding
`-ExecuteApprovedAcquisition`. Do not use that switch during preparation.

The launcher prompts through `Read-Host -AsSecureString` only after local package
validation. It delivers UTF-8 password bytes through the supervised Node child's
private standard-input pipe; no URI, argv, shell history, environment file,
`.pgpass`, provider credential lookup or Docker configuration contains the password.
Within the disposable client, a fixed shell reads it from stdin into the libpq
child's environment. That process environment remains visible to sufficiently
privileged local inspection; it is **not a hardware secret enclave**.

The cached image is used by immutable ID with `--pull=never`, a read-only root,
no bind mounts/ports/log driver, dropped capabilities, a non-root user, 256 MiB
memory/no container swap, one CPU, 32 processes and tmpfs for the public CA only.
Unlike the fixture, the authentic client requires bridge networking. This is not
an independently verified egress firewall. It exits after 15 minutes even if the
supervisor dies. No Docker Desktop settings are changed or services restarted.

The exporter uses one `REPEATABLE READ READ ONLY` snapshot, pinned verify-full TLS,
5-second connection, 30-second statement, 2-second lock and 10-minute transaction
bounds. Both schema dumps import the same snapshot; all observations recheck
backend/role/database/TLS/snapshot. Per-table rows cap at 100,000; cumulative
captured response bytes and six-artifact plaintext cap at 128 MiB (approval may
lower limits). The complete acquisition deadline includes collection and cleanup;
the outer supervisor stops at 11 minutes. Sequence observations are explicitly
non-MVCC and never converted into restoration instructions.

Six logical artifacts remain unchanged in identity. The same encrypted envelope
also contains source/export receipts, approved acquisition bytes, snapshot-bound
Storage identities, original byte receipts and all 475 bodies (447,475 bytes).
No plaintext artifact files are created. Recovery authenticates GCM before parsing,
checks deterministic member hashes, snapshot proof and body receipts, and clears
recoverable buffers. DPAPI uses the original fixed entropy label for compatibility;
its label is not an authenticity claim. The authentic export receipt uses the
existing logical certification contract. Restoration still needs its own approval,
pre-import isolation, target observations, independent artifact review and all
447/H-B1 gates. This command cannot restore or certify a database.

### Failure, cleanup and residual risks

An exclusive `attempt.json` is fsynced before the first source connection. Any
failure consumes the attempt, produces a fixed diagnostic code, and prevents
automatic retry. Interruption requests rollback and client/container teardown.
Abrupt workstation/process loss may prevent confirmation; reconcile the named
client and source session independently, retain the attempt, and obtain new
approval before another connection. Database read-only transactions and server
statement/idle timeouts bound abandoned work; no hosted cancellation writes are
issued. Only ciphertext partials may remain on disk. Retention/disposal is
owner-managed: no automatic deletion of authentic artifacts or preserved bodies.

The no-customer assertion remains owner-provided, not an inspection result.
Financial/configuration identifiers, history SQL, function bodies and selected
contact columns still require review. Pattern screening cannot prove arbitrary
text is secret-free. JavaScript/.NET strings, libpq memory, OS buffers, pagefile,
hibernation, crash dumps, endpoint monitoring and privileged process inspection
cannot be guaranteed erased by this tool. Owner must accept documented residual
risks and protect acquisition credentials/keys. DPAPI fresh-process recovery is
verified; account/profile/machine-loss recovery is **not** demonstrated and needs
a specific owner-approved procedure. Deletion is not proof of secure erasure.

Offline checks: `node --test scripts/test-storage-h444-acquisition.mjs` adds a
SCRAM-password local workflow with approved synthetic metadata, all six artifacts,
475 generated bodies, independent source fingerprint matching, wrong-password and
changed-fingerprint rejection, interruption, restricted output and consumed-attempt
behavior. The existing 14-test TLS/snapshot/secret/timeout/encryption suite and
46-test collector suite remain required. None is authentic acquisition evidence.

**NOT APPROVED — EXECUTION PROHIBITED. No live package, principal, CA, source
fingerprints, budget, window, retention, recovery or risk acceptance is approved.**
