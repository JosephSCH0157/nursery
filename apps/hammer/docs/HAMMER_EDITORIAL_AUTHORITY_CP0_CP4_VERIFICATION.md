# Hammer Editorial Authority CP-0–CP-4 Verification

Date: 2026-08-18

Baseline: `5f56b6412a39275d1a2e851ac3d2ce0ca6bc6de8`

Scope: local implementation and disposable in-memory fixtures only.

## Worktree protection

- `apps/nursery/public/forge-nav.json` was present before this rollout, was not edited by the rollout, and is excluded from staging and commit.
- Reader seam changes already present at CP-0 were preserved and reviewed with the writer change.
- No Supabase deployment, remote schema command, production API mutation, Florida reopen, or Florida write was performed.

## Writer trigger and ordering

The writer runs only from Hammer's existing canonical autosave/lifecycle-flush persistence boundary when canonical persistence is enabled. Hydration and inspection do not invoke it.

Ordering:

1. Save revision-owned ordinary artifacts.
2. Save the existing workpiece compatibility projection.
3. Freeze the active revision identity and authority graph.
4. Deterministically serialize the identity-bound revision authority artifact and calculate SHA-256.
5. Read the revision pointer and artifact metadata.
6. Write the exact artifact with expected-prior file CAS, including explicit absence CAS.
7. Acknowledge the pointer through the narrow revision RPC CAS.
8. Reread revision and artifact metadata and require the intended path/hash/revision.
9. On acknowledgement failure, reread before retry; compensate only when both pointer and written artifact prove ownership of the failed attempt.

## Fixture isolation proof

The writer end-to-end fixture is an in-memory transport with no URL, fetch, Supabase client, environment credential, or production adapter. It uses:

- workspace `10000000-0000-4000-8000-000000000001`
- workpiece `20000000-0000-4000-8000-000000000002`
- canonical recording `30000000-0000-4000-8000-000000000003`
- revision `40000000-0000-4000-8000-000000000004`

The test asserts those values do not equal any of the four known Florida identities before executing a fixture write. It covers deterministic serialization, artifact → pointer → readback ordering, ambiguous acknowledgement, absence compensation, overwritten-artifact restoration, foreign concurrency, compensation conflict, inactive revision, and cross-identity rejection.

## Security/diff review

- Revision reader is fail-closed for pointer-present artifact failures and uses legacy authority only when the pointer is absent.
- Artifact envelopes bind workspace, workpiece, canonical recording, and revision identities.
- Artifact paths are revision-derived in Hammer, independently validated by Tongs, and independently validated by the RPC.
- Artifact creation uses explicit null CAS to prevent a race from overwriting a newly created foreign artifact.
- Authority artifact writes require an authenticated editor for the owning workspace.
- Pointer updates require the active revision, all owning identities, expected revision timestamp, expected prior path, and expected monotonic authority revision.
- The RPC uses a locked search path and a PostgreSQL-owned security-definer boundary; authenticated direct table update is revoked.
- Compensation refuses a committed pointer and uses exact path plus file timestamp CAS. Foreign state is retained and surfaced.
- No credentials, tokens, service keys, remote URLs, Florida artifact bytes, history changes, or placement-reconciliation changes are in the diff.
- `git diff --check` passes; line-ending messages are Git's existing LF-to-CRLF checkout warnings, not whitespace errors.

## Verification results

| Gate | Exact command | Result |
|---|---|---|
| Hammer typecheck | `pnpm --dir apps/hammer typecheck` | Pass |
| Tongs typecheck | `pnpm --dir packages/tongs typecheck` | Pass |
| Architecture ratchet | `pnpm --dir apps/hammer architecture:ratchet` | Pass |
| Full Hammer suite | `node scripts/run-all-tests.mjs` from `apps/hammer` | Pass, 155/155 |
| Tongs commit API contract | `pnpm --dir packages/tongs test:commit-api` | Pass, 149/149 |
| Tongs authority coordinator | `pnpm --dir packages/tongs test:editorial-authority` | Pass, 8/8 |
| Production build | `pnpm --dir apps/hammer build` | Pass; entry 215,983/225,000 bytes, total JS 262,538/275,000, gzip 86,556/90,000 |
| Hammer scoped lint | `pnpm exec eslint` over the seven changed Hammer TS/TSX files | Pass, 0 errors and 12 warnings |
| Tongs scoped lint | `pnpm exec eslint` over the four changed Tongs TS/MJS files | Pass, 0 errors and 0 warnings |
| Baseline lint comparison | identical existing Hammer file scope from `git show 5f56b641:...` through ESLint stdin | 0 errors and the same 12 warnings |
| Whitespace | `git diff --check` | Pass |

The 12 scoped warnings are unchanged `react-hooks/exhaustive-deps` debt in `HammerWorkspaceEditor.tsx`; the new writer, reader test, writer test, Tongs implementation, and Tongs tests add no lint findings.

Two pre-gate implementation findings were corrected before final verification: the editor initially exceeded the architecture line cap by three lines, and the first production build could not resolve the newly declared workspace dependency until the local workspace links were refreshed. The final ratchet and production build both pass.

## Checkpoint disposition

- CP-0: pass
- CP-1: pass locally; migration remains undeployed
- CP-2: pass
- CP-3: pass using disposable in-memory fixture only
- CP-4: pass after scoped commit
- CP-5: not begun
