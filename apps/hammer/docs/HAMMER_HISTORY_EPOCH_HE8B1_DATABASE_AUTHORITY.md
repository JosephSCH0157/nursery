# HE-8B1 Database Authority Verification

Date: 2026-08-21

Baseline: `c725fde2d08ea5456b8597a1ce14e7e1d95eb34b`

Scope: local database authority only; HE-8B2/HE-8B3 and production remain unauthorized.

## Contract

Migration `20260821120000_tongs_hammer_history_atomic_components.sql` adds
`tongs.commit_hammer_history_epoch_head_with_components(...)` and authorized
idempotent readback. The commit function is `SECURITY DEFINER`, owned by
`postgres`, locked to `search_path = pg_catalog, tongs`, executable by
`authenticated` and `service_role`, and revoked from `public`/anonymous use.

The RPC takes one advisory/revision lock and one frozen CAS basis: active
revision identity and microsecond token, current history pointer, immutable
parent registry tuple, every changed component registry tuple, head identity,
operation fingerprint, and idempotency key. It installs changed component
registry authority, registers the immutable head, inserts the head and receipt,
and advances `recording_revisions.history_path` inside one transaction. A late
head failure raises inside a PL/pgSQL subtransaction so all earlier registry
updates roll back. Results are `committed`, `already_committed`, or typed,
terminal, non-retryable conflict objects.

Changed components must be unique canonical revision lanes. Their hashes must
change, registry revisions must advance exactly once, timestamps must advance,
and object keys must be scoped to
`workpieces/<workpiece>/hammer/staging/history-atomic/<head>/`. The exact change
plan is retained in the immutable transition envelope and participates in exact
replay comparison. Generic Storage mutation and reserved-path rules are not
changed. No Tongs or Hammer runtime route is added in HE-8B1.

## Disposable verification

Final identity: `forge-he3-he8b1-verified-20260821`

Endpoints: loopback-only ports `58821`-`58829`

Migration SHA-256: `685b94076bc0968a5a49aeb18708d3771d8c867f6def46e442c501226f0560af`

The complete repository migration chain replayed from zero. The ledger had 188
rows and recorded `20260821120000` exactly once. Isolation checks proved all
published listeners were `127.0.0.1`, LAN connectivity was refused, the linked
remote project was never contacted, and the existing `nursery` stack was
unchanged.

The executable database verifier proved:

- editor commit succeeds and changes one component registry tuple, one head,
  one transition, and one revision pointer together;
- exact replay returns `already_committed`; changed replay conflicts;
- viewer, anonymous, and cross-workspace mutation is denied;
- stale revision token, pointer, and component tuples fail closed;
- unchanged-component submission is rejected;
- a deliberately late envelope/head failure rolls back component, head,
  transition, and pointer state;
- authorized readback returns the exact receipt;
- authenticated direct component/head mutation remains denied;
- the pre-existing head database verifier still passes, including legacy
  pointer behavior, four-head sequencing, RLS, immutability, and readback.

## Gates

- migration contract tests: 12/12
- HE-8B1 disposable database verifier: passed
- existing epoch-head disposable verifier: passed
- Tongs full suite: 364/364
- Hammer full suite and registration inventory: 161/161
- Tongs typecheck: passed
- Hammer typecheck: passed
- Tongs lint: passed with zero warnings/errors
- architecture/type-safety ratchets and Anvil cycle check: passed
- Hammer production build/budgets: passed (`215999/225000` entry bytes,
  `262554/275000` total JS, `86687/90000` gzip)
- `git diff --check`: passed (line-ending notices only; no errors)

The final diff contains no runtime integration, remote configuration, production
credential, or production artifact. Florida, Anvil, and the protected
`apps/nursery/public/forge-nav.json` modification were not accessed or changed.
HE-8B2, HE-8B3, production deployment, and HE-8 execution remain unstarted.
