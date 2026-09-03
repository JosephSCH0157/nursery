# Reference Material Workflow Certification

Status: **release-certified for the feature-flagged single-proposal rollout** after migration-backed repair smoke.

## Database evidence

- Migration `20260903120000_tongs_reference_review_operation_attempts.sql` is applied to the local stack and the linked hosted development project.
- The table binds `(workpiece_id, workspace_id)` to the canonical episode identity and stores orchestration attempts only.
- A rolled-back live PostgreSQL test proves editor creation, viewer read-only access, outsider isolation, service-only completion, idempotent replay, operation-ID conflict rejection, and terminal immutability.
- Local and hosted schema linting found no issue in the new table or functions. Existing findings elsewhere remain release-gate debt.

## Broader-suite comparison

Detached clean HEAD `d727b43e` reproduced both reported failures:

- Hearth persistence acknowledgement: 3 passed, 3 failed with the same `canonical_target_unavailable` mismatches.
- Hammer atomic HTTP: 5 passed, 1 failed on the same protected-history-path source regex.

These failures predate the Reference Material change. The clean comparison checkout was not used to alter the primary worktree.

## Deterministic acceptance fixture

The sanitized fixture covers a Reference Clip, facts-only Reference Visual, rights-sensitive Reference Visual, ordered multi-source proposal, skipped proposal, failed attempt, and linked retry. Its numbers are planning targets, not a substitute for observed live metrics.

| Metric                     | Prior planning baseline |                                    Target |
| -------------------------- | ----------------------: | ----------------------------------------: |
| Creator actions            |                      23 | One decision for an already-good proposal |
| Source-add actions         |                       5 |                                         1 |
| Exposed technical controls |                      14 |                                         0 |
| Hard refreshes             |                       1 |                                         0 |

## Live journey gate

The sanctioned Playwright login was refreshed and verified on 2026-09-03. A real approved mixed-media development workpiece with prepared Clip and Visual candidates was exercised through the creator UI. A temporary membership used while screening an unsuitable zero-word fixture was removed; the final target used an existing membership.

## Initial live findings

| Acceptance                                | Result                                                                                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One-click approval                        | **Failed.** One click persisted the native decision, but exact Hammer presence verification failed after 32.2 seconds; the card remained `Needs your decision`.                                                |
| One-action source intake                  | **Partially verified.** `Use this source` is one button and explicitly discloses possible credit use; a new external source was not submitted during this pass.                                                |
| Edit/Replace do not approve               | **Failed contract completeness.** Edit exposes details but has no Save action. Replace correctly offers `Use this source`, but incorrectly also contains the Skip form/action.                                 |
| Approved/Skipped Ready rules              | **Mixed.** Approve failed Hammer presence. Skip reached `Ready` through Hammer absence in 30.9 seconds.                                                                                                        |
| Per-card isolation                        | **Passed.** Both the failed approval and successful skip left every unrelated card state unchanged.                                                                                                            |
| Linked retry                              | **Failed UI durability.** The failed attempt is terminal in the ledger, but Retry is local component state and disappears when the page closes/reloads; no linked retry could be initiated in a fresh session. |
| Regeneration identity/anchor preservation | **Not exercised** because Edit has no save/regeneration path in the queue.                                                                                                                                     |
| No refresh/technical controls             | **Passed.** Nine cards rendered with zero Fetch/Analyze/Generate/Verify/Commit/Refresh controls, zero legacy family tabs, and no default revision language.                                                    |
| Diagnostics mutation path                 | **Passed on the creator surface.** The legacy Clip/Visual mutation panels were absent from the rendered queue.                                                                                                 |

Initial inventory: 9 current proposal cards, all `Needs your decision`; 4 creator decisions per card; no initial errors. Observed creator actions: Approve 1 click; Skip 2 clicks (decision plus optional-reason confirmation); hard refreshes 0.

## Repair certification

The same authenticated mixed-media workpiece was rerun after each repair. Exact attempt evidence remains in `tongs.reference_review_operation_attempts`.

| Repair gate           | Certified result                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable Retry         | **Passed.** A failed attempt was recovered after a page reload. Retry created a new attempt linked through `parent_attempt_id`, retained the old terminal failure, and used the card's current canonical identities. The linked chain ultimately completed successfully.                                                                                                                                                        |
| Approve → Hammer      | **Passed.** The verifier now reads the Tongs `{ ok, data }` envelope, and Hammer composition preserves the complete ordered multi-source visual while deriving legacy primary-source fields. Linked attempt `44f7b5de-c179-4afa-ae16-4d6c5955c112` finished `succeeded` with the exact candidate identity and `hammer_verified: true`; the card reached `Ready`. Exact verification was not weakened.                           |
| Edit Save             | **Passed.** The Edit drawer now has controlled editorial fields and an explicit `Save edits` command. Three live saves appended distinct immutable recipe revisions; the final attempt completed in 1.438 seconds, canonical readback contained the edited headline, and the card returned to `Needs your decision`. The drawer closes only after verified success, so a failed save retains the open drawer and entered draft. |
| Replace/Skip boundary | **Passed.** Replace contains material/source replacement controls only. Skip has its own drawer branch and canonical disposition command. Neither path can invoke the other.                                                                                                                                                                                                                                                    |

## Final acceptance result

1. An already-good proposal is approved with one creator decision.
2. `Use this source` remains one explicit action with paid-AI disclosure and deterministic fallback language.
3. Edit and Replace return to `Needs your decision`; neither silently approves.
4. Approved and skipped proposals reach `Ready` only through exact Hammer presence/absence verification.
5. Card-local failure isolation remains intact.
6. Retry is durable, linked, and derived from current canonical readback.
7. Immutable revision and exact-anchor identities remain canonical through the workflow.
8. No hard refresh or technical lifecycle command is exposed.
9. Legacy diagnostics do not provide a second creator mutation path.

The broad-suite failures documented above remain pre-existing repository debt and are not hidden by this certification. Focused Reference Review tests, Hearth type checking, Tongs type checking, orchestration-ledger tests, live RLS checks, and the authenticated repair smoke all pass.
