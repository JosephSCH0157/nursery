# H444 acquisition exporter preparation

**Proposal/Draft — NOT APPROVED — AUTHENTIC ACQUISITION PROHIBITED**

Prepared offline against `2847d5106785a572ebaca7b0d5ac23fa0a383bde` on
2026-11-21. This document supplements the unsigned
[acquisition authorization package](H444_ACQUISITION_AUTHORIZATION_NOT_APPROVED.md).
It changes neither that package's approval requirements nor the
[H444-to-447 certification proposal](STORAGE_H444_447_CERTIFICATION.md).

## Implementation boundary

`scripts/lib/storage-h444-exporter.mjs` adapts the preserved capture procedure's
single owning transaction, exported snapshot and row projections to the six-file
logical evidence contract. The preserved implementation remains unchanged at
`.git/forge-pr89-h444-446-preparation/capture_restore.py`, SHA-256
`330a91615dd755736ad74ae29e9e66450645ee2b8b6a3a31be8ef30180923b35`.
Its custom schema archive and combined payload were not the six required files.

The new module is a collection/assembly core with an injected transport. **Only
the in-memory synthetic transport is implemented.** The module has no network
client, subprocess launcher, credential resolver, persistent output writer,
restore method or certification runner. It rejects authentic mode and any
nonfixture transport before source operations. Plans must name the reserved
`fixture.invalid` endpoint and synthetic project. There is no runtime approval
flag that enables authentic collection.

The fixture transport models PostgreSQL responses and dump output. These tests
do not execute SQL, start PostgreSQL, perform a TLS handshake or establish that
the source permits the queries. A reviewed real transport and protected
publication layer remain implementation prerequisites before authentic use.
No existing acquisition or certification command calls this module.

## Collection and failure contract

- Start one `REPEATABLE READ READ ONLY` transaction, set UTC/ISO output,
  `standard_conforming_strings`, explicit timeouts and `row_security=off`.
  Record `pg_export_snapshot()` in that transaction. Every framed observation
  must retain the same backend PID, transaction snapshot, isolation, read-only
  setting, database, role, server version and TLS indication.
- Keep the owning transaction open for both schema-only plain-SQL dump requests.
  Both specify the exported `--snapshot` and explicit schema scope. Dump profiles
  require `verify-full`, the planned CA, no password prompt, read-only defaults,
  RLS-filter rejection and lock/statement timeouts. They preserve ownership/ACLs.
  The future adapter must use these exact arguments with a pinned binary, verify
  success/exit status and cancellation, and reject inherited connection overrides.
- Require the genuine historical lineage singleton, the complete pinned
  444-version prefix ending `20261111201029`, and all six original history
  columns: `created_by`, `idempotency_key`, `name`, `rollback`, `statements`,
  `version`. Original JSON row text is retained for hashing and SQL generation;
  numeric values are not serialized through JavaScript floating-point numbers.
- Require schema/column SELECT privileges and evidence that RLS cannot silently
  filter the projection. Reject missing columns and duplicate/missing relations.
  All columns of each declared financial table must be captured; require the four
  exact pricing, rollout, cost-policy and rate-condition selectors and Test mode.
  These checks establish only the declared scope. They do not prove that an
  unreviewed allowlist includes every financial or identity dependency.
- Require 475 unique synthetic Storage identities, 447,475 total bytes, and a
  matching plan-bound digest of IDs, bucket/path, provider versions, metadata,
  owners, user metadata and creation timestamps. This tests the identity gate;
  it neither reads authentic bodies nor reconciles approved authentic manifests.
- Preflight each row projection with bounded row-count/byte measurements in the
  same snapshot. Reject disagreement between measurement and exported rows.
  Hard maxima are 100,000 rows/table, 128 MiB cumulative received payload and
  128 MiB assembled six-file payload, 30 seconds/query, 180 seconds/dump,
  600 seconds/session, 2 seconds/lock and 5 seconds/cleanup. Limits may be lowered,
  never raised. These are preparation ceilings, not an approved cost allowance.
  They do not bound total server memory, protocol overhead or process RSS.
- Abort timed-out operations; require the transport to cancel/drain them, reap
  dump processes and roll back/close the owning connection. No bundle is returned
  if capture, final validation or cleanup fails. There are no automatic retries.
  Errors expose bounded error codes, not upstream messages or private row values.

The core checks transport assertions about TLS chain/hostname/CA and tool
identity. Those assertions are synthetic in these tests. A future implementation
must establish them from trusted execution and verified connections; accepting
caller-supplied booleans is not sufficient for authentic provenance.

## Six-artifact mapping

| Artifact | Prepared content and verification |
| --- | --- |
| `schema.sql` | Plain schema-only dump for declared non-migration schemas, including DDL ownership and ACLs. |
| `data.sql` | Deterministically ordered table/row projections, with exact original JSON text and escaped SQL literals. Inert output only. |
| `supabase-migrations-schema.sql` | Separate schema-only dump of `supabase_migrations` using the same exported snapshot. |
| `supabase-migrations-data.sql` | All 444 original six-column history rows, preserving nulls, arrays and values. |
| `role-and-acl-manifest.json` | Password-free role attributes, memberships, default ACLs, relation privilege observations, DDL ACL references and separately labeled sequence observations. |
| `snapshot-consistency.json` | Existing exact proof shape: source/snapshot, start/end, four matching MVCC snapshot IDs, source-observation hash and digest of the other five files' names/hashes/sizes. |

The sidecar source observation records plan, exporter-byte and query/request
digests, candidate identity, endpoint/CA/tool commitments, backend context,
snapshot timestamps and history/financial/Storage fingerprints. It is a
preparation observation, not a complete authentic predecessor certificate; it
does not assert that the existing H444 Storage behavior contract passed.

