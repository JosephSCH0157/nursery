# H444 financial fingerprint observation request

Status: **NOT APPROVED — EXECUTION PROHIBITED**. This proposal requests a
separate, one-shot digest observation. It does not authorize acquisition,
restoration, certification, migrations, provider/Stripe changes or release.
No protected financial source rows were observed during this preparation.

## Exact operation proposed for owner approval

Use the existing authenticated Supabase MCP `execute_sql` interface, bound to
project **`wtvdjndyxegudufrompx`**, to submit the complete unchanged bytes of
[`h444-financial-fingerprint-observation.sql`](h444-financial-fingerprint-observation.sql)
once. SQL SHA-256:
**`583d8bf77750621151f97e02b34fb159ef0f6d1ef2da17ecd6a9c4363f928c9a`**.
The request must also bind the reviewed PR candidate containing that file.
This is a SQL identity, **not an owner authorization digest**.

This interface is the existing bounded-read route in
[`DATABASE_OPERATIONS.md`](../DATABASE_OPERATIONS.md). The expected observer
principal is **`postgres`**, matching the previously observed authenticated MCP
connection. The owner must expressly approve this fixed read-only use of that
existing privileged connection. It is not the proposed acquisition login
`supabase_read_only_user`, and this proposal does not grant it new authority.
No role creation, role switch, grant, credential retrieval, or linked Supabase
CLI command is involved. A different role or project is a stop, not a fallback.
Docker direct PostgreSQL remains the acquisition architecture; this independent
observation does not change that transport or enable the exporter.

Before dispatch, the operator and a different independent reviewer must verify:

- Exact candidate, SQL bytes/hash, authenticated MCP project binding and
  principal decision. SQL alone cannot cryptographically attest a Supabase
  project; source identity depends on the authenticated project routing and
  corroborating recorded project/endpoint evidence.
- The complete `protected` CTE and aggregate are identical to the existing
  [`storage_authentic_predecessor.sql`](../../../supabase/tests/storage_authentic_predecessor.sql)
  financial fingerprint. Its LF-normalized SHA-256 is
  `711f59ec75b92feef7a2b17258e36d4d9019f3ec7e209a15b33fc6e369d550f3`.
  The acquisition and physical/logical certification observations already use
  this contract. There is no second financial fingerprint algorithm.
- All **27** protected relations match the list in
  [`h444-extraction-review-plan.json`](h444-extraction-review-plan.json).
  Each row contributes its labeled, complete PostgreSQL JSONB representation;
  values are sorted with C collation, newline-delimited and SHA-256 hashed.
  No `LIMIT`, row filter, skipped relation, column projection, masked value or
  approximate/sample digest may replace the full financial scope. A missing
  relation, failed SELECT, schema/SQL drift or RLS visibility failure stops.
- Exact UTC authorization window, operator, independent reviewer, payer/cost
  ceiling, evidence custodian and retention deadline. These decisions have not
  been supplied. Authorization must explicitly address the existing owner stop
  for this observation alone; consumed acquisition approvals cannot be reused.

## Read-only behavior, eligibility and output

The fixed batch uses `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`,
transaction-local settings, one observation SELECT and `ROLLBACK`. It contains
no DDL, DML, credential statements, role changes, temporary objects, application
RPCs, `pg_dump`, Storage-body requests or row-level export. PostgreSQL may still
perform normal internal activity associated with reads; read-only is not a
promise of zero internal disk activity or zero source load.

The observation requires database/principal `postgres`, TLS reported by
`pg_stat_ssl`, read-only/repeatable-read settings, the genuine single
`historical-v1` lineage marker, the exact 444-version prefix digest
`b6642437f694d11e9ca29fb82046f556e699f7952a7e33f1f10916b71afeecc1`, and all 27
base/partitioned relations with SELECT capability. `row_security=off` makes
filtered RLS visibility an error rather than an incomplete fingerprint.
The guarded aggregate returns NULL with `BLOCKED_SOURCE_OR_CAPABILITY` if
eligibility fails. Never accept that as an empty-database fingerprint.

