# H444 isolated restoration preparation

Status: local preparation; no target, import or execution authority. The operating
authority remains [`DATABASE_OPERATIONS.md`](../DATABASE_OPERATIONS.md). This
procedure reuses accepted acquisition attempt 02 and the closed Quench intervention;
it does not repeat acquisition, create a target, retrieve credentials or open a window.

## Immutable evidence and candidate

Acquisition foundation: `7b72ae066e86f388b74dbc660c1b625cde0a5998`.
Accepted encrypted bundle SHA-256:
`9a5e730d9365b44dbc9e28664d4e5d4737acfc67233e3c974c5097085e8913ea`.
Independent acquisition review SHA-256:
`60ecc84992da862918b5fad6aae0f9e6e59112956648a45b3909c8932a46aed4`.
Snapshot: `00000008-000097FC-1`. Preserve all six logical artifacts, the complete
444-row six-column history, historical-v1 marker, 110 projections including 27
financial projections, 475 original Storage bodies and their 447475 bytes.

Logical execution approval v4 adds the required `interventionCandidate`.
The current reviewed restoration executable stays `candidate`; the immutable
certificate origin remains `66f6050dc7b6d639552f2a3736e75516cbb39198`.
The unchanged shared certificate validator checks its complete receipt at that
origin. Source provenance retains the acquisition candidate. No artifact or
receipt is rewritten. Old v3 still rejects cross-candidate certificates.

## Time-independent preparation contract

`scripts/lib/storage-h444-restoration-preparation.mjs` provides offline plan,
authorization and authenticated-input checks. It has no process launcher,
credential resolver, network client, target creation or restore executor.
A plan is not an approval, target observation, import receipt or completion.
Its input checker authenticates the existing encrypted envelope in memory using
existing custody, verifies commitments and clears recovered buffers without
publishing plaintext. Actual invocation with private artifacts remains subject
to the separate approved handling procedure.

The `forge.h444-isolated-import-plan.v1` contract pins exact executable/acquisition/
intervention candidates, snapshot, encrypted envelope, export/source/review
digests, protected fingerprints, disposable non-production project, private target
connection digest, compatibility and exact Storage capability reviews, complete
isolation manifest and exact programs for compatibility, isolation, transaction
prelude, roles/sequences, constraints, observations, Storage restore/HTTP readback
and cleanup. Controls require distinct operator/reviewer, cleanup operator, one
attempt, zero automatic retries, incremental ceiling at most $10 and seven-day
retention. Unknown capabilities remain HOLDs; filling digest fields cannot waive
the independent target-specific proof requirements.
The export receipt pin is the canonical JSON without a trailing newline in the
authenticated envelope; pretty-printed or newline-appended copies have different
digests and cannot be substituted downstream. The independent acquisition review
and eventual logical Storage object-set pins are committed declarations here;
their independent evidence and actual handoff manifests still require verification.
The input checker does not issue an independent review or prove target restoration.

## Before the first import statement

Review the exact target and provider-supported import method. A bootstrapped
Supabase project is not an empty PostgreSQL database. Compare provider schemas,
extensions, ownership, roles/memberships and default ACLs with the authenticated
manifest/dumps; bind every collision reconciliation to exact reviewed bytes and
permitted isolation exceptions. Do not drop provider objects, silently omit SQL,
continue on errors, invent passwords or replay global role observations blindly.
Unsupported privileges or unexplained collisions cause HOLD.

Prove isolation before executing even schema DDL. Retain all eleven external-effect
categories: background workers, cron, database triggers/webhooks, edge functions,
event triggers, extensions, foreign servers/user mappings, outbound routines and
provider webhooks. Every active source identity needs an exact evidenced
neutralization; all target mechanisms must be inactive, every catalog exception
must match its neutralization, and unclassified effects must be zero. Prevent
egress/production callbacks even if restored code executes. No production secrets,
role passwords, Vault root key or source Credential001 may be transferred into
the target. Later target-only private delivery needs explicit authority.

Isolation timestamps and trigger suppression must precede import. Classify
ordinary, ALWAYS/REPLICA and event triggers; `session_replication_role` alone is
not complete isolation. Source-to-target neutralizations cannot erase the closed
Quench correction or become an exception to final H/B1 parity.

## Authenticated SQL import and verification

Only under later import/handling authority authenticate the envelope, verify every
member size/hash and body receipt, and materialize required files in restricted
private task scratch excluded from Git, serving and deployment. Pin target client,
connection and exact programs in independent review. Preserve originals.

The source is plain schema SQL plus INSERT/`jsonb_populate_record` data, not a
custom-format pg_restore archive. The reviewed `psqlImportArguments()` sequence
uses no startup file/password prompt, ON_ERROR_STOP and one transaction: suppression
prelude, original schema/migration schema, original data/migration data, reviewed
roles/sequences and complete constraints before commit. Preserve pg_dump's restrict
scaffold. Check the exact target-compatible schema ordering before approval;
the argument builder does not establish that compatibility or launch anything.
Review every SQL/program file for transaction-control commands, nontransactional
operations, connection changes, shell/meta-command escapes or autocommit changes
that could defeat the single transaction, target binding or isolation. Do not
assume the command-line flag proves transactional execution. Unsupported content
requires HOLD, not silent edits to authenticated source artifacts.

