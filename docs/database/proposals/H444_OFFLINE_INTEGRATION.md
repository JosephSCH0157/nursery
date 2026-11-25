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

## Approval readiness: 2026-11-24 (metadata only)

Starting candidate: `7a6955f11113c3cca0dcc7b5154192cf20a94d6c`.
The owner authorized metadata observations and local preparation, **not acquisition**.
The [exact extraction review plan](h444-extraction-review-plan.json) contains
110 relations and 1,459 projected columns: the preserved 88-table scope, 17 missing
protected financial relations, and five additional FK dependencies. All 27
protected financial relations have complete ordinary-column projections. It
preserves the six history columns, all eight schema-only namespaces, the original
Auth projection (including email/phone), and existing secret exclusions. The only
other omitted value is Storage's generated `path_tokens`; its generation expression
is preserved in the complete schema. Generated columns cannot receive INSERT values.
No ordinary required column may be omitted to pass the secret screen.

Review-plan SHA-256 over the exporter's `canonical(plan)` UTF-8 encoding:
`d7654c33002ecea3471aa197ee5a5b6859d4f27c15ebcaad52877f41dde5c9b2`.
This is a validated extraction **scope**, not a complete operational v2 plan or
independent approval. Copy its exact tables/schemas/financialTables into the existing
v2 plan only after review; independently bind the executing candidate, source
fingerprints, historical identity digest, client/CA, principal and authorization.
No new acquisition/coordinator architecture is introduced.

Offline verification, with the preserved metadata receipt:

```text
node scripts/verify-h444-extraction-review-plan.mjs docs/database/proposals/h444-extraction-review-plan.json .git/forge-private-evidence/h444-approval-readiness-20261124/catalog-observations.json
node --test scripts/test-storage-h444-extraction-scope.mjs
```

Authenticated Supabase MCP observations at 23:31–23:38 UTC (18:31–18:38 EST) found
one `historical-v1` singleton and exactly 444 distinct, non-null versions ending
`20261111201029`. The complete version list matched the checked-in prefix.
All 110 relations and projected columns exist. FK closure is complete in the
observed catalog. All eight schema namespaces exist; `pg_depend` reported no
dependencies in another non-system schema. Dynamic SQL dependencies, function
contents and secret-bearing values remain uninspected; the later complete schema
capture and independent isolation review remain mandatory. Installed extensions
include wrappers 0.5.6; no extension/schema changes were made.

Queries used the checked-in preflight's read-only, repeatable-read transaction
setup and bounded catalog projections, with ROLLBACK. No financial rows, Auth
records, Storage rows/bodies, migration statement payloads, function definitions
or sequence values were acquired. Separate metadata sessions are **not** a
consistent export snapshot. MCP used `postgres`; it does not prove a connection
as the proposed acquisition principal or the direct client's TLS/cleanup behavior.
An initial sequence-privilege metadata query failed on a non-sequence catalog
object; the corrected CASE-guarded query succeeded. It made no persistent change.

The existing login `supabase_read_only_user` has CONNECT, schema USAGE, SELECT on
the required schema relations and sequences, BYPASSRLS, and no observed table or
column write, database CREATE, schema CREATE, superuser, role-creation,
database-creation or replication capability. Memberships are pg_read_all_data
and pg_monitor, without ADMIN OPTION. This is broad database read access,
**not** an allowlist-limited role. The owner must accept that credential scope;
the exporter enforces the narrow extraction scope. Credentials and actual login
availability were not retrieved or tested. No role/grant alteration is authorized.

