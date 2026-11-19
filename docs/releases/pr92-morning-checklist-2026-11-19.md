# PR #92 — November 19 after-work execution checklist

Status: **NO-GO for hosted release until every gate below is satisfied.**
This checklist does not authorize a freeze, migration, activation, merge or deploy.
Work from `D:\nursery\nursery` on the existing PR branch. Do not create a branch
or restore/acquire private data without separate approval.

## Prepared and verified November 18

- Code candidate `801f26c948f8139a3d5d7a3a8c6a33b28dde7521`: **15 CI checks
  passed**, Supabase Preview skipped. [PR smoke](https://github.com/JosephSCH0157/nursery/actions/runs/44438041129)
  and [frozen artifacts](https://github.com/JosephSCH0157/nursery/actions/runs/44438041152).
  This checklist-only follow-up does not change executable code; verify its
  exact published SHA and checks at decision time.

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
- At 20:49 EST Nov 18: H444 exact prefix, stage 4 contract valid, Test mode,
  owner capacity 0 against 3,543,796,367 bytes; 475 unattributed objects remain.
  No entitlement was activated. Current Test 50 GiB recurring price is
  `price_1THQiC1OSG3CCNl8KMwHQFQU` in `acct_1Spw8c1OSG3CCNl8` (USD 5/month).
- Netlify's authenticated Developer settings showed production branch `main`,
  branch deploys limited to production, and “Don't deploy pull requests”. PR
  publication can run CI without deploying. Settings were not changed.

## Existing backup route: conditional, not certified

Read-only Dashboard and Management API observation at **20:49 EST November 18**:
project `wtvdjndyxegudufrompx`, Black Anvil Studios **Pro**, authenticated **Owner**;
seven completed daily physical backups (November 12–18), PITR disabled.
Latest backup **2302135624**, `COMPLETED`, **2026-11-18T06:31:06.320Z**
(01:31:06 EST). GET `/v1/projects/wtvdjndyxegudufrompx/database/backups`
returned HTTP 200; response SHA-256
`b72d507fb33f512829cd90d8245266ae3b8816670c5cd726f8cc6fd9ec5b7eda`.
The Restore to a New Project tab lists these backups; no Restore was initiated.
November 19 completion is **unverified**. Recent backups ran around 01:30 EST,
after tonight's 01:00 hard stop; that is an observation, not a scheduling promise.

| Question | Supported capability and remaining condition |
| --- | --- |
| Authentic predecessor without Google Cloud? | Supabase's [Restore to a New Project](https://supabase.com/docs/guides/platform/clone-project) supports an independent database copy from physical backups. Eligibility is present. Actual restored H444 contents remain unverified. |
| Preserved evidence? | Binary restore carries schema, data, roles/permissions, Auth data and encryption root key. Inclusion of Forge lineage/history/financial tables follows from whole-database scope; exact ownership, marker, six-column history and financial fingerprints still require restored-database verification. |
| Safe isolation? | External extension jobs can run immediately; the provider offers no pre-restore pause/exclusion. Approve demonstrable isolation before startup, or establish that the chosen backup has no external execution capability. Copied Vault credentials remain readable. No `pg_cron` was observed, but `wrappers` exists: neither fact proves isolation. Ingress restrictions alone are insufficient. |
| Access, cost, limits? | Use the Dashboard procedure above only after separate approval. Paid plan/physical backup eligibility is met. The new project mirrors compute/disk in the same region and is billable; review the provider quote, budget and cleanup deadline first. Exact quote unverified; no purchase dialog opened. This beta route cannot clone a clone. |
| Whole-state recovery? | Storage bytes/settings, Edge Functions and Auth/API configuration need separate handling; database restoration cannot reverse Stripe actions. |

Pro retains seven daily backups; physical backups are not directly downloadable
through the ordinary backup-download path ([backup documentation](https://supabase.com/docs/guides/platform/backups)).
[Compute billing](https://supabase.com/docs/guides/platform/manage-your-usage/compute)
is hourly, rounded up, and outside the spend cap. This avoids a GCP worker but
is **not a verified zero-cost or fully isolated certification route**.

The existing `certify-storage-full-tail.ps1 -Lineage historical` is a synthetic
boundary probe, not an adapter for a restored H444 project. A reviewed handoff
from the provider restore into the mandatory checks remains necessary; do not
claim that rerunning that command certifies the backup. No replacement framework
or private-data acquisition was started.

## After work Thursday November 19 — stop dependent work at an unmet gate

1. **Confirm backup, read-only.** In Supabase Dashboard → Database →
   Backups, confirm a **completed November 19** physical backup for
   `wtvdjndyxegudufrompx`, with ID/time, retained availability and accepted
   recovery gap. Establish separate Storage-byte retention and Stripe event
   recovery. Stop if incomplete or recovery scope is unaccepted.
2. **Revalidate actual deployed identities, read-only.** Run:
   ```powershell
   ./scripts/inspect-storage-release-state.ps1 -Lineage historical -WorkspaceId ba4054da-743c-493f-a0ac-d8db0e5a6ebf
   ```
   Compare Netlify's published deploy and Supabase Edge Function metadata with
   the last observation: production/main `891cf6e65d267fd7745db79659b6aa5b900e8309`,
   ready Netlify deploy `6afda8b712363dd68fa9e528`; Checkout v33 bundle
   `4c3cbf3515c47483147b1b06870657274f5523725a6ae17021aba26596f92238`,
   webhook v36 bundle
   `efaf93cef7bf2bcea99a712cf064adc64346fa48ca8ed39bbdf0b7cc74ec33b1`.
   Database head `20261111201029` (444 rows), full-history fingerprint
   `611a9e78fe2b4cab3f4903f6e6c44f0caef91fd5d9f32559b3e6c3da0dbcb27f`.
   Stop and reconcile any head/history/contract/mode/artifact drift.
3. **Close historical certification.** Require an approved restored
   authentic H444 schema, lineage marker, complete six-column history and
   operational financial state, source/provenance/retention approval; identical
   445/446 upgrade, preserved history/financial fingerprints, Storage HTTP/RLS/
   accounting/concurrency/application checks and final H/B1 catalog comparison.
   Resolve the separately recorded inactive fresh-B1 initialization contract.
   [Full requirements](../database/STORAGE_FULL_TAIL_CERTIFICATION.md).
   The provider route above needs separate isolation, private-data, cost and
   procedure approval. A formally approved replacement procedure must explicitly
   cover the mandatory contract; a backup is not an implicit waiver.
4. **Demonstrate global fence, drain and recovery readiness.** Require a verified
   fence/drain covering direct Storage and resumable uploads, stale browser
   sessions, other APIs, workers, CLI/service-role writers, provider callbacks
   and already admitted operations. Specific bypasses: `brand-library.ts`
   uploads, `bellowsRecordOnlyCapture.ts` uploads/parts and admitted job-runner
   uploads bypass Tongs HTTP admission. The runner's `dispose()` waits but
   suppresses tick rejection; drain completion is not proof of settlement.
   Record operation/object/provider IDs; reconcile failed, incomplete or unknown
   work before migration. No global fence is demonstrated by the new app flag.
   Rehearse the recovery actions below before authorizing an actual pause.
5. **Confirm candidate, CI and explicit GO.** Record `git rev-parse HEAD` and
   `git ls-remote origin refs/heads/main refs/heads/codex/legacy-storage-billing-exclusion-20261118`;
   verify `git merge-base --is-ancestor 224cb82d HEAD` and the same for `2e277544`,
   unchanged migration hashes, reviewed scope and all required CI on the exact
   published SHA. Fetch/reconcile changed main through the established workflow.
   Require owner
   approval of the SHA, hashes, each stage, exact historical exclusion set and
   recovery scope. **GO requires all preceding gates; otherwise NO-GO for the
   dependent operation.** Safe independent work remains review, CI and read-only
   state/backup verification. A release cannot proceed with the Apply hold.
6. **Only after 1–5 pass and release is separately authorized:** establish and
   verify the approved fence/drain, then use the supported fixed wrappers
   ([database runbook](../database/DATABASE_OPERATIONS.md)), with fresh v2
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
7. **Controlled Test acceptance.** Keep general writers fenced.
   Allow only the approved authenticated verification lane; complete the genuine
   Test Checkout for the price above through the existing app. Require signed
   webhook, matching subscription/invoice/service period, successful fenced
   refresh, paid receipts and positive canonical capacity. Verify the separately
   approved exact 475-object accounting operation, CAS/registry/hash consistency,
   save/reopen and access denial. No manual grants, fake receipts, blanket
   exclusions or Live Checkout.
8. **Resume explicitly only after postflight passes.** Reconcile queued
   deliveries/uploads and every ambiguous operation, reload stale clients,
   verify compatible deployed artifacts, then reopen the approved writer set
   and monitor capacity/accounting/errors. Failed acceptance keeps the fence.

**Recovery:** on timeout/lost response, keep the fence and inspect; never replay
Apply. After a real attempt, use the same stage wrapper with `-Action PostVerify
-Operator $operator -AuthorizationSha256 $originalAttemptCommitment` against its
durable attempt record. Partial 445 success stays recorded; forward repair needs
review. App failure after 446 requires a compatible Git release while paused.
An approved database restore does not undo Storage objects, Stripe activity or
deployed code: reconcile their versions/events/receipts before reopening. If
bytes, event history, isolation or compatibility cannot be established, stay closed.
Before any production attempt, an unmet gate means no production mutation.
After a pause but before a migration, resume only after proving the original
app/database pair and external state are consistent. After any attempted stage,
retain the fence until PostVerify and reviewed recovery resolve the outcome.

**Exact remaining blocker:** no owner-approved, restored authentic H444 evidence
and completed H-through-446/H-B1 certification exist. A fresh provider backup can
only become evidence through an approved isolated restoration and the checks
above. Global writer fencing and whole-state recovery also require demonstrated
acceptance. Independent safe work remains PR review, CI and read-only backup/state
verification; none authorizes production mutation.
