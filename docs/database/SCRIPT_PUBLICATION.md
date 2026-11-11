# Conditional canonical script publication

Status: implementation candidate; no hosted application authorized by this document.

`script/script.md` remains the logical identity. `tongs.workpiece_files` alone
selects the current revision, SHA-256, size, bucket and physical key. New objects
are create-only at `workpieces/{episode}/script/publications/{operation}/script.md`.
Existing registry-selected legacy objects remain readable.

The forward migration `20261111054816_tongs_atomic_script_publication.sql` adds an
operation/receipt ledger and service-only coordination functions. It changes no
financial records. RLS denies direct ledger access, including service-role table
writes; security-definer functions retain admission and editor checks. The
parent episode lock serializes absent-row creation, updates and archive/deletion.
The registry trigger prevents generic publication and identity rewriting.

Tongs authenticates the actor, prepares an immutable fingerprint, uploads without
overwrite, verifies the complete staged bytes, then invokes transactional CAS.
The expected revision AND hash must match. Registry advancement, terminal receipt
and publication event commit together. A stale basis becomes terminal conflict.
A mismatched reuse of an operation ID is rejected. Storage errors never authorize
an overwrite or a new operation.

HTTP `/tongs/workpieces/{episode}/script-publication`:
- POST: `workspace_id`, UUID `operation_id`, `expected_revision`, `expected_hash`,
  `text`. Same-operation retry recovers interrupted staging or a lost response.
- GET: query `workspace_id`, `operation_id`; authorized durable status/receipt.
- DELETE: same exact scope. Atomically abandon first; only abandoned/conflicted
  uncommitted object keys may be removed. Current/committed objects are rejected.
  An in-flight Storage request can finish after abandonment: it cannot finalize;
  repeat exact-operation cleanup after quiescence if necessary. No prefix deletion.

Manifest publication is deliberately outside CAS. Its script entry carries
`registry_revision` and `storage_key`. Stale projections fail closed; replaying
POST with the same operation reconciles against CURRENT registry state, not an
old receipt. A projection failure can occur after successful canonical commit;
recover the operation rather than assigning a new ID. Generic manifest writers
also derive their script projection from the registry. No cross-system atomicity
is claimed for manifest Storage and registry writes.

Hearth explicit Save persists the frozen reviewed draft and editing basis, then
publishes and validates operation/scope/revision/hash/size acknowledgment. Further
edits invalidate approval eligibility. Autosave only persists drafts. Unchanged
publication retains revision and physical object. Optional review no longer writes
changed scripts; use explicit Save. Approval rechecks acknowledged authority.
A legacy edited draft without a recorded basis fails safely and requires reviewing
canonical content before reapplying edits; the explicit “Reload canonical script” control requires confirmation before replacing the buffer. It is not silently rebased. Browser
recovery hints are not authority; every recovered operation is checked by Tongs.

Committed superseded objects are retained indefinitely by this implementation,
which exceeds the proposed minimum 90-day recovery window. No age-based deletion
job is added. Existing explicit archived-episode full deletion remains an
exception: close pending operations, remove exact episode keys including prior
revisions, preserve immutable terminal receipts. Workspace/member evidence stays.
Receipt retention and Storage retention are distinct. Late upload completion may
require repeat exact-object cleanup; canonical publication remains blocked.

Certification commands:
- `SUPABASE_DB_CONTAINER=supabase_db_forge-gate-e1-pre node scripts/certify-script-publication-isolated.mjs`
- `pnpm --filter @forge/tongs test`
- `pnpm --filter @nursery/hearth test`
- `pnpm --filter nursery test:script-publication` (existing local Vite on 5173)
- `pnpm typecheck`, `pnpm architecture`, `pnpm verify:db:historical-integrity`

The database runner copies schema only into a unique disposable database and drops
it in `finally`. It copies no customer records and tests real competing PostgreSQL
backend processes. This is not empty-B1 or authentic historical financial-state
certification. The pre-existing November 4 Luna fresh-install dependency is outside
this change. Hosted migration and deployment need separate approval and a verified
upgrade preflight. Old clients' generic script writes intentionally fail closed;
coordinate backend/schema/frontend release. Never roll back by restoring unsafe
mutable script writes.
