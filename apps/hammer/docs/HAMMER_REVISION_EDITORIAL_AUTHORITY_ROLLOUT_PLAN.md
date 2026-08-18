# Hammer Revision-Owned Editorial Authority Persistence Rollout

Status: implementation and rollout plan only. No database migration, database mutation, Florida write, or commit is authorized by this document.

## 1. Objective

Complete the live writer-to-reader chain for revision-owned Hammer editorial authority:

```text
canonical authority snapshot
  -> revision-scoped artifact write
  -> revision pointer compare-and-swap
  -> artifact/pointer readback verification
  -> hydrated canonical reopen
```

The rollout must preserve the fail-closed reader rule: once a revision advertises an authority pointer, any missing, unreadable, malformed, identity-mismatched, path-mismatched, or fingerprint-mismatched artifact is an integrity failure. It must not silently fall back to legacy/workpiece authority.

This requires a DB migration / RLS update. Supabase in the `tongs` schema remains the canonical persistence layer.

## 2. Scope and non-goals

In scope:

- Review and deploy the existing additive revision-authority migration and its RLS/RPC contract.
- Add the Hammer runtime adapter for the existing two-phase authority coordinator.
- Prove the complete transaction in an isolated fixture.
- Run a separately gated, authenticated, mutation-free Florida dry run.
- After explicit authorization, write exactly one Florida authority artifact and its active-revision pointer.
- Verify canonical reopen before investigating any history error.

Out of scope:

- History replay, history baseline, or `history_current_head_mismatch` changes.
- Placement reconciliation changes.
- Corrective transcript, timeline, placement, or history writes.
- Schema replacement, destructive rollback, or legacy-column removal.
- Committing the currently uncommitted reader changes during planning.
- Modifying or reverting `apps/nursery/public/forge-nav.json`.

## 3. Known live state and rollout identity

The planning baseline is:

| Field | Value |
|---|---|
| Workspace | `494c2ae5-9037-4208-b898-fab4898ab430` |
| Florida workpiece | `85d076d6-54e6-4b56-ab60-5eff4c87cdd0` |
| Canonical recording | `6c5b0d00-f775-4611-ac67-284dd9ae7d39` |
| Observed active revision | `f642b5d9-cec2-4656-804e-49bb33bc0cb5` |
| Migration | `20260816190000_tongs_hammer_editorial_authority_revision.sql` |

These values are evidence, not write authorization. The active revision and its concurrency token must be reread during the authenticated dry run. Any change invalidates a previously prepared write package.

The current live chain is expected to degrade because the remote schema does not yet expose the revision pointer columns, the runtime writer is not wired, and Florida has no revision-owned authority artifact. The separate history-head error remains downstream and is deliberately excluded until authority installs canonically.

## 4. Persistence contract

### 4.1 Revision pointer

The active `tongs.recording_revisions` row owns these fields:

- `editorial_authority_path`
- `editorial_authority_fingerprint`
- `editorial_authority_revision`

The pointer update is a narrow compare-and-swap operation. It must require:

- authenticated Hammer editor access to the workspace;
- the expected workspace, workpiece, canonical recording, and active revision identities;
- the expected revision row concurrency token (`updated_at` or the reviewed equivalent);
- the expected prior authority pointer tuple;
- a canonical revision-scoped path;
- a nonnegative authority revision;
- exactly one active target revision.

Zero updated rows means a conflict, not success. More than one updated row is an invariant violation.

### 4.2 Artifact

The exact canonical path is:

```text
hammer/revisions/<recording_revision_id>/editorial-authority.v1.json
```

The artifact envelope is identity-bound:

```json
{
  "schema_version": 1,
  "workspace_id": "<workspace UUID>",
  "workpiece_id": "<workpiece UUID>",
  "canonical_recording_id": "<recording UUID>",
  "recording_revision_id": "<revision UUID>",
  "authority": {}
}
```

Serialization must be deterministic. The pointer fingerprint is the SHA-256 of the exact persisted bytes and must equal the canonical `tongs.workpiece_files.hash_value` recorded for that path. Hashing a reconstructed object after read is not an acceptable substitute for verifying the stored bytes.

### 4.3 Compatibility behavior

- Pointer present: load and validate the revision artifact; any failure is fail-closed.
- Pointer absent: the defined legacy/workpiece authority may be used as a compatibility fallback.
- Runtime writing targets only the active revision-owned contract. It must not create or update a local-storage persistence substitute.

## 5. Phase A — Freeze and migration/RLS review

No database mutation is permitted in this phase.

