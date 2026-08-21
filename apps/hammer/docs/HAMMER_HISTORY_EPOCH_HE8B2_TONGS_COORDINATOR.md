# HE-8B2 — Tongs Atomic Component-and-Head Coordinator

Date: 2026-08-21

Baseline: `62d6247c4ec856bd642738639f3462cf1809e322`

Status: verified locally; Hammer integration and production deployment remain unauthorized

## Boundary

HE-8B2 adds the Tongs coordinator and authenticated HTTP transport for the
database authority established by HE-8B1 and completed by HE-8B1A. The applied
migrations were not modified:

- `20260821120000_tongs_hammer_history_atomic_components.sql` — SHA-256
  `685b94076bc0968a5a49aeb18708d3771d8c867f6def46e442c501226f0560af`
- `20260821130000_tongs_hammer_history_atomic_readback_completion.sql` — SHA-256
  `59843954956754578ceb57539be047a972b825fc6af6333eb0c346e6ba200fdf`

No Hammer runtime integration is included.

## Coordinator contract

The coordinator freezes and validates the authenticated initiator; workspace,
workpiece, recording, revision, epoch, and head identities; lossless PostgreSQL
timestamp tokens; active history pointer; parent path, sequence, SHA-256, byte
count, registry revision/token, and content type; the complete five-lane
component authority; changed-component plan; normalized history; immutable head
envelope and bytes; idempotency key; and operation fingerprint.

Changed components are staged create-only at operation-scoped reserved paths,
followed by the immutable head. Unchanged lanes are never staged. Existing
objects are accepted only when bytes, hash, size, content type, storage identity,
and operation ownership all match. The generic save boundary continues to reject
epoch, archive, head, and atomic-staging paths.

The coordinator invokes
`commit_hammer_history_epoch_head_with_components` once. It then verifies the
complete result through
`read_hammer_history_epoch_head_with_components_operation`, including the
HE-8B1A parent byte count. Exact replay returns `already_committed` before any
Storage or mutation call. A missing, malformed, interrupted, or timed-out commit
response is never retried; only the expanded readback RPC may prove the outcome.
Inconclusive readback preserves all staged objects and returns a terminal
`ambiguous_unresolved` result.

Compensation is limited to objects created by the invocation after a conclusive
terminal conflict. It verifies exact bytes and metadata and refuses deletion if
the object is reused, foreign, replaced, uncertain, registered as component
authority, selected by the revision pointer, or referenced by a head or
transition. A cleanup refusal is surfaced as
`history_epoch_atomic_compensation_conflict` without masking the original code.

## HTTP and authorization

The authenticated commit endpoint requires workspace editor-or-higher authority
and requires the frozen initiating user to match the authenticated user. The
operation endpoint delegates authorization and disclosure to the invoker-safe
readback RPC. Request envelopes reject unknown fields and decode staged bytes
only after exact shape checks. Microsecond timestamp strings are forwarded
without Date conversion. No service credential is exposed and no commit retry is
implemented.

## Disposable verification

Identity: `forge-he3-he8b1a-he8b2-62d6247c`

Database container:
`supabase_db_forge-he3-he8b1a-he8b2-62d6247c`

Network: `forge-he3-he8b1a-he8b2-62d6247c-network`

All published bindings were confined to `127.0.0.1` on ports 60821–60829.
Connections through both tested LAN interfaces were refused. The existing
`nursery` stack was unchanged. The full migration chain replayed from zero with
189 distinct ledger rows; `20260821120000` and `20260821130000` were each present
once.

Database results:

- legacy epoch verifier: passed all authorization, CAS, readback, immutability,
  and normal-history compatibility cases;
- immutable-head verifier: passed the complete anchor, edit, undo, redo,
  authorization, CAS, readback, and direct-mutation matrix;
- atomic component/head verifier: passed all commit, exact replay, parent-byte,
  authorization, CAS, rollback, conclusive readback, and evidence-immutability
  cases.

## Repository verification

- Focused coordinator and HTTP transport: 19/19 passed.
- Full Tongs suite: 382/382 passed.
- Migration contract suite: 15/15 passed.
- Tongs typecheck: passed.
- Tongs lint: passed with zero errors and zero warnings.
- Workspace/test-runner preflight: passed.
- Hammer architecture ratchet and Anvil cycle check: passed.
- Security review: no authorization broadening, caller-controlled SQL, secret
  exposure, overwrite path, retry-on-ambiguity, or unsafe compensation path was
  found.
- `git diff --check`: passed.

## Exclusions

No remote endpoint, production database, Florida identity, Anvil identity,
production credential, Hammer runtime, or deployment command was used. The five
protected worktree files were checked by SHA-256 before the work, at major gates,
and before commit; they remained byte-identical and were excluded explicitly.
HE-8 and HE-9 remain unauthorized.
