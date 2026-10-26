# Gate 5C authentic-history certification preflight

Date: 2026-10-21

Status: **read-only sensitivity assessment complete; authentic metadata export not authorized or performed**.

This document is the reviewed preparation boundary for the final local historical-upgrade certification. It does not authorize production metadata transfer, hosted writes, migration execution, a dashboard branch, or deployment.

## Frozen evidence

The following artifacts reverified at commit `83e96c5793ea0249e1d9ead186ebf2be63ae5226`:

- 414-file historical manifest SHA-256: `66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40`;
- B1 migration SHA-256: `73d2779c406b9428e7fdf189ab7ad084671cf1d03908041dbbe855816556c62e`;
- pre-Slice-A fixture SHA-256: `abf0d6f03dd25dc9d4af3f30bcca8d8be6047045033b399d6ba2918315bc9751`;
- hosted catalog contract SHA-256: `817f42cfe0f57d2961b52a72b58a5273c3cc1e2bf306e3a527e6bc58bdbcbfbe`;
- approved local normalized contract SHA-256: `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`;
- only approved environmental difference: hosted `wrappers` 0.5.6 versus CLI 2.84.2 local `wrappers` 0.5.7.

The four pending migration hashes remain:

| Version | SHA-256 |
| --- | --- |
| `20261020171517` | `da604a19a73984d730a943dd5fc312285f5b32faa728cbf4f17e453400bf47bc` |
| `20261020171519` | `414050336e111447efdfae878eae7a38eee4c8bf6ba6b6452272806ce260fa04` |
| `20261020171522` | `fd0f74697b7935d759d2abcacba3ea03157a8b84befc5c30204df771dc76b0c9` |
| `20261022000000` | `d9e41755bca6be4026d5faac6eb9e0be86ceb4b371d2b850b6a9028ed3c0b53e` |

Gate 5A proved six-column synthetic restoration and CLI discovery. Gate 5B proved the schema fixture and normal four-migration upgrade in permissive and restrictive local environments. Neither is authentic-history evidence.

## Aggregate hosted assessment

`supabase/tests/catalog/gate5c_history_sensitivity_preflight.sql` was executed through the Supabase database query service inside a PostgreSQL `READ ONLY` transaction. It returned aggregates and hashes only; no statement, identity value, URL, or credential value was returned.

Observed contract:

- 411 rows, versions `20260131120000` through `20261018120000`;
- exact columns, in order: `version text not null`, `statements text[]`, `name text`, `created_by text`, `idempotency_key text`, and `rollback text[]`;
- aggregate bytes scanned: 5,345,729;
- `statements`: one null row;
- `name`: zero null rows;
- `created_by`: 381 null rows and 30 populated rows;
- `idempotency_key`: 411 null rows;
- `rollback`: 411 null rows.

Source hashes:

| Contract | SHA-256 |
| --- | --- |
| All six columns | `418b37c4f246b3b7a6ce563c200009827e45d7c4530a24b2dab87bb92ba19f2b` |
| `version` | `9ff71b75bde4fbe4d06f511d024c84702200b1c4349ad08eecbd3a9022913596` |
| `statements` | `9d7d5266435932c63b063e88e13952b6c8b87aa9bcbe177273cf05ce74bf2188` |
| `name` | `484557e5492b5ed8ce56f8e1723765294d0aae1f617c227d967a36f99f139995` |
| `created_by` | `31c9e1669925fe2197f48dc53055e3e046f5fa3b50d04d6d0d81d76519200137` |
| `idempotency_key` | `176e76db0eff23ce6d987a17c91bb100ada9ee91724a7f2aaf0971173d5410a9` |
| `rollback` | `176e76db0eff23ce6d987a17c91bb100ada9ee91724a7f2aaf0971173d5410a9` |

The hosted `version` hash exactly equals an independently computed hash of the first 411 entries in the frozen historical manifest. This proves the complete ordered version prefix without exporting the version rows.