1. Record the worktree state and protect all unrelated changes, especially `apps/nursery/public/forge-nav.json`.
2. Review `supabase/migrations/20260816190000_tongs_hammer_editorial_authority_revision.sql` against the live schema using metadata-only queries.
3. Confirm the migration is additive and idempotent under the repository migration conventions.
4. Review column types, nullability, defaults, constraints, and comments for the three pointer fields.
5. Review the pointer RPC for:
   - schema-qualified object references;
   - an explicit safe `search_path`;
   - intended invoker/definer semantics;
   - authenticated role enforcement;
   - `has_workspace_role` or the canonical equivalent editor authorization;
   - workspace/workpiece/recording/revision ownership joins;
   - active-revision enforcement;
   - prior-pointer and row-version compare-and-swap predicates;
   - exact canonical path validation;
   - nonnegative authority revision validation;
   - an unambiguous one-row result.
6. Review grants and revokes so anonymous and ordinary table writers cannot bypass the narrow RPC. Verify the application role has only the intended execution and read access.
7. Review RLS policies on `recording_revisions` and `workpiece_files` for:
   - an editor in the owning workspace;
   - a viewer/non-editor;
   - an authenticated user from another workspace;
   - anonymous access;
   - service-role behavior used only by controlled tests/deployment tooling.
8. Verify generated database types and frontend revision types match the migration contract.
9. Produce a migration review record containing the SQL diff, live-schema observations, policy/grant matrix, reviewer, and rollback posture.

Migration review fails if the RPC permits broad updates, the path or identity is caller-controlled without validation, the prior tuple is not checked, or the RLS/grant behavior cannot be demonstrated.

## 6. Phase B — Hammer runtime writer wiring

Add a Hammer-specific adapter around the existing `commitHammerEditorialAuthorityTwoPhase` coordinator. Do not duplicate transaction ordering inside the UI.

The adapter must:

1. Capture a single immutable authority snapshot only after the canonical editorial graph is internally consistent.
2. Bind the artifact to the authenticated workspace, workpiece, canonical recording, and currently active revision.
3. Canonically serialize the envelope and compute its SHA-256 fingerprint.
4. Read the current artifact metadata and revision pointer tuple before writing.
5. Invoke the canonical Tongs artifact/file API with expected-prior metadata.
6. Invoke only the narrow authority-acknowledgement endpoint/RPC to commit the pointer.
7. Reread both artifact metadata/bytes and the revision pointer after success.
8. Treat timeout or ambiguous responses as unknown outcomes and resolve them by readback, never by an unconditional retry.
9. Use coordinator compensation only when its compare-and-swap preconditions prove that the process is reverting its own artifact write. A compensation conflict is surfaced for manual recovery.
10. Deduplicate unchanged snapshots by fingerprint and prevent save/reopen loops.
11. Refuse writes when the active revision, row concurrency token, prior pointer tuple, or authority revision has changed.
12. Return structured integrity/conflict errors suitable for Hammer's existing recovery UI without silently switching persistence sources.

The writer trigger must be documented explicitly. It should run only at the existing canonical persistence boundary for an authenticated editor, after related authority state is stable. Opening, hydrating, inspecting, previewing, and running the Florida dry run must never trigger the writer.

The reader changes remain part of the eventual reviewed change set, but are not committed as part of this planning task.

## 7. Phase C — Automated proof

### 7.1 Unit and contract tests

Test the runtime adapter and coordinator boundary for:

- deterministic serialization and fingerprinting;
- exact revision-scoped path construction;
- authenticated request shape and response validation;
- happy-path artifact write, pointer acknowledgement, and readback;
- identical-fingerprint idempotency;
- artifact-write failure before pointer commit;
- pointer conflict after artifact write and safe compensation;
- ambiguous artifact response resolved by readback;
- ambiguous pointer response resolved by readback;
- compensation conflict without destructive cleanup;
- stale revision `updated_at`;
- stale prior pointer path, fingerprint, or authority revision;
- revision superseded between reads;
- malformed RPC/file responses;
- missing migration columns or RPC surfaced as deployment/configuration errors.

Retain the reader integration coverage for missing, malformed, fingerprint-mismatched, stale-revision, and read-failure artifacts, including the prohibition on legacy fallback when a pointer is present.

### 7.2 Isolated database/storage fixture

Use disposable identities that cannot equal any Florida identity. The fixture must create an isolated workspace, editor and viewer principals, workpiece, canonical recording, active revision, and controlled artifact storage entry.

Prove this sequence end to end:

```text
artifact bytes written
  -> canonical file metadata/hash persisted
  -> active-revision pointer committed by CAS
  -> artifact and pointer reread
  -> Hammer hydration selects revision authority
  -> canonical reopen succeeds
```

The fixture matrix must include:

