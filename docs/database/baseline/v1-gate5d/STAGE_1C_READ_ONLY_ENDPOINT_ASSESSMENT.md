# Gate 5D Stage 1C dedicated read-only endpoint assessment

Date: 2026-10-22

Status: **adapter and synthetic tests complete; hosted endpoint/table access unverified; no hosted request made**.

Authoritative sources reviewed on 2026-10-22:

- [Supabase read-only query reference](https://supabase.com/docs/reference/api/v1-read-only-query)
- [Supabase Management API OpenAPI document](https://api.supabase.com/api/v1-json)
- [Supabase scoped personal access tokens](https://supabase.com/docs/guides/platform/personal-access-tokens)

## Official contract reviewed

The current Supabase Management API OpenAPI document describes:

- `POST /v1/projects/{ref}/database/query/read-only`;
- execution as `supabase_read_only_user`;
- OAuth scope `database:read` and fine-grained permission `database_read`;
- a 20-lowercase-letter project reference;
- JSON request body `{ "query": <nonempty string>, "parameters": [] }`;
- schema-qualified entity references;
- success status `201`, with `401`, `403`, `429`, and `500` failures;
- Beta/experimental stability.

The OpenAPI response for `201` has no documented schema. Neither the reference page nor OpenAPI publishes a response-size limit. The Stage 5C source scan measured 5,345,729 aggregate payload bytes, which expands to approximately 7.13 MB before JSON-envelope overhead when base64 encoded. Server and intermediary acceptance of that response size is therefore unverified.

The API documents a query string, but does not state that multiple statements or transaction-control statements are accepted. The dedicated query is consequently one `WITH ... SELECT` statement with no `BEGIN`, `SET`, or `COMMIT`. It retains `current_setting('transaction_read_only')` in the response so the existing parser still requires database evidence that the endpoint executed read-only.

Unsupported assumptions, all fail-closed:

- the response uses the generic endpoint's array-of-row JSON shape;
- the hosted role can access `supabase_migrations.schema_migrations` and all six columns;
- `extensions.digest` is executable by the hosted role;
- the service accepts the approximately 7.13 MB encoded response;
- the Beta contract remains stable through authentic execution.

Any different response shape, status, role behavior, count, range, field set, or hash is rejected without printing the body.

## Local source-access evidence

Read-only catalog inspection of the existing local Nursery Postgres container found:

- `supabase_read_only_user` exists and can log in;
- it is a member of `pg_read_all_data` and `pg_monitor` and has `BYPASSRLS` locally;
- it has database `CONNECT`;
- it has `USAGE` on `supabase_migrations` and `extensions`;
- it has table-level `SELECT` on that local `supabase_migrations.schema_migrations`;
- it can execute both installed `extensions.digest` overloads used by the export query.

That ordinary Nursery table has only `version`, `statements`, and `name`, so it is not evidence for the hosted six-column contract. The Stage 1B disposable fixture has the approved six-column shape; Stage 1C certification checks that the CLI 2.84.2 local read-only role reports schema, table, all-six-column, extension, and digest privileges there, and separately executes the probe SQL inside a local read-only transaction. Neither local environment is the hosted project and no hosted query or role assumption was performed. Hosted privileges are **unverified**, not passed. Gate 5D must not grant or alter any Supabase-managed privilege to make the endpoint work.

The local role's `pg_read_all_data` membership and `BYPASSRLS` also mean “read-only” is not “migration-history-only.” The source-controlled adapter constrains its own SQL, but a stolen scoped PAT could potentially use the endpoint to read other project data allowed to the managed role. Short expiry, one-project scope, process-only handling, immediate revocation, and no reuse are mandatory risk controls.

## Adapter boundary

The generic adapter and its query remain unchanged. The dedicated implementation is separate:

- `scripts/export-gate5d-authentic-history-read-only.ps1`;
- `supabase/tests/catalog/gate5d_authentic_history_export_read_only.sql`;
- `scripts/test-gate5d-read-only-endpoint-adapter.ps1`.

The adapter freezes the dedicated endpoint, role name, request properties, query SHA-256, six columns, 411 rows, version range, and seven authentic source hashes. It retains the scoped-token attestation, DPAPI CurrentUser encryption, restricted temporary ACL, redaction, cleanup, and prohibition on database passwords, generic Supabase tokens, query/endpoint overrides, and privileged CLI fallback. Synthetic response injection is allowed only with explicit `-SyntheticTest` and two existing `forge-gate5d-*` files beneath the OS temporary directory; it cannot coexist with authentic authorization.

The dedicated implementation is preferable in principle because read-only execution is selected by the endpoint and database role rather than by a body flag interpreted by the generic query endpoint. It is not yet an approved replacement because hosted table access, actual response shape, and response capacity are unresolved.

## Exact token action for an authorized probe

Immediately before an owner-authorized probe:

1. Open Supabase account **Access Tokens** and create a new **scoped** token.
2. Select only the Forge production project as the resource; do not select an organization-wide or all-project scope.
3. Grant only **Database — Read** (`database_read`). Do not grant Database Read-write or any other permission.
4. Choose the shortest practical expiry covering the probe and certification window.
5. Review the dashboard detail page and record a local attestation containing only the token SHA-256, project-reference SHA-256 allowlist, `database_read`, and review timestamp. Never record the token itself.
6. Put the token only in process-local `FORGE_GATE5D_DATABASE_READ_TOKEN`; keep `SUPABASE_ACCESS_TOKEN`, database passwords/URLs, service-role keys, and provider secrets absent.
7. Revoke the token immediately after the probe/certification or on any failure.

The local attestation binds locally reviewed values. It does not independently query or prove Supabase-side scope, expiry, revocation, project selection, or operator authority.

## Minimum live probe requiring separate authorization

The minimum probe is the single SELECT in `supabase/tests/catalog/gate5d_read_only_endpoint_probe.sql`, sent to the dedicated endpoint with `{query, parameters: []}`. It returns only:

- execution role name and `transaction_read_only`;
- Boolean schema, table, and six-column privilege checks;
- a zero-row projection count;
- a Boolean fixed-string `extensions.digest` check.

It returns no migration version, statement, author, idempotency key, rollback text, hash of hosted metadata, customer row, credential, or operational value. Success requires HTTP 201, the exact expected one-row response shape, `execution_user = supabase_read_only_user`, `transaction_read_only = on`, every Boolean true, and zero projection rows. Response bodies must remain in memory and be suppressed on errors.

This probe can safely precede authentic-history export after separate owner authorization because it performs one read-only request and exports no migration content. It establishes endpoint identity, request/response shape, and table/column/function access. It does not establish acceptance of the full encoded payload size; authentic export remains the first full-size response.

## Decision and remaining authorization

Recommendation: prefer the dedicated adapter for Stage 2 only if the owner-authorized minimum probe passes unchanged. A failed probe is a hard stop; do not grant privileges, fall back to the generic endpoint, use CLI authentication, or broaden the token.

Stage 2 still requires explicit authorization for:

1. creation/use of the one-project `database_read` scoped PAT;
2. the one-request non-confidential dedicated-endpoint probe;
3. only after that probe passes, one confidential authentic-history export through the selected reviewed adapter;
4. local two-lane restoration/certification and mandatory token/capsule/resource teardown.

Stage 2 authorization does not authorize production writes, privilege changes, migration execution, deployment, or customer-data export.

## Stage 1C synthetic result and frozen hashes

The dedicated adapter mock suite and the complete Stage 1B workflow passed on 2026-10-22 with Supabase CLI 2.84.2. Both privilege lanes retained 411 unchanged synthetic source rows, discovered exactly four tail migrations, finished with 415 rows and `historical-v1`, matched the 15,901-entry normalized catalog contract, made zero hosted requests, and left no task-created resources. The original seven Stage 1B synthetic history hashes remain unchanged.

| Artifact | SHA-256 |
| --- | --- |
| Frozen generic adapter (unchanged) | `2ceeecb1d118c6a755f46ab32b52fca7eda93d977284777ded422ae878eaa0ee` |
| Dedicated adapter | `3f2ee481a5b637b450329ce8df5b42e6376d81f4fd508a81fc842f42c8a932a8` |
| Dedicated single-SELECT export query | `62bdcad7e26bc18b7b308b0e9c9cf876d433114707da7662391ff08e10a7a83c` |
| Non-confidential probe query | `d9bf4e0257583e7c8ec865bac73d28f4fbd84ee59197e3867f75d844c6b248fb` |
| Dedicated adapter mock test | `e85934cbc7af1a024b322e925422e4009beefb3ec90152fa50903789c6de980e` |
| Gate 5D contract | `0c8245b8fa707c28f49043d2b40f255bade67d1a5b7137cb7e1fd223a5a25a7f` |
| Gate 5D tooling manifest | `8ef4d94da7b284094f962482e34bf6770591f53e58867be8f67a736ff252eae0` |
