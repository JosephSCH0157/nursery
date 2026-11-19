# PR #92 — November 19 execution checklist

Status: **NO-GO for hosted release until every gate below is satisfied.**
This checklist does not authorize a freeze, migration, activation, merge or deploy.
Work from `D:\nursery\nursery` on the existing PR branch. Do not create a branch
or restore/acquire private data without separate approval.

## Prepared tonight

- Local `224cb82d` and `2e277544` are ancestors of this candidate; migration and
  frozen baseline bytes are unchanged. 445 SHA-256:
  `ca369b18b67f6aaa555f17e90dd58a66cee9b2a512b38c2569717c3f0e3bb4fc`;
  446: `beb2d1dfe797666e8b11c7e62f89ce76450a87520b662100c12b7afb604291f0`.
- Checkout validates mode, catalog product and active monthly licensed Storage
  price before customer/billing mutations. Existing canonical Test/Live paths,
  subscription refresh fences and paid-invoice authority remain intact.
- `FORGE_STORAGE_RELEASE_MODE=paused` returns retryable 503 at Tongs, Checkout
  and signed webhook admission; invalid/empty values also close admission.
  `open` explicitly resumes; unset preserves the existing default. Webhooks
  verify signatures first and never acknowledge or fulfill paused deliveries.
  The local job runner stops new polls; existing `dispose()` waits for an
  admitted tick. Configuration must reach every process; changing a parent
  shell or dashboard value does not establish that old processes have drained.
- 445/446 wrappers are prepared with immutable target/payload commitments,
  exact-prefix staging, cumulative contracts, predecessor receipts, financial
  continuity and durable interruption records. **Apply is hard-disabled** in
  both wrapper and policy pending reviewed certification closeout.
- Focused application tests: 69 billing/Checkout/webhook, 1 Tongs admission,
  7 runner/connection, 6 manifest recovery tests passed (including 100 concurrent
  save rounds). Offline contracts: 70 passed, one Windows symlink privilege skip;
  new executor rehearsal: 9 passed. Fixtures are not historical evidence.
  Nursery typecheck/lint and frozen artifact/entrypoint checks passed;
  CI must pass on the published SHA.
- At 20:17 EST Nov 18: H444 exact prefix, stage 4 contract valid, Test mode,
  owner capacity 0 against 3,543,796,367 bytes; 475 unattributed objects remain.
  No entitlement was activated. Current Test 50 GiB recurring price is
  `price_1THQiC1OSG3CCNl8KMwHQFQU` in `acct_1Spw8c1OSG3CCNl8` (USD 5/month).
- Netlify's authenticated Developer settings showed production branch `main`,
  branch deploys limited to production, and “Don't deploy pull requests”. PR
  publication can run CI without deploying. Settings were not changed.

## Morning sequence — stop at the first unmet mandatory gate

1. **Revalidate identity and backup, read-only.** Record `git rev-parse HEAD`,
   `git ls-remote origin refs/heads/main refs/heads/codex/legacy-storage-billing-exclusion-20261118`
   and PR #92 checks for that exact SHA. In Supabase Dashboard → Database →
   Backups, confirm a **completed November 19** physical backup for
   `wtvdjndyxegudufrompx`, with ID/time and accepted recovery gap. Run:
   ```powershell
   ./scripts/inspect-storage-release-state.ps1 -Lineage historical -WorkspaceId ba4054da-743c-493f-a0ac-d8db0e5a6ebf
   ```
   Stop for head/history/contract/mode drift. Backup completion alone is no GO.
2. **Close certification and recovery gates.** Require an approved restored
   authentic H444 schema, lineage marker, complete six-column history and
   operational financial state, source/provenance/retention approval; identical
   445/446 upgrade, preserved history/financial fingerprints, Storage HTTP/RLS/
   accounting/concurrency/application checks and final H/B1 catalog comparison.
   Resolve the separately recorded inactive fresh-B1 initialization contract.
   [Full requirements](../database/STORAGE_FULL_TAIL_CERTIFICATION.md).
   Supabase's existing backup/Restore to New Project facility is a possible
   simpler source, **not an approved or rehearsed substitute**: it creates a
   billable private-data copy; outbound jobs need isolation; Storage bytes and
   function configuration are not restored. No new worker or acquisition tonight.
3. **Approve the exact candidate and complete cutover controls.** Require owner
   approval of the SHA, hashes, each stage, exact historical exclusion set and
   recovery scope. Require a verified fence/drain covering direct Storage and
   resumable uploads, stale browser sessions, other APIs, workers, CLI/service-role
   writers, provider callbacks and already admitted operations. The new app flag
   alone is insufficient. Record operation/object/provider IDs and reconcile
   incomplete work before migration; absence of cron is not proof of no writers.
4. **Only after 1–3 pass:** use the supported fixed wrappers, with fresh v2
   recovery evidence and original predecessor receipt commitments:
   ```powershell
   ./scripts/invoke-storage-billing-445-hosted-deployment.ps1 -Action Preflight -Operator $operator -RecoveryEvidencePath $recovery445 -PredecessorAuthorizationSha256 $verified444
   ./scripts/invoke-storage-billing-446-hosted-deployment.ps1 -Action Preflight -Operator $operator -RecoveryEvidencePath $recovery446 -PredecessorAuthorizationSha256 $verified445
   ```
   These are sequential: 446 requires completed 445 PostVerify. Do not attempt
   Apply while the checked-in hold exists. Closing it requires a reviewed change
   and certification, not a bypass flag or editing the script during release.
   Deploy the compatible application through [AGENTS.md's Git-main policy](../../AGENTS.md#production-deployment-policy-canonical),
   plus the separately coordinated `create-checkout-session` and `stripe-webhook`
   Edge Functions. Old main cannot write against 446; all writers remain fenced
   across the incompatible interval. Verify exact deployed artifacts before resume.
5. **Controlled Test acceptance, then resume.** Keep general writers fenced.
   Allow only the approved authenticated verification lane; complete the genuine
   Test Checkout for the price above through the existing app. Require signed
   webhook, matching subscription/invoice/service period, successful fenced
   refresh, paid receipts and positive canonical capacity. Verify the separately
   approved exact 475-object accounting operation, CAS/registry/hash consistency,
   save/reopen and access denial. Reconcile queued deliveries/uploads, reload
   stale clients, then explicitly reopen the approved writer set. No manual
   grants, fake receipts, blanket exclusions or Live Checkout.

**Recovery:** on timeout/lost response, keep the fence and inspect; never replay
Apply. After a real attempt, use the same stage wrapper with `-Action PostVerify
-Operator $operator -AuthorizationSha256 $originalAttemptCommitment` against its
durable attempt record. Partial 445 success stays recorded; forward repair needs
review. App failure after 446 requires a compatible Git release while paused.
An approved database restore does not undo Storage objects, Stripe activity or
deployed code: reconcile their versions/events/receipts before reopening. If
bytes, event history, isolation or compatibility cannot be established, stay closed.

**Exact remaining blocker:** no owner-approved, restored authentic H444 evidence
and completed H-through-446/H-B1 certification exist. A fresh provider backup can
only become evidence through an approved isolated restoration and the checks
above. Global writer fencing and whole-state recovery also require demonstrated
acceptance. Independent safe work remains PR review, CI and read-only backup/state
verification; none authorizes production mutation.
