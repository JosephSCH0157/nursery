# Hearth atomic script publication — local certification

Baseline: `f5a96058e31f2c8c9b9a6df28a4f6c9d1d2755c9` (verified remote main).
Branch: `codex/hearth-atomic-script-publication-20261111`.
Disposition: **GO for separate release certification; no merge, hosted migration,
deployment or hosted acceptance is authorized or certified here.**

The current script remains selected by `tongs.workpiece_files` at logical
`script/script.md`. Tongs stages immutable operation-scoped bytes, verifies
SHA-256/length, then atomically compares expected revision/hash and commits the
registry, durable receipt and event. Episode-row serialization also covers
initial creation. Same-ID recovery preserves the fingerprint; generic writers,
recording routes and standalone canonical-script deletion cannot bypass it.

Explicit Save freezes reviewed text and editing basis, waits for draft persistence,
conditionally publishes, then verifies the acknowledgment before approval. Edits
invalidate eligibility. Autosave stays draft-only. Stale or unknown-basis drafts
require deliberate canonical review; the reload control confirms replacement.
Optional review does not rewrite scripts. Approval retains its independent
revision/hash checks. Registry-selected legacy script objects remain readable.

## Local results

| Check | Result |
|---|---|
| Tongs complete configured suite | PASS — 702 tests |
| Hearth complete inventory | PASS — 162 test files |
| Final publication-focused backend suite | PASS — 15 tests (included in Tongs) |
| Genuine Chromium manual edit → Save → Approve → Ready | PASS — empty and existing canonical script cases |
| Chromium stale tab/reload, unchanged Save, lost acknowledgment/restart, overlapping autosave/editor change | PASS in both cases |
| Real PostgreSQL concurrent creation/update | PASS — exactly one committed winner and one conflict |
| Durable recovery, fingerprint conflict, immutable evidence, authorization revocation, RLS/execute grants | PASS |
| Abandonment and concurrent archive/cleanup versus finalization | PASS — no finalizable abandoned operation |
| Registry-selected/legacy reads; stale manifest detection/reconciliation | PASS |
| Workspace TypeScript and lint | PASS; existing lint warnings remain |
| Architecture | PASS — Hammer ratchet and Anvil cycle check |
| Production compilation and Hearth bundle budget | PASS — 1,769,022 total JS bytes; largest chunk 968,829 bytes |
| Frozen historical/baseline evidence | PASS — 414 historical migrations, 421 canonical files and 25 protected successor files |
| Diff whitespace checks | PASS |

Concurrency used separate PostgreSQL server backend processes, not a mocked
single-process mutex. Creation backend PIDs: **36734, 36733**; update PIDs:
**36776, 36775**. The disposable schema-only database `forge_script_bdab276a76e4` was removed
in the runner's `finally` block. No source database data was copied or changed.
The runner creates only synthetic local authority fixtures through existing
admission-event rules; it activates no funding, price policy or paid execution.

Browser HTTP adapters were local-only. The UI harness uses the production publication hook and approval/Ready clients; it does not certify the complete hosted HearthShell. The final run used a fresh temporary Vite
process on loopback 5189, since the existing 5173 process served a stale harness.
Both final cases passed; the temporary process was stopped and the original
server was preserved. Earlier stale-server timeouts and a corrected empty-state
adapter receipt are not counted as passing results.

## Migration and release limitations

Only new migration:
`supabase/migrations/20261111054816_tongs_atomic_script_publication.sql`.
SHA-256: `96a030a3ec2dbdbca94a58596fa3b03ad1b84b3a5770d5fd15eb85eb44d90025`.

This is schema-adapter concurrency/security certification and frozen-evidence
verification, **not** a new full-tail empty-B1 install or authentic historical
financial-state certificate. The existing November 4 Luna installation limitation
is unchanged. Separate release certification must validate the actual supported
upgrade path and coordinated database/backend/frontend rollout before release.
No hosted migration or production script workflow was exercised.

Manifest remains a revision-tagged projection outside the CAS. Same-operation
replay reconciles it against current registry authority. A manifest failure after
commit can still require recovery. Committed old script objects are retained
indefinitely (at least the proposed 90 days); no scheduled expiration is added.
Explicit archived-episode deletion removes exact scoped objects but preserves
terminal operation evidence. Late Storage completion after abandonment cannot
finalize, but may require a repeat exact-object cleanup after quiescence.

An unresolved Save is recovered using the same ID and frozen text. New edits must
not be substituted for that operation. Historical edited buffers without a saved
basis are deliberately not automatically rebased.

Unrelated branches, production-state documentation and the Hammer release report
were excluded. The production prebuild refreshed only the pre-existing navigation
file's generated timestamp; its navigation content was unchanged and the file is
excluded. The prebuild's generated Anvil bundle change was restored to HEAD.

## Exact changed files (30)

- `TONGS_PATH_CHARTER.md`
- `apps/hearth/HEARTH_CANONICAL_AUTHORITY.md`
- `apps/hearth/src/domain/draft.ts`
- `apps/hearth/src/hooks/useApprovalFlow.ts`
- `apps/hearth/src/hooks/useHearthScriptPublication.ts`
- `apps/hearth/src/lib/hearth-draft-persistence.ts`
- `apps/hearth/src/lib/hearth-script-approval-authority.ts`
- `apps/hearth/src/lib/hearth-script-publication.ts`
- `apps/hearth/src/lib/hearth-script-repo.ts`
- `apps/hearth/src/lib/hearth-workpiece.ts`
- `apps/hearth/src/routes/HearthShell.tsx`
- `apps/hearth/src/storage/local-store.ts`
- `apps/hearth/src/storage/tongs-store.ts`
- `apps/hearth/src/views/modes/HearthDraftScriptHeader.tsx`
- `apps/hearth/tests/hearth-ready-transition-wiring.test.ts`
- `apps/hearth/tests/hearth-script-publication.test.ts`
- `apps/nursery/package.json`
- `apps/nursery/playwright.script-publication.config.ts`
- `apps/nursery/playwright/fixtures/hearth-script-publication.html`
- `apps/nursery/playwright/fixtures/hearth-script-publication.tsx`
- `apps/nursery/playwright/hearth-script-publication.spec.ts`
- `docs/database/SCRIPT_PUBLICATION.md`
- `packages/tongs/package.json`
- `packages/tongs/src/script-publication.ts`
- `packages/tongs/src/workpiece-commit-api.ts`
- `packages/tongs/tests/script-publication.test.mjs`
- `packages/tongs/tests/workpiece-commit-api.test.mjs`
- `scripts/certify-script-publication-isolated.mjs`
- `supabase/migrations/20261111054816_tongs_atomic_script_publication.sql`
- `docs/releases/hearth-atomic-script-publication-2026-11-11.md`

Reproduction commands and recovery contract: [SCRIPT_PUBLICATION.md](../database/SCRIPT_PUBLICATION.md).