Artifact hashes cover final bytes. JSON keys and row/table ordering are stable.
Only pg_dump's paired outer randomized `\restrict`/`\unrestrict` keys are replaced
with a content-derived key. Function-body bytes and original line endings remain
intact. Reproducibility means identical capture inputs yield identical bytes;
independent acquisitions with different snapshot IDs/times will differ.

Sequence `last_value`, `is_called` and observation time are explicitly labeled
`NON_MVCC_OBSERVATIONS_ONLY`. The snapshot claim covers MVCC data/catalog reads,
not sequence counters or Storage bodies. No `setval` instructions are emitted.
If future use requires transaction-exact sequence state, this method cannot
supply it; stop for an independently reviewed method rather than inventing parity.

The receipt uses `forge.h444-synthetic-export-receipt.v1`, with
`acquisitionApproved:false` and `confidentialityVerified:false`. It deliberately
makes no `productionSecretsIncluded:false` assertion. The existing logical
artifact-directory byte/shape verifier is exported for direct reuse in tests;
its checks are unchanged. Full approval/restoration validation remains unchanged
and rejects this synthetic receipt. Passing directory validation proves neither
authenticity nor independent approval.

## Offline validation

Run only the following synthetic tests (no database or provider connection):

```text
node --test --test-reporter=spec scripts/test-storage-h444-exporter.mjs
node --test --test-reporter=spec scripts/test-storage-logical-restoration-certification.mjs scripts/test-storage-authentic-certification.mjs
```

The exporter test writes only newly generated synthetic files to a unique local
temporary directory to exercise the existing file validator, then removes that
directory. No captured SQL is imported or executed. Tests cover exact artifact
membership/hashes, tamper rejection, deterministic output, numeric fidelity,
non-MVCC labeling, missing history/authority/privileges, TLS policy rejection,
snapshot/session drift, bounds, sanitized failures and failed/timed-out cleanup.
The existing suites exercise approval/receipt rejection with synthetic callbacks;
running them is not restoration or certification execution.

## Unresolved confidentiality and authorization requirements

Security prerequisites were reconciled on 2026-11-21 in the
[acquisition package](H444_ACQUISITION_AUTHORIZATION_NOT_APPROVED.md) and
[confidential-output design](H444_CONFIDENTIAL_OUTPUT_DESIGN.md). The owner declares
no registered customers or customer information; source contents remain
uninspected. AES-256-GCM with Windows DPAPI CurrentUser wrapping is proposed,
subject to offline verification and documented recovery. Host hardening is
replaced by explicit, still-pending residual-risk acceptance, including exposure
of transient credentials and encryption keys. Mandatory source/output controls,
secret exclusions, exact artifact hashes and independent evidence review remain.
**NOT APPROVED — EXECUTION PROHIBITED.** No exporter gates changed.

| Requirement | Status / minimum next requirement |
| --- | --- |
| Authentic source and current H444 eligibility | **NOT VERIFIED.** Owner must identify permitted source/backup, endpoint, existing read-only principal and access window. No source read occurred. Stop if the source has advanced; never manufacture H444. |
| Exact extraction/dependency scope | **BLOCKED.** Independently review and pin complete tables/columns, financial journals/subscriptions/receipts/entitlements, workspace/episode/registry relationships, catalog dependencies and exclusions. The seven-table synthetic fixture and old 88-table manifest are not approved authentic scope. |
| Real transport and provenance | **BLOCKED.** Review pinned compatible psql/pg_dump versions/hashes, CA/hostname verification, connection framing, source role/identity, exit handling, cancellation and snapshot import. Validate against synthetic PostgreSQL before any authentic use. |
| Temporary/output files | **BLOCKED.** Implement and review encryption, restricted exact unused destination, no overwrite, atomic publication, key custody and failure retention. Node's `mode:0600` test option does not establish Windows ACL confidentiality. No authentic plaintext temporary file is permitted by this proposal. |
| Process memory | **ACCEPTANCE PENDING.** Current core holds plaintext buffers and JavaScript strings; garbage collection does not guarantee erasure. Verify process controls and obtain explicit owner acceptance of residual payload/credential/key exposure and same-account/elevated access. |
| Swap/pagefile/hibernation/crash dumps | **ACCEPTANCE PENDING.** Record known settings, unknown protections and explicit risk acceptance or owner-required mitigation. No mandatory workstation-wide configuration change follows from the prelaunch classification. Do not claim memory stays off disk. |
| Logs and secret screening | **BLOCKED.** Verify no credential-bearing arguments, raw payload/error logs or deliberate plaintext artifact files. Review the acquisition process and screen required schema/history/data. Accept residual host telemetry risk explicitly; comprehensive host-wide logging shutdown is not mandatory. Required secret-bearing fields cause a scope stop, never silent redaction or a false clean receipt. |
| Storage reconciliation | **BLOCKED.** Approve reuse-only reconciliation of preserved exact versions/body digests to the source snapshot. No new Storage GET is authorized. |
| Cost, expiry and retention | **UNDECIDED.** Approve payload/traffic/spend ceilings, payer, time window, expiry, custodian and retention/disposal policy. The test limits establish no pricing or spending commitment. |
| Independent authorization | **NOT ISSUED.** New bounded owner approval must bind procedure/code/allowlist/source/destination/safeguards/budget and expressly address the prior stop. Separately approve the exact acquired package after independent review. Consumed authorizations cannot be reused. |

**Stop here.** The permitted next step is offline review and completion of the
transport, dependency-scope and confidentiality prerequisites. Authentic
acquisition, restoration, H/B1 certification, financial operations and deployment
remain outside this preparation. PR #92 remains unmerged; this work does not
establish release readiness.