The expected result is exactly one JSON observation with these fields only:

`status`, `financialSha256`, `relationCount`, `observedAt`, `database`,
`principal`, `snapshotSha256`, `readOnly`, `isolation`, `tls`.

Accept only `FINGERPRINT_OBSERVED_NOT_APPROVED`, relationCount 27, a lowercase
64-hex fingerprint, expected identity/TLS/transaction values and a single
decoded observation of at most **4 KiB**. There are no financial row counts,
customer identifiers, row values, history SQL payloads or Storage object paths
in the output. The snapshot identifier is hashed to bound its representation.
Store the result, exact submitted SQL hash, candidate, authenticated project
binding and request completion/rollback evidence under access-restricted
`.git/forge-private-evidence`; do not print raw provider error payloads or
copy them to PR comments. No output file is an approval by itself.

## Time, load and failure limits

- One request, no concurrent fingerprint requests, no automatic retry.
- Server statement timeout **30 seconds**; lock timeout **2 seconds**;
  transaction timeout **60 seconds**; idle transaction timeout **60 seconds**.
  PostgreSQL 17 supports the transaction deadline. If a required setting is
  unsupported or denied, stop without removing it.
- `max_parallel_workers_per_gather=0` and `work_mem=4MB` limit parallel query
  use and sort workspace. They do **not** cap total aggregation memory, CPU,
  table pages scanned, provider egress or the invoice. Complete financial rows
  must be scanned server-side; large sets may fail or impose load. No partial
  fingerprint may be substituted after timeout, memory or resource failure.
- TLS to the MCP service and its database connection/cleanup behavior depend
  on provider guarantees; `pg_stat_ssl` establishes database-session TLS, not
  independently pinned libpq certificate verification. No new direct-client
  credential or connection is needed for this proposed interface. Its HTTP
  connection/response timeout and hard cancellation are not locally controlled.
  The server transaction deadline bounds abandoned transactional work once the
  SQL has set it; an unresponsive provider response is **UNKNOWN**, not success.
- Require a completed provider response for the entire batch. On timeout,
  disconnect, malformed/unexpected output, failed eligibility or any SQL error,
  reject the digest, record only a sanitized status/SQLSTATE and stop. If
  completion/rollback cannot be established, retain the ambiguity for the owner
  and reviewer to reconcile. Do not issue a retry, cancellation, role change or
  compensating database write under this authorization.

Return egress should be small because the result is one digest/provenance row,
but source size/current quota and exact load are unverified. This is not a
guaranteed zero-cost operation or enforceable dollar cap. Use existing resources
only; no provisioning or new paid infrastructure. The owner must accept those
limits and identify a payer/ceiling before execution.

## Evidence review and the next boundary

The independent reviewer must verify the result against the approved SQL,
candidate and authenticated source, then pin the financial digest separately
from the acquisition approval. A later acquisition must compare that digest
inside its own consistent snapshot and fail on drift; it must not refresh a
failed pin automatically. This observation is not the authentic export and
does not certify financial readiness or Test/Live activation.

Owner request: **Authorize one execution of the SQL/hash above, on project
`wtvdjndyxegudufrompx` through the existing authenticated MCP `postgres`
connection, solely for the full 27-relation aggregate fingerprint and listed
provenance, within the specified limits. Name the operator/reviewer, execution
window, retention/custodian and cost/risk decision. No acquisition or other
hosted operation is included.** No such authorization has been issued here.

Local validation reuses the acquisition fixture: the unchanged proposal rejects
a non-TLS fixture connection; its financial CTE/expression produces the same
native PostgreSQL digest as the governed observation; a transactional synthetic
row added independently to each of the 27 relations changes the digest. Tests
also pin the proposal bytes and complete financial scope. These are synthetic
checks, not protected source observations or provider execution guarantees.

References: [PostgreSQL 17 transaction/statement/lock timeouts and RLS visibility](https://www.postgresql.org/docs/17/runtime-config-client.html).
