# Hammer history epochs — HE-3D closure record

Status: **HE-3 closed; HE-4 unstarted and deployment-unauthorized**

Recorded: `2026-08-20T13:39:51.7530814Z`

Verified HEAD: `fd0c831c162a0ff70cdd0721c2c2e0a0b21fe3f9`

Audited implementation range: `436d06bcfffe9bc539d7323b51d4ad5f7c3fe49a^..fd0c831c162a0ff70cdd0721c2c2e0a0b21fe3f9`

## Closure decision

HE-3 is complete. A fully synthetic, authenticated, loopback-confined lifecycle proved the history-epoch architecture through real local Auth, Storage, registry authority, database CAS, Tongs HTTP transport, Hammer hydration, one edit, durable immutable head creation, reopen, undo, and redo. No production evidence, credential, host, Florida identity, Anvil identity, or production byte participated.

The proof closed two integration gaps before acceptance: artifact reads now require workspace-viewer authority, and Hammer now supplies the exact seven-field component-authority tuple validated by the database. The final repository preflight, application suites, migration contracts, database verifiers, build budgets, and security review are clean.

HE-4 is deliberately outside this closure. Migrations `20260819130000_tongs_hammer_history_epochs.sql` and `20260819140000_tongs_hammer_history_epoch_heads.sql` remain candidates for a later metadata-only production approval package; this record authorizes neither deployment nor production mutation.

## HE-3A — confinement proof

Commit `81edec9ed8cb85407ad473cb115801a8643eea0f` added the reusable disposable-stack launcher and Docker proxy. The closure reran both database verifiers on fresh identity `forge-he3-closure-20260820-01`, never the existing `nursery` stack.

- API, database, Studio, inbucket, analytics, and pooler published only on `127.0.0.1` (`59681`, `59682`, `59683`, `59684`, `59687`, `59689`).
- Localhost connectivity passed; connections through LAN addresses `172.31.144.1` and `192.168.1.196` were refused.
- The launcher reported `nursery_unchanged: true`.
- The temporary network, 13 containers, three named volumes, and `.he3a/forge-he3-closure-20260820-01` were removed. Post-cleanup container, volume, and directory queries returned no resource.

## HE-3B — browser registration

Commit `2b7dbf2ab929c7649da6cda1b77afe562c888940` registered `playwright/hammer.visual-authority-feedback.spec.ts` in the authoritative Nursery/package browser inventory rather than suppressing it. The suite remains explicit and runnable under the repository browser gate. The final inventory found 20 tests in 14 files, including both visual-authority cases:

1. mounted Hammer does not re-emit a stale workpiece visual downgrade;
2. automatic placement remains behind canonical resolver authority.

Workspace contract and test-runner exit preflights both passed. No missing fixture, credential, or production assumption was introduced.

## HE-3C — synthetic authenticated fixture

Commit `fd0c831c162a0ff70cdd0721c2c2e0a0b21fe3f9` added the deterministic local fixture and lifecycle harness. Its fixed authority identities are synthetic:

| Authority | Identity |
| --- | --- |
| Workspace | `a3100000-0000-4000-8000-000000000001` |
| Other workspace | `a3200000-0000-4000-8000-000000000002` |
| Workpiece | `a3300000-0000-4000-8000-000000000003` |
| Recording | `a3400000-0000-4000-8000-000000000004` |
| Revision | `a3500000-0000-4000-8000-000000000005` |
| Epoch | `a3600000-0000-4000-8000-000000000006` |
| First head | `a3700000-0000-4000-8000-000000000007` |

The fixture creates owner/editor, viewer, and cross-workspace principals through local Auth and signs them in normally. It seeds canonical recording/revision authority, registry rows, Storage objects, transcript, v2 timeline, placements, audio, editor session, editorial authority, and a legitimate but semantically divergent legacy history document. Fixed microsecond timestamps are retained (`2026-08-20T10:00:00.123456Z`, `2026-08-20T10:00:01.654321Z`, `2026-08-20T10:00:02.987654Z`, and `2026-08-20T10:01:00.111222Z`).

All seven seeded artifacts were downloaded through the real local Tongs `read-file` HTTP route and matched their seeded bytes exactly. Authorization was:

| Principal | Read result | Transition result |
| --- | --- | --- |
| Workspace owner/editor | Allowed | Allowed |
| Workspace viewer | Allowed | Denied, terminal/non-retryable |
| Anonymous | `401` | Execute denied |
| Cross-workspace user | `403` | Denied without row leakage |

The harness asserted the destination before every request. All 44 requests resolved to `127.0.0.1`, `localhost`, or `::1`; forbidden-host and forbidden-identity hits were exactly zero.

## Lifecycle and immutable chain evidence

The accepted lifecycle was:

1. A divergent legacy history object at the active revision pointer was archived byte-for-byte.
2. `archive_anchor` committed one immutable empty epoch anchor with zero entries, undo items, redo items, or checkpoints.
3. Hammer installed that anchor and established its canonical base state.
4. One synthetic edit changed playhead `0 → 2`.
5. One immutable sequence-1 head committed under the epoch.
6. A fresh load selected `epoch_head` through the normal revision history pointer.
7. Undo restored playhead `0`.
8. Redo restored playhead `2`.