- editor allowed; viewer, anonymous, and cross-workspace user denied;
- wrong workspace/workpiece/recording/revision relationship denied;
- inactive or superseded revision denied;
- wrong path, wrapper identity, or fingerprint denied;
- concurrent pointer update loses cleanly;
- file success/RPC failure compensation behavior;
- pointer-present missing/read-failed/corrupt artifact fails closed;
- pointer-absent legacy compatibility remains defined;
- reopening retains transcript, timeline, placements, history payload, and all authority identities.

Tests must assert that no mutation request contains the Florida workspace, workpiece, recording, or revision IDs.

### 7.3 Repository verification

Run the repository-approved equivalents of:

```powershell
pnpm --dir packages/tongs test:editorial-authority
pnpm --dir apps/hammer typecheck
pnpm --dir apps/hammer architecture:ratchet
pnpm --dir apps/hammer exec node scripts/run-all-tests.mjs
pnpm --dir apps/hammer build
pnpm lint
```

Record exact commands, commit/worktree identity, and results. For known ratchet or lint findings, reproduce the identical command at the agreed clean baseline and document the comparison. Do not expand this rollout to unrelated code unless the finding is introduced by the rollout.

## 8. Phase D — Migration deployment gate

Migration deployment requires explicit approval separate from this plan.

Before approval:

- migration/RLS review is signed off;
- isolated tests and all proportional repository checks pass;
- a staging or disposable-project deployment proves migration and RLS behavior;
- the Hammer writer remains disabled or unreleased against production;
- the deployment and non-destructive rollback procedures are recorded;
- production backup/recovery posture is confirmed.

After approval, deploy through the repository's reviewed Supabase migration process. Do not manually edit production schema objects.

Immediately after deployment, perform metadata-only verification:

- the remote migration ledger includes `20260816190000` exactly once;
- all three revision columns exist with reviewed definitions;
- the RPC definition, owner, security mode, `search_path`, grants, and revokes match review;
- RLS is enabled and policies match the expected matrix;
- a read-only application query returns the three fields;
- Florida's pointer remains unchanged and no authority artifact has been created.

If any check fails, disable the writer and stop. Do not drop columns or policies during incident response. Correct forward with a reviewed migration unless a separately approved rollback is safer.

## 9. Phase E — Authenticated, mutation-free Florida dry run

This phase occurs only after the reviewed schema is live and still performs no writes.

Use an authenticated editor session, but restrict the operation to GET/select/storage-read calls whose server behavior is known not to create sessions, revisions, files, or audit mutations. Do not use an “open” endpoint if it can lazily create state.

1. Reread Florida's workspace, workpiece, canonical recording, active revision, revision `updated_at`, and current authority pointer tuple.
2. Verify the active revision is unique and belongs to the expected recording/workpiece/workspace.
3. Read the canonical inputs needed to construct authority: transcript, timeline, placements, current history identity, and existing compatible authority material.
4. Inventory the exact pre-run file and pointer state and confirm whether the proposed path already exists.
5. Construct the exact proposed identity-bound artifact bytes locally/in memory using production serialization code.
6. Compute the proposed SHA-256 and authority revision.
7. Parse the bytes again and verify schema version, all four identities, authority invariants, path, and fingerprint.
8. Run construction twice from the same input and require byte-for-byte and hash equality.
9. Exercise the coordinator with a no-write adapter or validation mode that records intended calls but cannot reach mutation endpoints.
10. Reread the live pointer and file inventory after the dry run and prove they are unchanged.

The dry-run report must contain:

- observation timestamp and repaired bundle/build identity;
- authenticated principal role, with no token or secret;
- all four live identities and revision concurrency token;
- expected prior pointer tuple;
- proposed artifact path, byte length, SHA-256, schema version, and authority revision;
- transcript/timeline/placement/history identity and count summaries used for later comparison;
- validation results and a before/after no-mutation proof;
- the exact proposed pointer-CAS request with credentials removed.

Any identity, revision token, input, or preexisting pointer change invalidates the report and requires a new dry run.

## 10. Checkpoint for separately approved Florida write

No Florida mutation is authorized by migration approval, code approval, deployment approval, or dry-run approval.

The write authorization must explicitly name:

- workspace ID;
- workpiece ID;
- canonical recording ID;
- active revision ID and expected row concurrency token;
- expected prior pointer tuple;
- proposed artifact path, byte length, SHA-256, schema version, and authority revision;
- permission to perform both the artifact write and the pointer compare-and-swap;
- approved compensation behavior if the pointer commit fails.

Authorization is single-use. It expires if any named value changes or if the proposed bytes change.

## 11. Phase F — Authorized Florida write and readback

Only after the exact authorization above:

1. Reread the named identities, revision token, prior pointer tuple, and artifact metadata.
2. Compare them byte-for-byte/value-for-value with the approved package. Stop on any difference.
3. Submit the approved artifact bytes through the two-phase coordinator.
4. Commit the pointer through the narrow compare-and-swap endpoint.
5. Reread the stored bytes, canonical file hash, and revision pointer.
6. Verify the bytes hash to the approved SHA-256 and all pointer/artifact identities match.
7. Produce an execution receipt containing request IDs, timestamps, before/after pointer tuples, file metadata, and readback results, without secrets.

Do not write transcript, timeline, placements, history, or legacy authority. Do not retry an ambiguous outcome until readback identifies its state. Do not delete or overwrite a foreign artifact during compensation.

## 12. Phase G — Florida canonical reopen acceptance

Using the repaired production-equivalent bundle and authenticated session, reopen Florida without clicking **Reload latest**, **Fix available issues**, or making an edit.

Acceptance requires:

- the revision-owned artifact is selected as `persistenceSource`;
- the transitional-recovery banner is absent;
- authority path, fingerprint, authority revision, workspace, workpiece, recording, and revision identities match the write receipt;
- transcript content/count identity matches the dry-run baseline;
- timeline/cut identity and duration match the dry-run baseline;
- placements and placement counts/identities match the dry-run baseline;
- history payload and current-head identity are reported without being modified;
- saving remains disabled if any independent integrity fault remains.

If `history_current_head_mismatch` remains after canonical authority installation, capture the evidence and open a separate, read-only history diagnosis. Do not fix it inside this rollout and do not use it to reinterpret an authority failure.

## 13. Operational rollback posture

- Before pointer commit, an artifact write is not canonical authority. Retain or compensate it only under the coordinator's exact compare-and-swap rules and the approved write package.
- After a verified pointer commit, do not clear or rewrite the pointer ad hoc. A rollback is another persistence mutation requiring a reviewed procedure and explicit authorization.
- Disable the runtime writer first if production behavior is unsafe; the reader remains compatible with pointer-absent revisions and fail-closed for pointer-present corruption.
- Do not destructively remove the additive columns, RPC, policies, or stored artifact during incident response.
- Preserve all execution receipts and observed hashes for forensic comparison.

## 14. Exact rollout checkpoints

| Checkpoint | Required evidence | Pass condition | Authorization boundary |
|---|---|---|---|
| CP-0 — Worktree freeze | `git status`, protected-file list | Reader changes remain uncommitted; `forge-nav.json` is untouched | None |
| CP-1 — Migration/RLS review | SQL review record and role matrix | Columns, RPC CAS, RLS, grants, path and identity checks approved | Review only |
| CP-2 — Writer design review | Adapter call flow, trigger definition, error/compensation contract | No UI-side duplicate transaction; reads cannot write | Review only |
| CP-3 — Isolated proof | Unit, RLS, concurrency, compensation, and reopen results | Full artifact -> pointer -> readback -> canonical reopen passes; no Florida IDs mutated | Fixture writes only |
| CP-4 — Build quality | Exact test/type/lint/build commands and baseline comparisons | No rollout-introduced failures | None |
| CP-5 — Staging deployment | Staging migration/RLS evidence | Schema and policy behavior match review | Staging approval |
| CP-6 — Production migration approval | Signed migration package and recovery procedure | Explicit approval received | Production schema change only |
| CP-7 — Production schema verification | Migration ledger, metadata, RPC/RLS/grant readback | Reviewed schema is live; writer disabled; Florida unchanged | Read-only |
| CP-8 — Florida dry run | Authenticated no-write report and before/after proof | Deterministic artifact/package valid; zero live mutations | Read-only |
| CP-9 — Florida write approval | Single-use package naming identities, CAS tuple, path, bytes/hash, compensation | Explicit approval matches current dry-run package | Exactly one artifact + pointer transaction |
| CP-10 — Florida write/readback | Coordinator receipt and storage/row reread | Approved bytes and pointer are durably identical | Approved mutation only |
| CP-11 — Canonical reopen | UI/runtime evidence and dry-run comparisons | Canonical reopen; no transitional banner; content and identities retained | Read-only |
| CP-12 — History handoff | Separate issue/evidence if mismatch remains | Authority rollout closed before history work begins | No history mutation |

No checkpoint may be inferred from a later one. In particular, CP-6 does not authorize CP-9, and CP-8 does not authorize CP-10.

## 15. Required rollout artifacts

- Migration/RLS review record.
- Hammer runtime adapter design and implementation review.
- Isolated fixture test report.
- Repository verification report with baseline comparisons.
- Staging migration verification.
- Production migration authorization and post-deploy metadata report.
- Authenticated mutation-free Florida dry-run package.
- Separate single-use Florida write authorization.
- Florida write/readback receipt.
- Canonical reopen acceptance report.
- Separate history diagnosis ticket only if the mismatch remains.
