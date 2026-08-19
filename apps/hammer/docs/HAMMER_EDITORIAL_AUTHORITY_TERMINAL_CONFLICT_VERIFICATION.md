# Hammer Editorial-Authority Terminal Conflict Verification

Date: 2026-08-19

Baseline: `8b48629fa278900e2e78464defea184b2ed7ad91`

Disposable project: `forge-authority-conflict-20260819-c42e`

## Scope

The forward migration `20260819120000_tongs_hammer_editorial_authority_terminal_conflict.sql` replaces the existing RPC definition without changing its signature, return value, authorization, validation, CAS predicates, ownership, grants, or security posture. The sole behavioral change is the zero-row expected-conflict SQLSTATE from retryable `40001` to explicit PostgREST status `PT409` while retaining `editorial_authority_conflict`.

No remote project was contacted. The original `20260816190000` migration was not modified.

## Clean replay and database contract

- All 186 repository migrations replayed from zero.
- `20260816190000` and `20260819120000` were each recorded exactly once.
- RPC owner: `postgres`.
- `SECURITY DEFINER`: enabled.
- `search_path`: `pg_catalog, tongs`.
- Execute: `authenticated` and `service_role` allowed; `anon` and `public` denied.
- Authenticated direct `recording_revisions` update remained denied.
- Static comparison proves the forward function/grant/owner block equals the deployed definition after substituting only `40001` with `PT409` and excluding the original migration's unrelated RLS reassertion.

## HTTP matrix

The local endpoint was `http://127.0.0.1:58321`. Each conflict case issued one request, returned `409`, retained code/message `PT409` / `editorial_authority_conflict`, and left the complete pointer tuple unchanged.

| Case | Latency |
|---|---:|
| Inactive/discarded revision | 5 ms |
| Superseded revision | 5 ms |
| Stale revision row token | 4 ms |
| Stale prior path | 4 ms |
| Stale prior fingerprint through changed row token | 5 ms |
| Stale authority revision | 5 ms |

The active valid CAS succeeded once and advanced authority revision from 0 to 1. An identical second attempt returned terminal `PT409` without another update.

Kong recorded exactly 13 RPC requests: one success, seven expected conflicts including the completed-CAS replay, three authorization denials, one invalid-path request, and one identity mismatch. There were zero `504` responses and zero `upstream timed out` entries, proving PostgREST did not retry these requests.

Authorization remained distinct from conflict handling:

- Viewer: `42501`, HTTP 403, 25 ms.
- Anonymous: `42501`, HTTP 401, 4 ms.
- Cross-workspace user: `42501`, HTTP 403, 21 ms.
- Invalid path: `22023` / `editorial_authority_path_invalid`, HTTP 400.
- Identity mismatch retained the existing zero-row conflict classification, now prompt HTTP 409.

## Verification gates

| Gate | Result |
|---|---|
| Migration contract tests | Pass, 4/4 |
| Authority coordinator tests | Pass, 8/8; ambiguous readback and compensation unchanged |
| Focused Hammer writer tests | Pass, 7/7 |
| Focused Hammer reader/reopen tests | Pass, 7/7 |
| Full Tongs suite | Pass, 314/314 |
| Full Hammer test runner | Pass, 157/157 |
| Tongs typecheck | Pass |
| Hammer typecheck | Pass |
| Hammer architecture ratchet | Pass |
| Tongs lint | Pass, zero findings |
| Hammer production build/budgets | Pass: entry 215,983/225,000; total JS 262,538/275,000; gzip 86,556/90,000 |
| `git diff --check` | Pass |

The Hammer wrapper's type-safety and lint ratchets remain red at both the clean baseline and this change: one authority-critical explicit `any`, two unsafe-type-escape files, and lint totals of 1 error/79 warnings. This repair changes no Hammer source file, introduces no additional type or lint debt, and the identical commands reproduced the identical findings at clean baseline `8b48629f`.

## Disposition

This migration repair is locally verified only. CP-5 remains paused pending a fresh complete CP-5 run. CP-6 has not begun.