The predecessor artifact was preserved at 727 bytes with SHA-256 `75788384ee9532fc724dee30c24d6368f8db0a031ad15e7463a2afd88291f099`. The archive registry row and stored archive bytes retained that exact size and digest; the archived evidence was not merged into or traversable from the new epoch.

The parent chain is exact: the sequence-1 head names the epoch anchor as parent, matches its path/hash/registry tuple, and carries the same epoch identity. Head sequence and pointer CAS advanced atomically. Independent database verification additionally proved sequences 1, 2, 3, and 4, with undo and redo represented as later immutable heads, while stale tokens, stale pointers, stale component authority, skipped sequences, wrong parents, duplicate identities, and inactive revisions all fail closed.

Mount/reopen write count was zero. After the committed edit head, reopen used only the authenticated artifact-read/hydration path; controller installation, undo, and redo performed no Storage write, registry mutation, transition RPC, or revision-pointer CAS. The immutable artifact manifest and pointer remained unchanged across the reopen window.

## Integration gaps found and corrected

1. **Artifact-read authorization.** The workpiece `read-file` route previously allowed service-backed reads without proving the caller's workspace membership. It now requires a user access token and checks workspace `viewer` authority before any bytes are returned. Editor/owner and viewer reads succeed; anonymous and cross-workspace reads are denied.
2. **Component-authority shape.** Hammer previously sent five fields while the head RPC validates seven. Each component now carries `workpiece_id`, `path`, `sha256`, `bytes`, `registry_revision`, `registry_updated_at`, and `content_type`. Strict parsing and database validation reject incomplete, stale, foreign, or mismatched tuples.

## HE-3D executable gates

| Gate | Result |
| --- | --- |
| Full Hammer suite | PASS — `161/161` |
| Full Tongs suite | PASS — `363/363`, 0 failed |
| Hammer typecheck | PASS |
| Tongs typecheck (including shared build) | PASS |
| Hammer lint | PASS — 0 errors; `78/84` grandfathered Hook warnings |
| Tongs lint | PASS — 0 errors/warnings reported |
| Type-safety ratchet | PASS — critical `any` 0, critical suppressions 0, total `any` `443/457`, suppressions `1/1` |
| Architecture ratchet | PASS — concentration, controller size, typing, presentation ownership, placement boundary, expansion gate, and `ts-nocheck` locked |
| Epoch/head migration contracts | PASS — 9/9, including generated types and immutable forward ordering |
| Epoch disposable DB verifier | PASS — authorization, CAS, RLS, append-only receipts, immutable archive, and pointer transition |
| Head disposable DB verifier | PASS — authorization, CAS, parent/sequence, readback, immutability, and sequences 1–4 |
| Workspace/browser inventory | PASS — 11 active packages; test-runner exit clean; 20 Playwright tests in 14 files |
| Hammer production build | PASS — 364 modules |
| Entry JS budget | PASS — `215,999 / 225,000` bytes |
| Total JS budget | PASS — `262,554 / 275,000` bytes |
| Total gzip budget | PASS — `86,687 / 90,000` bytes |
| `git diff --check` | PASS |

Lint debt did not increase: Hammer remained below its ratchet ceiling (`78` current Hook warnings versus `84` allowed), while Tongs remained clean.

## Security review

The complete 48-file, 5,300-addition/185-deletion HE-0→HE-3 range was reviewed across the React transport, Tongs HTTP boundary, coordinators, tests, and both SQL migrations. No Critical, High, Medium, or Low finding remains.

- Browser requests use the existing authenticated Tongs client and fixed relative endpoints; the synthetic harness rejects every non-loopback host and forbidden identity before `fetch`.
- Artifact reads enforce authenticated workspace-viewer authority server-side; frontend gating is not relied upon.
- State-changing epoch/head calls require editor-or-higher authority. Anonymous execution is revoked; viewer and cross-workspace mutations are denied.
- `SECURITY DEFINER` transition functions lock `search_path` to `pg_catalog, tongs`, validate all workspace/workpiece/recording/revision relationships, canonical paths, hashes, byte sizes, component tuples, parent/sequence rules, and exact CAS tokens.
- Readback functions are invoker-safe and independently enforce viewer authority.
- Authenticated direct insert/update/delete privileges are revoked; RLS viewer policies cover reads; immutable triggers protect committed epochs, heads, receipts, and referenced registry rows, including operational-role mutation attempts.
- Ambiguous outcomes resolve through idempotent readback; compensation deletes only an owned, byte-verified, unreferenced staged object under its exact registry CAS tuple.
- No new HTML/code-execution sink, untrusted navigation, cross-window messaging, persistent browser-token storage, or dynamic authenticated outbound-host path was introduced in this range. The only `innerHTML` match is constant test setup.

## Final worktree and boundary

At closure start and after every gate, the sole pre-existing modification was `apps/nursery/public/forge-nav.json` (`1` added line, `1` removed line). It was neither read as lifecycle evidence nor modified, staged, or included by HE-3D. The closure commit contains this record only.

No production endpoint was contacted. No Florida or Anvil identity or artifact was accessed. No existing local Supabase environment was reused or removed. All HE-3 disposable resources were cleaned up. HE-4 has not begun, and no deployment is authorized by this record.
