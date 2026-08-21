# HE-8B2A — Promoted Component Authority Repair

Date: 2026-08-21

Baseline: `800b7821e5c90918343e47c23c040e3612d350e4`

Status: verified locally; HE-8B3 remains uncommitted and production deployment remains unauthorized

## Defect and correction

HE-8B1 atomically promotes a changed component registry row to the operation-owned
Storage object at
`workpieces/<workpiece>/hammer/staging/history-atomic/<operation>/<component>.json`.
The database authority deliberately recognizes that promoted key as canonical
component authority. HE-8B2's coordinator nevertheless accepted only the original
`workpieces/<workpiece>/<component-path>` key as the expected tuple for a later
operation. The first edit succeeded, but the next edit, undo, or redo of the same
lane failed before reaching the database CAS.

The coordinator now accepts exactly two expected-key forms:

1. the canonical key derived from the frozen component path; or
2. a prior promoted atomic key with the exact workpiece identity, reserved prefix,
   UUID operation identity, and matching component lane.

The component path must remain a normalized JSON path below the frozen recording
revision. Empty, dot, dot-dot, backslash, query, fragment, history, archive, epoch,
and head paths are rejected. Component authority paths must be unique. Proposed
new targets are unchanged: they must use the current head UUID and matching lane
under the operation-owned atomic-staging prefix.

No migration, generated database type, RPC, authorization rule, CAS predicate,
readback contract, or compensation behavior changed.

## Regression evidence

Focused coordinator and HTTP coverage passed 22/22 and proves:

- the first canonical-key mutation commits;
- second edit, reopen boundary, undo, and redo accept prior promoted authority;
- exact replay remains write-free and idempotent;
- foreign workpiece/revision identities, malformed operation IDs, traversal-like
  keys, arbitrary keys, history paths, and wrong component lanes fail before
  staging;
- stale promoted tuples remain terminal database CAS conflicts;
- compensation removes only objects created by the failing operation and leaves
  prior promoted or replacement authority untouched;
- anonymous, viewer, and cross-workspace callers remain denied;
- generic saves remain unable to address atomic, archive, epoch, or head paths.

## Disposable database verification

Environment: `forge-he3-he8b1a-he8b2a-800b7821`

Database container:
`supabase_db_forge-he3-he8b1a-he8b2a-800b7821`

All bindings were confined to `127.0.0.1` on ports 61001–61009. LAN probes to
`172.31.144.1` and `192.168.1.196` were refused, and the existing `nursery`
stack remained unchanged.

All three database verifiers passed:

- epoch authority: authorization, CAS, readback, RLS, immutability, and legacy
  compatibility;
- immutable head authority: sequence 1, later heads, undo, redo, authorization,
  CAS, RLS, readback, and direct-mutation denial;
- atomic component/head authority: commit, exact replay, parent byte evidence,
  authorization, CAS rollback, readback, and immutable evidence.

The disposable containers, network, volumes, and temporary configuration were
removed and their absence verified.

## Repository gates

- Focused coordinator/HTTP tests: 22/22 passed.
- Full Tongs suite: 386/386 passed.
- Migration contract suite: 15/15 passed.
- Tongs typecheck: passed.
- Tongs lint: passed with zero errors and zero warnings.
- Anvil cycle check: passed, 272 files and zero cycles.
- Hammer architecture ratchet: passed at the clean `800b7821` baseline in a
  detached verification worktree. The active tree's byte-pinned partial HE-8B3
  snapshot-emitter edit is intentionally excluded from HE-8B2A and will be
  reconciled by HE-8B3.
- Security review: no authorization broadening, traversal path, foreign-identity
  acceptance, arbitrary Storage key, overwrite path, retry, secret exposure, or
  unsafe compensation behavior was found.
- `git diff --check`: passed.

## Exclusions

No remote endpoint, production database, deployment command, Florida or Anvil
identity, Hammer runtime integration, or HE-8 execution was used. Both HE-8B
migrations and generated database types remain immutable. The five previously
pinned files and every partial HE-8B3 file remained byte-identical and were
excluded from this commit through explicit pathspec staging.
