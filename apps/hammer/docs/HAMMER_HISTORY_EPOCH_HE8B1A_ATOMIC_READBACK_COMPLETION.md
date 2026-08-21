# HE-8B1A — Atomic Authority Readback Completion

Date: 2026-08-21

Baseline: `e835d06ba3e191d092b70a46a49703358374392a`

Status: verified locally; HE-8B2 remains paused; no deployment authorized

## Boundary

HE-8B1A adds the forward-only migration
`20260821130000_tongs_hammer_history_atomic_readback_completion.sql`.
The applied HE-8B1 migration `20260821120000` was not modified (SHA-256
`685b94076bc0968a5a49aeb18708d3771d8c867f6def46e442c501226f0560af`).
The HE-8B1A migration SHA-256 is
`59843954956754578ceb57539be047a972b825fc6af6333eb0c346e6ba200fdf`.

The migration replaces the unified commit overload with the same contract plus
`p_parent_bytes bigint`. The parent artifact CAS now checks path, SHA-256, byte
count, registry revision, lossless registry timestamp, content type, bucket,
and storage key while holding the revision transaction lock.

The exact parent byte count is stored in the append-only
`tongs.hammer_history_epoch_atomic_parent_evidence` table, keyed one-to-one to
the immutable transition receipt. Exact idempotent replay compares this value;
altered replay returns `history_epoch_atomic_idempotency_conflict`.

The designated invoker-safe readback now returns, in one authorized response:

- operation identity and fingerprint;
- workspace, workpiece, recording, revision, epoch, head, transition, and sequence identities;
- immutable head envelope and frozen component-change plan;
- resulting component authority and editor-state hash;
- complete parent and head registry tuples, including byte counts, content types, and lossless timestamps;
- resulting history pointer and revision token.

It distinguishes exact committed state, a committed replacement, conclusive
absence, missing immutable evidence, and unauthorized access without direct
table reconstruction.

## Security and atomicity review

- Commit remains owned by `postgres`, `SECURITY DEFINER`, with
  `search_path=pg_catalog, tongs` and editor-or-higher authorization.
- Readback remains owned by `postgres`, `STABLE SECURITY INVOKER`, with the same
  locked search path and viewer-or-higher authorization.
- `public` and `anon` cannot execute the commit; `authenticated` and
  `service_role` retain the reviewed grants.
- Evidence-table RLS is enabled. Authenticated users receive viewer-scoped
  `SELECT` only; insert/update/delete are revoked. The existing immutable-row
  trigger rejects post-commit update and delete, including operational-role
  attempts.
- A null/nonpositive parent byte token is a typed request validation failure.
- All late failures execute inside the PL/pgSQL exception subtransaction, so
  component registry changes, head registration, pointer movement, transition,
  and evidence insertion roll back together.
- No direct mutation authority, broader role, dynamic caller-controlled SQL,
  or cross-workspace disclosure was introduced.

## Disposable verification

Final identity: `forge-he3-he8b1a-finalproof-20260821`

Database container: `supabase_db_forge-he3-he8b1a-finalproof-20260821`

Network: `forge-he3-he8b1a-finalproof-20260821-network`

Bindings: loopback only (`127.0.0.1`, ports 60621–60629); tested LAN addresses refused.

Repository Nursery stack: unchanged.

The complete migration chain replayed from zero: 189 ledger rows, with
`20260821130000` recorded exactly once.

Database verification proved:

- editor commit, owner/editor authorization, viewer/cross-workspace/anonymous denial;
- exact replay, altered-fingerprint replay, and altered-parent-byte replay;
- stale revision, pointer, parent tuple, component tuple, unchanged component,
  and late head-envelope conflicts;
- null parent bytes fail at request validation;
- every conflict preserves the prior component authority, pointer, and head set;
- conclusive committed/replacement/absent/unauthorized readback using only the RPC;
- evidence immutability and authenticated direct-mutation denial;
- both legacy epoch and immutable-head database verifiers remain green.

## Repository gates

- HE-8B1A migration contract: 15/15 passed.
- Atomic database verifier: passed.
- Existing epoch database verifier: passed.
- Existing epoch-head database verifier: passed.
- Full Hammer suite: 161/161 passed.
- Full Tongs suite: passed.
- Hammer and Tongs typechecks: passed.
- Hammer lint: 0 errors; 78/84 grandfathered Hook warnings.
- Tongs lint: passed with no output.
- Architecture/type-safety ratchets and Anvil cycle check: passed.
- Production Hammer build/budgets: entry 215,999/225,000 bytes; total JS
  262,554/275,000; total gzip 86,687/90,000.
- Security review: no findings after explicit null-token validation hardening.
- `git diff --check`: required before commit.

## Exclusions

No remote endpoint, production database, Florida identity, Anvil identity, or
Hammer runtime was accessed. HE-8B2 remains paused. The five protected files
were excluded and must remain byte-identical through commit.
