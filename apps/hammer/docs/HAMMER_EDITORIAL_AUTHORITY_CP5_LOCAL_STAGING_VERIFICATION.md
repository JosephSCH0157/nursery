# Hammer revision editorial authority — CP-5 local staging verification

Date: 2026-08-19

Baseline: `5013cdeeb5a0b225fba459d15f1498afe95a0eaa`

Environment: `cp5-5013cdee-20260819-b9e2` (disposable local Supabase)

Result: **PASS — CP-5 complete; CP-6 not begun**

## Isolation and migration replay

- The disposable project used API `http://127.0.0.1:60321`, database port `60322`, and a local Tongs process at `http://127.0.0.1:60877`.
- The repository-linked ref `wtvdjndyxegudufrompx` was treated as production and was not contacted. All fixture traffic used localhost.
- The existing `nursery` local Supabase stack was neither reused nor stopped. Its containers remained running after cleanup.
- All 186 repository migrations replayed from an empty database. Ledger queries found `20260816190000` and `20260819120000` exactly once each.
- No fixture or captured request contained a Florida Oranges or live Anvil identity. Synthetic fixtures used the reserved `b0000000-0000-4000-8000-*` identity family.

Representative commands:

```text
supabase start --workdir D:\nursery\cp5-5013cdee-20260819-b9e2
supabase db reset --workdir D:\nursery\cp5-5013cdee-20260819-b9e2 --local
supabase stop --workdir D:\nursery\cp5-5013cdee-20260819-b9e2 --project-id cp5-5013cdee-20260819-b9e2 --no-backup --yes
```

## Schema and authorization contract

The replayed schema matched the reviewed contract:

- `tongs.recording_revisions.editorial_authority_path`: nullable `text`, no default.
- `editorial_authority_fingerprint`: nullable `text`, no default.
- `editorial_authority_revision`: non-null `bigint`, default `0`.
- The reviewed column comments and tuple constraints were present.
- `tongs.acknowledge_hammer_editorial_authority` remained owned by `postgres`, `SECURITY DEFINER`, with locked `search_path=pg_catalog, tongs`.
- RPC execution remained granted only to `authenticated` and `service_role` (plus owner); `anon` and `public` had no grant.
- `tongs.recording_revisions` retained RLS. Authenticated callers had read/delete/insert table privileges but no direct update privilege; an attempted direct update returned HTTP 403.

Authorization and CAS matrix:

| Case | Result |
| --- | --- |
| Owning editor, active revision, valid tuple | allowed |
| Viewer | HTTP 403 |
| Cross-workspace user | HTTP 403 |
| Anonymous | HTTP 401 |
| Inactive, superseded, or discarded revision | prompt HTTP 409, `PT409`, `editorial_authority_conflict` |
| Stale row token | prompt HTTP 409, pointer unchanged |
| Stale prior path/fingerprint/authority revision | prompt HTTP 409, pointer unchanged |
| Invalid canonical path or fingerprint | HTTP 400 |
| Mismatched workspace/workpiece/recording/revision | terminal denial; no write |
| Direct revision update | HTTP 403 |

The naturally generated revision token `2026-08-19T04:12:24.929113+00:00` was propagated unchanged during the matrix. Conflict responses were immediate; no PostgREST retry or Kong timeout was observed.

## Production-code transaction

The fixture exercised the repository's Hammer writer, Tongs HTTP transport, two-phase coordinator, revision loader, and canonical-open hydration—not a SQL-only surrogate.

The complete path passed:

```text
deterministic serialization
  -> artifact write and registry SHA-256
  -> revision-pointer CAS
  -> byte/metadata/pointer readback
  -> revision-owned authority hydration
  -> canonical reopen
```

Observed dispositions and counts:

| Operation | Disposition | Artifact writes | Pointer CAS calls |
| --- | --- | ---: | ---: |
| First identical call | `committed` | 1 | 1 |
| Second identical call | `already_committed` | 0 additional | 0 additional |
| Third identical call | `already_committed` | 0 additional | 0 additional |
| Changed authority | `committed` | 1 additional | 1 additional |

The second and third calls preserved the registry revision, pointer tuple, and timestamps. The changed authority advanced `editorial_authority_revision` exactly once, from 1 to 2. Canonical bytes were deterministic and their SHA-256 matched both registry metadata and the committed pointer.

Exact PostgreSQL concurrency tokens observed in the production-code path included:

```text
revision:     2026-08-19T04:17:42.82627+00:00
artifact:     2026-08-19T04:17:55.549203+00:00
pointer:      2026-08-19T04:17:55.791633+00:00
compensation: 2026-08-19T04:17:58.013334+00:00
stale token:  2026-08-19T04:17:58.907204+00:00
replacement:  2026-08-19T04:17:59.141052+00:00
```

Tokens were retained exactly, including PostgreSQL's valid variable microsecond precision and timezone representation.

## Readback, compensation, and reopen results

- An ambiguous pointer response was resolved through readback as `committed`, with one actual CAS.
- An ambiguous artifact outcome was resolved through metadata/byte readback.
- Exact-token compensation removed only the uncommitted artifact.
- A stale compensation token conflicted and preserved the replacement artifact; no destructive cleanup occurred.
- Pointer-present missing, unreadable, corrupt, path-mismatched, identity-mismatched, and fingerprint-mismatched authority states failed closed.
- Pointer-absent legacy compatibility remained available.
- Revision hydration selected the revision-owned authority artifact.
- Canonical reopen reported the persistence source and canonical basis. Transcript, visual timeline, placements, history payload, workspace/workpiece/recording/revision identities, and authority envelope survived readback unchanged.
- Captured request count was 73; forbidden-identity request count was 0.

## Verification gates

| Gate | Result |
| --- | --- |
| Tongs full suite | 315/315 passed |
| Tongs commit-API suite | 156/156 passed |
| Hammer full suite | 157/157 passed |
| Authority coordinator focused suite | 8/8 passed |
| Tongs typecheck | passed |
| Hammer typecheck | passed |
| Architecture ratchet and Anvil cycle check | passed; 272 files, no cycle |
| Tongs lint | passed, zero findings |
| Hammer scoped lint | unchanged baseline: 1 known error, 79 warnings, 0 unexpected warnings |
| Hammer production build/budgets | passed: entry 215999/225000; total JS 262554/275000; gzip 86563/90000 |
| `git diff --check` | passed for the CP-5 record; protected pre-existing file only emits its existing line-ending warning |

The Hammer lint command intentionally remains nonzero because its ratchet reports the pre-existing one-error baseline. This CP-5 record and fixture introduced no source changes and no new lint warning or error.

## Cleanup and scope confirmation

- The local Tongs process was stopped.
- Supabase stopped the exact project id `cp5-5013cdee-20260819-b9e2` with no backup.
- `D:\nursery\cp5-5013cdee-20260819-b9e2` was resolved to that exact path before deletion; it no longer exists.
- Docker contains no container or volume matching the disposable project id.
- The pre-existing `nursery` local stack remains running.
- Production, Florida Oranges, live Anvil, remote schemas/data, and the production writer were untouched.
- `apps/nursery/public/forge-nav.json` remains the user's protected, unstaged modification and is excluded from this record's commit.

CP-5 is complete under the rollout plan using the authorized disposable local staging environment. CP-6 production migration approval has not begun.