The prelude must bound statement/lock/session execution and set UTC and reviewed
trigger suppression. Alphabetic data statements do not guarantee FK dependency
order. Validate every constraint/reference against all restored rows after
suppression. SET CONSTRAINTS or VALIDATE CONSTRAINT on already-valid constraints
alone does not prove skipped FK checks ran. Missing references or incomplete
constraint coverage cause rollback/HOLD; preserve original catalog/validity flags.
Sequence values are explicitly non-MVCC observations. Restore only reviewed values
and verify they cannot reuse existing keys; do not call nextval for verification
or claim an unobserved source high-water mark.

Capture sanitized numeric process/SQLSTATE outcomes and bounded exceptions; never
publish credentials, sensitive SQL/results or row contents. Interruption or
ambiguous commit/session state consumes the attempt and causes HOLD, without
replay. A database transaction does not make external Storage work transactional.

## Exact Storage restoration gate

Database metadata is not a body backend. Preserve original IDs, bucket/path/version,
ownership and metadata fingerprints as well as bytes. Ordinary upload/upsert can
generate new identity/version; path/body equality is insufficient. Do not seed
metadata then assume uploading links the original physical version. No invented
raw backend writes or unsupported provider-metadata SQL rewrites are permitted.

Before import approval, independently prove a provider-supported mechanism on the
selected target that preserves the exact original backend/metadata association.
Bind its procedure and capability evidence. There is currently no selected target
or accepted proof of that capability. An incapable target stays HOLD; no identity
remapping or contract relaxation is authorized. This is an unresolved target
capability, not a universal impossibility finding.

After separately approved restoration, independently HTTP-read all 475 bodies
through target Storage, hashing each against original size/bytes/identity/metadata.
Reconcile the entire Storage fingerprint, including metadata outside that subset.
Record per-object source/target read receipts in the existing manifest. Files in
a directory or restored database metadata alone do not certify Storage service.

## Remaining owner authority and coordinator handoff

No window is generated during preparation. Only after explicit owner readiness
generate fixed UTC boundaries and exact authorization digests for approval.

1. **Initial restoration:** approve the independently reviewed exact target,
   plan/program/candidate/evidence digests, authenticated handling, proven isolation
   and supported exact Storage method, private target credential delivery,
   supervision/coordination, one attempt, separate $10 ceiling, fixed 30-minute
   interval/dispatch cutoff, cleanup within that interval and exact seven-day
   encrypted restricted retention deadline. Resource creation needs separately
   explicit authority. Existing evidence deadlines are unchanged.
2. **Convergence:** after genuine independently verified H444 import, separately
   approve v4 bound to actual import/source/target/isolation/Storage receipt hashes,
   target connection, exact candidate, complete migration manifest and immutable
   intervention. Never preapprove hashes of future results. The existing coordinator
   consumes 445/446/447/448 in order with per-stage verification. B1 uses the existing
   `-IncludeConvergence` in both modes.

Each historical lane needs its own approved target/import evidence and consumed
stage records. Bind the identities and cleanup of both historical targets and
both disposable B1 lanes; one successful target does not certify all four lanes.

The import receipt acknowledges verification of all six artifacts, not SQL
execution of JSON manifests. `singleTransaction` attests only SQL import. Actual
isolation/trigger timestamps and import outcomes must be observed. Preparation
does not issue success receipts; coordinator validation already requires those
real receipts before Prepare/Preflight/Upgrade.

Retain H448-permissive/restrictive and B1-35-permissive/restrictive, complete
histories, strict final catalog parity under only existing wrappers compatibility,
all financial Test-state, Storage HTTP/accounting/body, RLS, concurrency, stale-writer,
fencing/drain, admission, delayed/duplicate Stripe-event and Quench denied/authorized
caller checks. Independent completion and exact cleanup receipts remain required.
Production physical-backup recovery, all prior HOLDs and evidence remain unchanged;
entry 02 stays reserved/unused. No production migration, deployment, merge or PR
closure is authorized by this candidate.

## References checked during preparation

[Supabase backup/restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
documents plain-SQL restore and distinguishes Storage body migration.
[Storage schema](https://supabase.com/docs/guides/storage/schema/design) places
bodies outside PostgreSQL and treats metadata as provider-managed.
[PostgreSQL 17 psql](https://www.postgresql.org/docs/17/app-psql.html) defines
single-transaction/ON_ERROR_STOP and their transaction-control limitations.
These references do not prove target compatibility or authorize example commands,
credential resets or provisioning instructions.