The authenticated project dashboard supplied the public Supabase Root 2021 CA:
`https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt`.
File SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`.
Its certificate validity ends 2031-04-26; this verifies the supplied trust artifact,
not a successful server handshake. The direct endpoint resolves to AAAA only.
The selected Docker bridge has IPv6 disabled. **Direct acquisition transport is
blocked pending a reviewed connectivity decision.** No pooler/hostaddr fallback,
network reconfiguration, IPv4 add-on or credential use was attempted. Server SSL
enforcement is off; the client still mandates verify-full with no downgrade.

### Destination and recovery procedure

A new empty destination was prepared at
`.git/forge-private-evidence/h444-acquisition/owner-approved-h444-attempt-01`.
The existing output verifier passed: current-owner/SYSTEM-only protected DACL,
no reparse-point ancestry. No attempt journal or artifact exists. The D: volume
had about 352 GiB free, well above the bounded envelope size; capacity is an
observation, not a reservation. Recheck ACL, emptiness, capacity and path identity
immediately before any separately approved execution. Only these new local
preparation directories were restricted; broader inherited parent ACLs and
same-account/administrator access were not changed or certified.

The CA, catalog receipts and fixed query text are preserved under
`.git/forge-private-evidence/h444-approval-readiness-20261124/` with an owner/SYSTEM
DACL. They are preparation metadata, not authentic export evidence.

Recovery procedure for a later authorized artifact:

1. Keep the original ciphertext and independently recorded SHA-256. On the same
   Windows account/profile, verify the bounded file size, hash and destination ACL
   before passing bytes to the existing `decryptExportBundle` function in
   `scripts/lib/storage-h444-output.mjs`. Never print the decrypted bundle or keys.
2. DPAPI unwrap and GCM authentication must succeed before parsing. The decoder
   rechecks all member hashes, six artifact commitments, snapshot proof and 475
   body receipts. Report only pass/fail and ciphertext digest. Use
   `clearExportBundle` in finally; best-effort buffer clearing is not proof of
   complete memory erasure. No plaintext temporary file is needed for this check.
3. Actual materialization/import requires separate restoration and confidential
   handling approval. A successful decryption is not provenance approval or H/B1
   certification. Retain ciphertext after any failure; do not reset the account,
   change wrapping, or reacquire automatically to work around a recovery failure.
4. Same-account fresh-process recovery, wrong wrapped-key rejection and GCM
   tamper rejection are tested using synthetic fixtures. Account/profile/machine
   loss, password-reset effects, power loss and an independent recovery custodian
   are **not verified**. Owner must choose a documented recovery arrangement or
   explicitly accept unrecoverability and the need for a newly authorized future
   acquisition. Copying ciphertext alone does not make DPAPI portable.

### Load, cost and remaining decisions

The organization is Pro and the current dashboard identifies Micro compute.
[Published egress pricing](https://supabase.com/docs/guides/platform/manage-your-usage/egress)
lists 250 GB included uncached egress and $0.09/GB above allowance. Current billed
usage, remaining allowance, credits and incremental invoice impact are unverified.
There is no new infrastructure proposal, but this is not a zero-cost guarantee.
The original 88-table size observation is stale and excludes 22 newly required
relations. No current payload size was obtained by reading rows.

Acquisition retains the existing 10-minute/two-session bounds, 30-second
statements, 2-second lock wait, per-table 100,000-row limit and 128 MiB captured
response limit. Fingerprint aggregation and repeated projections may scan/sort
more data than is returned. These client limits do not bound source CPU, temporary
disk, wire overhead or the provider bill. Owner must select a quiet UTC window,
an explicit dollar ceiling and payer, with a separately justified usage/load check;
do not treat an unverified estimate as a metered spending limit.

Proposed retention is 24 hours in a 30-minute authorization window, subject to
owner selection of exact UTC times (the implementation allows at most one hour
and seven days after expiry). On failure/interruption retain ciphertext and
attempt evidence, reconcile the owned session/client and obtain a new approval
before retrying. Cleanup is limited to the exact approved attempt and generated
client resources; never delete preserved historical bodies/evidence. Deletion is
not secure erasure of SSD, backup, paging or diagnostic copies.

Remaining decisions: supported direct connectivity; owner designation and secure
delivery for the existing broad-read principal; exact v2 plan and independent
source/identity pins; independent scope/secret review; residual-risk and recovery
acceptance; cost ceiling/payer; operator/reviewer; exact window and cleanup deadline.
**NOT APPROVED — EXECUTION PROHIBITED.** No authentic acquisition attempt occurred.

## Preserved ETag compatibility and independent financial observation

The bounded local correction validates RFC 9110 entity-tag syntax before weak
comparison of the case-sensitive opaque values. It accepts the preserved
`W/"value"` HTTP receipts against `"value"` metadata without treating weak tags
as strong byte evidence. Bare, malformed, list, case-substituted and different
opaque values fail. Exact identity/path/version/metadata commitments, the entire
475-object inventory, size and independently pinned body SHA-256 remain required.
Historical receipts, bodies and migration evidence are not rewritten. The real
synthetic acquisition fixture now reproduces the 414 weak-tag receipt pattern,
including encrypted recovery and wrong-byte rejection.

The [financial fingerprint request](H444_FINANCIAL_FINGERPRINT_AUTHORIZATION.md)
prepares the existing full 27-relation aggregate for a separately authorized
digest-only MCP observation. The SQL is a non-executing proposal; its preparation
and synthetic tests are not authorization to read protected source rows. Owner
approval and independent review remain required before that observation, followed
by a separately candidate-bound acquisition decision. The physical-restoration
contract and production recovery gate are unchanged.