The aggregate scan found zero rows matching high-confidence credentialed connection strings, provider keys, JWTs, private keys, literal secret assignments, private-network endpoints, database/pooler endpoints, bearer tokens, additional provider-secret prefixes, or PEM material. Sixteen rows contain URLs, none in the private/database endpoint classes. Ninety-seven rows contain configuration references rather than embedded values.

The 30 populated `created_by` rows all contain one distinct email-shaped value. The value was not returned. This is personally identifying metadata. The statement arrays are also proprietary source material. The raw six-column set must therefore be handled as confidential even though the high-confidence secret scan was clean. Pattern matching cannot prove that arbitrary SQL contains no unconventional secret, so the encrypted capsule boundary remains mandatory.

## Linked CLI authentication finding

Supabase CLI 2.84.2 passwordless linked database commands are not strictly read-only at the platform boundary. The exact tagged source calls `POST /v1/projects/{ref}/cli/login-role` with `ReadOnly: false`, then uses the returned temporary role and password. This creates or rotates `cli_login_postgres` before the requested SQL runs.

Consequences:

- do not use `supabase db query --linked`, `migration list --linked`, or `db push --linked --dry-run` for Gate 5C while no production writes are authorized;
- `HistoricalPreflight` now fails closed when passwordless and is not admissible under this gate's zero-write requirement unless an existing database password is deliberately supplied;
- setting `SUPABASE_DB_PASSWORD` avoids temporary-role provisioning, but exposes a highly privileged credential to the local process and is not the selected export design;
- the approved design is the Management API database-query endpoint with a project-scoped token limited to `database_read`, request property `read_only: true`, and SQL beginning `BEGIN TRANSACTION READ ONLY`;
- if that read-only endpoint cannot return the payload, stop. Do not fall back to the passwordless linked CLI.

No temporary role was requested during this Gate 5C assessment.

## Required export permissions

The future export process requires only:

1. a Supabase Management API token scoped to the one project with `database_read` and no organization/project mutation permissions;
2. database-side `CONNECT`, `USAGE` on `supabase_migrations`, and `SELECT` on the six named columns of `supabase_migrations.schema_migrations` as provided by the read-only query service;
3. no access to `auth`, `public`, `tongs`, Storage objects, Vault secrets, application rows, logs, or provider configuration;
4. no database password, service-role key, application API key, or CLI login-role creation.

The export request must set both the API `read_only` property and PostgreSQL transaction read-only mode. Either boundary rejecting the operation is a hard stop.

## Confidential local capsule

`scripts/test-gate5c-confidential-capsule.ps1` proves the local storage mechanism with random dummy bytes only. It:

- creates a unique `forge-gate5c-capsule-*` directory beneath the operating-system temporary directory;
- removes inherited ACLs and permits only the current Windows user and `SYSTEM`;
- protects 8 MiB in memory with Windows DPAPI `CurrentUser` scope;
- never writes plaintext;
- verifies the decrypted SHA-256 in memory;
- clears plaintext, decrypted, entropy, and encrypted byte arrays where managed runtime behavior permits;
- deletes only the validated task path and proves cleanup.

DPAPI binds recovery to this Windows user profile and machine. The real capsule must be consumed and destroyed in the same session context. It must never be committed, attached to a chat, uploaded, copied to CI, or placed in a served workspace directory.

## Proposed owner-authorized execution procedure

The following procedure is reviewed but intentionally not operational until the owner separately authorizes the authentic export.

### 1. Revalidate immutable inputs

```powershell
supabase --version
./scripts/verify-canonical-database-artifacts.ps1
./scripts/verify-pre-slice-a-fixture.ps1
./scripts/verify-database-documentation-contract.ps1
./scripts/verify-forge-database-entrypoints.ps1
./scripts/test-gate5c-confidential-capsule.ps1
docker info
```

Require CLI `2.84.2`, exact hashes above, a passing dummy capsule test, and an already-running Docker engine. Stop on any difference.

### 2. Create the disposable database

Use a future Gate 5C harness derived from `scripts/certify-pre-slice-a-fixture.ps1`, preserving its random project ID, nine-port bind test, task-labeled internal network, credential-stripped child environment, Nursery identity inventory, and exact-path teardown. Apply:

```text
database/historical-pre-slice-a-v1/pre-slice-a-schema.sql
```

Before history restoration, require:

- no `forge_meta` schema;
- zero migration-history rows;
- exact pre-Slice-A catalog/security fingerprint;
- only the approved `wrappers` 0.5.6/0.5.7 normalization;
- passing public catalog, RLS, bootstrap, Quench, and financial-inactivity tests.

### 3. Export only after separate approval

The approved exporter must make one HTTPS request to:

```text
POST https://api.supabase.com/v1/projects/<project-ref>/database/query
```

Its JSON body must contain `read_only: true` and a query that begins `BEGIN TRANSACTION READ ONLY`, selects only the six migration columns, orders by `version`, and returns a single base64-encoded canonical JSON payload plus the seven hashes above. The exporter must:

- read the scoped token from process environment without echoing it;
- keep the HTTPS response and decoded payload in memory;
- compare row count, range, column contract, and every source hash before saving;
- DPAPI-protect the payload before the first filesystem write;
- save only the encrypted payload and a non-sensitive hash manifest in the restricted task directory;
- suppress response bodies and SQL on errors.

No direct `Invoke-WebRequest`, `curl`, `psql`, or CLI export command is currently checked in because those generic commands can print the response, expose a token in process arguments, or create the CLI login role. The owner-authorized execution change must add and review the in-memory exporter before use.

### 4. Restore transactionally

The Gate 5C harness must decrypt the payload in memory and stream it directly to the disposable Postgres container. The restore transaction must:

1. create or validate the exact six-column `supabase_migrations.schema_migrations` contract;
2. reject any pre-existing history row;
3. load all 411 rows through stdin, never a plaintext file;
4. recompute each column hash and the combined hash inside the target;
5. require exact equality to the authenticated source manifest;
6. require the exact chronological 411-version prefix;
7. commit only after every assertion passes.

Any parsing, count, hash, constraint, or prefix failure rolls back the entire restore and triggers teardown. Error handling must not print SQL values or COPY input.

### 5. Discover and apply the tail normally

Copy the canonical migration files into the isolated workdir, run the lineage guard against the local target, and require a normal dry run to discover exactly:

```text
20261020171517
20261020171519
20261020171522
20261022000000
```

Then run only:

```powershell
supabase migration up --local --workdir <isolated-workdir> --yes --agent=no
```

Never use `--include-all`, `migration repair`, or direct post-restore history edits.

### 6. Certify the result

Require 415 history rows, marker `historical-v1`, exact post-Slice-A catalog and ACL parity, the approved wrappers exception only, and the complete shared catalog, RLS, Data API, signup/profile/workspace, Anvil, display pairing, Quench, subscription/billing, and financial-denial suites. All test data must be synthetic.

This proves schema and migration behavior with authentic metadata. It still does not exercise upgrades against production customer or financial rows.

### 7. Teardown

Disconnect and stop only the task-created project, remove only resources bearing its unique project/run labels, clear sensitive byte arrays, delete the validated capsule path, and confirm:

- no capsule, container, volume, network, or temporary directory remains;
- existing Nursery container and volume identities are unchanged;
- no raw payload reached Git, logs, CI, chat, or an external service other than Supabase's own read-only HTTPS response;
- production remains unchanged.

## Stop conditions and remaining limits

Stop before export unless the owner explicitly authorizes the confidential metadata transfer and the reviewed in-memory exporter/restorer implementation. Also stop on:

- any changed artifact or migration hash;
- any nonzero secret/private-endpoint category;
- any metadata shape, row-count, or range change;
- inability to use the Management API with `database_read` and `read_only: true`;
- any requirement for a CLI login role, database password, customer-data access, or production write;
- any hash mismatch after restore;
- any pending migration other than the exact four;
- any catalog difference beyond the approved wrappers version;
- incomplete cleanup.

An authentic-history run will remain narrower than a data-bearing production upgrade. Final production migration authorization must continue to account for that residual data-dependent risk.
