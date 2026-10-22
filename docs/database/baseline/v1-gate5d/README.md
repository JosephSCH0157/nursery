# Gate 5D authentic-history certification tooling

Status: **Stage 1 synthetic certification passed; authentic hosted export not performed or authorized**.

Gate 5D adds a fail-closed exporter, DPAPI capsule contract, disposable-target restorer, and certification coordinator. The approved evidence contract is [`authentic-history-contract.json`](authentic-history-contract.json). No customer rows, financial rows, credentials, or hosted writes are part of this tooling.

`tooling.sha256.json` freezes the Stage 1 executable/query hashes. Verify it with `./scripts/verify-gate5d-authentic-history-tooling.ps1`; any change requires fresh review and a deliberately updated manifest.

## Exact hosted request and permission boundary

The exporter uses the documented Supabase Management API request:

```text
POST https://api.supabase.com/v1/projects/<project-ref>/database/query
Authorization: Bearer <scoped PAT beginning sbp_fc>
Content-Type: application/json

{"query":"<reviewed gate5d_authentic_history_export.sql>","parameters":[],"read_only":true}
```

The token must be scoped to one project with exactly `database_read`. The SQL begins `BEGIN TRANSACTION READ ONLY`, schema-qualifies `supabase_migrations.schema_migrations`, selects only `version`, `statements`, `name`, `created_by`, `idempotency_key`, and `rollback`, and returns one aggregate envelope. The response must match the Gate 5C count, range, seven hashes, and frozen 411-version prefix before encryption.

Supabase does not document a token-introspection endpoint. The exporter therefore requires a scoped-token prefix (`sbp_fc`), never a classic PAT or database credential; a current local attestation bound to the token and project-reference SHA-256 values and listing only `database_read` for exactly one project; absence of broader Supabase/database credentials; and `-AuthorizeAuthenticExport`. The attestation is a procedural control based on the dashboard token review, not API introspection. If the owner cannot verify that detail view, export remains blocked.

## Confidentiality and redaction

`scripts/export-gate5d-authentic-history.ps1` keeps the HTTP response and decoded canonical payload in memory. It never emits the token, SQL, raw response, statements, `created_by`, or capsule bytes. HTTP errors report only status; parsing failures report only the failed contract class.

The first payload write is Windows DPAPI `CurrentUser` ciphertext in a unique `forge-gate5d-*` OS-temporary directory. Inheritance is removed and only the current Windows user and `SYSTEM` receive access. The non-sensitive manifest records hashes, count, range, project-reference hash, entropy, and creation time. Decryption occurs only in memory. Managed byte arrays are cleared where the runtime permits.

Cleanup deletes only a validated task path and verifies absence. This is logical cleanup, not guaranteed forensic erasure on SSDs, journaled filesystems, swap, crash dumps, or managed-runtime copies. The capsule must never enter Git, CI, chat attachments, backups, served paths, or another account/machine.

## Restoration and orchestration

`scripts/restore-gate5d-authentic-history.ps1` accepts only a `forge-gate5d-*` Supabase project with a matching task identity file, one labeled internal Docker network, no provider containers, the certified fixture contract, empty history, and no lineage marker. It re-runs fixture catalog/security behavior checks, parses exactly six fields, validates the frozen version prefix, and transports base64-encoded JSON through stdin. SQL values are never interpolated. One transaction loads and recomputes all seven hashes; any failure rolls back.

`scripts/invoke-gate5d-authentic-history-certification.ps1` has two modes:

- `Stage1Synthetic` runs frozen checks, mock exporter/DPAPI tests, the Gate 5A transactional rollback proof, and Gate 5B permissive/restrictive normal-order upgrades. It cannot make a hosted request.
- `Authentic` is gated by `-AuthorizeAuthenticCertification` and consumes only an already prepared task-created disposable fixture target plus the encrypted capsule. It restores 411 rows, requires exactly four normally discovered migrations, applies them with `supabase migration up --local`, and requires 415 rows and `historical-v1`.

Authentic mode is intentionally not an approved operational command yet. Stage 2 must wrap target preparation, both default-privilege lanes, complete application/Data API/financial suites, fingerprint capture, and teardown under one reviewed invocation. Until that gap is closed and tested, authentic execution remains blocked.

## Stage 1 results

Executed locally with Supabase CLI `2.84.2` and an already-running Docker engine:

- mock parsing, exact-field/count/range/hash checks, NULL/array/quoting/newline/Unicode fidelity: passed;
- DPAPI CurrentUser round-trip, current-user+SYSTEM ACL, ciphertext-only disk scan: passed;
- malformed/extra/count, duplicate/missing version, corrupt/interrupted capsule: rejected;
- classic token and attested extra `database_write`: rejected before network access;
- failure-message redaction and cleanup: passed;
- Gate 5A 411-row transaction, rollback, corruption, missing/unknown version, exact four-pending discovery: passed;
- Gate 5B permissive and restrictive lanes: 415 rows, `historical-v1`, normalized catalog SHA-256 `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`, cleanup and Nursery preservation passed;
- authentic Management API requests: zero.

The new restorer's real six-column transaction cannot be end-to-end exercised without either the authentic payload or a fully integrated synthetic-contract lane. Parsing, encryption, target guards, and SQL construction are reviewed; transaction/rollback behavior is evidenced by Gate 5A. This remaining Stage 1 gap must close before Stage 2 export authorization.

## Recovery and stop conditions

Stop on any changed frozen hash, non-411 response, version/hash mismatch, malformed field, unknown token authority, ACL failure, target ambiguity, nonempty history, lineage marker, unapproved catalog difference, unexpected pending migration, failed security/financial test, or incomplete cleanup. Roll back, destroy only task-created resources, delete the capsule, and report blocked. Never retry with `--include-all`, `migration repair`, history edits, a database password, customer data, or weaker assertions.

## Stage 2 order requiring owner authorization

1. Reverify frozen artifacts, four pending hashes, CLI `2.84.2`, and Docker.
2. Owner reviews a one-project `database_read` scoped PAT and fingerprint-bound attestation.
3. Run the exporter once; validate and DPAPI-protect immediately.
4. Create and verify the isolated permissive fixture database.
5. Restore and verify authentic 411-row history transactionally.
6. Require exact four-migration discovery and run normal `migration up --local`.
7. Require 415 rows, `historical-v1`, catalog/ACL parity, and all RLS, Data API, application, Quench, billing, and financial-denial tests.
8. Repeat steps 4–7 in the restrictive lane using the encrypted capsule.
9. Delete capsule/resources, verify Nursery unchanged, and retain only non-sensitive evidence.

This remains schema-and-metadata upgrade evidence, not production customer-data-dependent upgrade evidence.
