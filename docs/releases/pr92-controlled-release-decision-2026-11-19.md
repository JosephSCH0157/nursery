# PR #92 — November 19 controlled-release decision

**Decision as of November 18, 2026, 7:57 PM America/New_York: NO-GO.**
A fresh November 19 backup alone will not make this release executable.
Authentic historical certification, an enforceable write pause, certified
445–446 hosted execution, and recovery across database/Storage/Stripe remain
unproven. Preparation is complete within tonight's scope; production execution
is not authorized by this report.

## A. Ready items and verified environment

| Item | Observation | Readiness |
|---|---|---|
| Production app | Netlify deploy `6afda8b712363dd68fa9e528`, ready and published, commit `891cf6e65d267fd7745db79659b6aa5b900e8309`; matches remote `main` | Verified |
| PR #92 | Open draft, mergeable, remote head `4de38126e51070ea4b5e90b418f1e66e5b7095f0` | Source candidate verified; not authorized for merge |
| CI at that head | 15 successful execution checks plus successful Copilot review; Supabase Preview skipped | Passing evidence for that exact remote head |
| Local tooling | `224cb82d54436a7b79da28a8f9e800c6c8ea7512` is on the local PR branch, **absent from remote PR #92** | Preserved locally; remote review/CI still needed |
| Hosted database | Project `wtvdjndyxegudufrompx`, ACTIVE_HEALTHY, us-east-1, PostgreSQL 17.6.1.054 | Verified read-only |
| Installed lineage | `historical-v1`, all 444 versions form the exact canonical prefix; head `20261111201029`; only 445 and 446 pending | Verified read-only |
| Installed Storage contract | Cumulative stage 4, expected ownership/ACL/RLS/triggers pass; Test financial mode | Verified read-only |
| Production writer | Published main's Tongs source lacks `read_workpiece_manifest_version` and `forge.manifest-cas.v1`; candidate contains both | Incompatible with 446 until coordinated deployment |
| Deployed webhook | `stripe-webhook` v36, ACTIVE; lacks `begin_subscription_refresh` and `commit_subscription_refresh`; candidate includes them | Requires separate Edge Function deployment |
| Deployed Checkout | `create-checkout-session` v33; its bundled catalog omits the current 50 GiB price; current repository source includes it | Also requires separate coordinated Edge Function deployment |
| Owner workspace | Existing owner membership verified for workspace ending `6ebf`; exact ID retained in private evidence | Identity verified; no fabricated ownership |
| Owner capacity | 0 recognized bytes; 3,543,796,367 retained bytes across 1,922 objects; 475 unattributed objects; 0 unknown-size owned objects | Writes remain blocked |
| Financial receipts | 0 owner paid cycle receipts; 3 canceled subscription projections; no current Test subscriptions returned for the known Stripe customer | Genuine purchase required after release prerequisites |
| Exclusion state | 445/446 absent, 0 quarantine objects | No exclusions or manifest-publication authority activated |

The installed chain consists of H's 414 immutable migrations through
`20261020171522`, followed by the canonical shared tail through 444. The installed
marker's historical manifest hash is
`66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40`.
The complete installed history row fingerprint observed tonight is
`611a9e78fe2b4cab3f4903f6e6c44f0caef91fd5d9f32559b3e6c3da0dbcb27f`.
This verifies history identity now; it is not a restored historical certificate.

| Migration | Exact file | SHA-256 |
|---|---|---|
| 445 | `20261113175455_storage_historical_accounting.sql` | `ca369b18b67f6aaa555f17e90dd58a66cee9b2a512b38c2569717c3f0e3bb4fc` |
| 446 | `20261113214832_workpiece_manifest_optimistic_concurrency.sql` | `beb2d1dfe797666e8b11c7e62f89ce76450a87520b662100c12b7afb604291f0` |

Application, Edge Function, and migration source bytes are unchanged between
remote `4de38126` and local `224cb82d`. Reuse the PR's passing application evidence
and the previously documented synthetic B1 results with their original scope.
Tonight's focused successor tests passed **11/11**. The earlier local tooling
suite remains **66 passed, 1 explicitly skipped Windows file-symlink assertion**.
No new full database rehearsal or full application suite was claimed.

The new `scripts/inspect-storage-release-state.ps1` selects historical lineage,
validates the linked project and CLI 2.84.2, and runs fixed read-only queries. It
verified the complete prefix, stage-4 cumulative contract, owner capacity and
pending versions. PowerShell syntax validation passed. It does not collect a
database snapshot, impersonate an actor, or authorize a release.

Evidence sources: [PR #92](https://github.com/JosephSCH0157/nursery/pull/92),
[PR Smoke](https://github.com/JosephSCH0157/nursery/actions/runs/44365587844),
[frozen evidence CI](https://github.com/JosephSCH0157/nursery/actions/runs/44365588081),
Netlify/Supabase/Stripe read-only connector responses, and the governed linked
inspection. Compact local observations and the workspace ID are retained under
`.git/forge-private-evidence/pr92-20261119-preparation.json`, excluded from Git.
The existing untracked Hammer release note remains untouched.

## B. Outstanding blockers and backup assessment

1. **Authentic H certification is missing.** No approved, restored H444
   predecessor has been validated and rehearsed through 446. Synthetic B1
   results and the synthetic H boundary probe do not satisfy this. H/B1 parity
   and the separately recorded inactive-B1 initialization limitation remain
   unresolved under the existing release contract. No policy waiver was made.
2. **The 445–446 hosted executor does not exist.** `224cb82d` provides unlinked
   staging and input-only validators. Every Apply request hits a checked-in
   hold. There are no certified 445/446 Invoke/Apply/PostVerify wrappers,
   consumed authorization receipts, or ambiguous-outcome recovery entrypoints.
   The 441–444 wrappers must not be repurposed or their pins relaxed.
3. **No verified comprehensive write pause/drain/resume mechanism was found.**
   Closing the owner's browser or hiding the UI does not cover stale browser
   sessions, queued uploads, direct Storage API/signed requests, service-role
   workers, and Stripe webhooks. No production pause was attempted. The
   inspected database lacks `cron.job` and has `wrappers`; that is not proof of
   no external writers or safe restore isolation.
4. **Coordinated application delivery remains unexecuted.** Tongs, webhook,
   and Checkout are currently older implementations. Netlify deploys do not
   establish Supabase Edge Function delivery. Checkout v33 would reject the
   proposed current price through its static catalog lookup; updating only
   the webhook would leave owner-capacity activation blocked.
5. **Recovery is not end-to-end proven.** Database restoration, Storage bytes,
   external Stripe state, pending deliveries, and the matching app/function
   versions have no rehearsed combined recovery procedure yet.
6. **Release inputs and postflight activation are incomplete.** Local tooling
   must enter the reviewed remote candidate and pass applicable CI. Genuine
   operator observation/approval of the exact historical versions, current
   object-integrity verification, legitimate capacity activation, and hosted
   save/reopen acceptance remain separate gated actions.

The authenticated backup API returned completed physical backup **2302135624**,
timestamp **November 18, 06:31:06 UTC / 1:31:06 AM Orlando**. Observation time was
November 18, 7:52 PM Orlando; PITR was false. November 19's expected 1:31 AM
backup has not been observed and must not be assumed to exist or be complete.
Re-observe immediately before any decision; the tooling requires fresh API
observations within five minutes, separately from the backup's age.

Supabase provides daily-backup restoration through Database → Backups. A
restore replaces database state and causes downtime; post-backup changes are
lost. Storage object bytes are excluded, so deleted or overwritten bytes are
not recovered by restoring their metadata. Custom-role passwords and replication
configuration may require attention. PITR is not enabled here; do not describe
this project as having second-level recovery. [Supabase backup documentation](https://supabase.com/docs/guides/platform/backups).

Supabase's paid-plan **Restore to a New Project** feature can restore a physical
backup without a Google Cloud worker. It copies database/schema/Auth/roles and
the encryption root key, but requires separate Storage, Edge Function, and
project configuration. It creates a billable project. External-operation
extensions can start immediately after binary restore; there is no pre-restore
pause/exclusion for those jobs. Project-specific permission, quoted cost, and
safe outbound isolation have not been verified or approved. [Supabase isolated-restore documentation](https://supabase.com/docs/guides/platform/clone-project).

**Conclusion:** this physical backup is a plausible source for authentic H444
evidence, not an already-certified predecessor. After separately approved
transfer/restore scope and isolation, its restored marker, complete history,
schema/ACL catalog, operational financial rows and fingerprints must be verified
before identical 445/446 bytes are rehearsed. The full Storage tests also need
object-byte coverage, which a database-only restore cannot supply. No restore,
private data acquisition, new project, or certification infrastructure was
created tonight. See
[`STORAGE_FULL_TAIL_CERTIFICATION.md`](../database/STORAGE_FULL_TAIL_CERTIFICATION.md).

## C. Exact execution sequence and checkpoints

**Ready to execute read-only in the morning**, from the sole canonical checkout:

```powershell
Set-Location D:\nursery\nursery
$inspection = Get-Content .git/forge-private-evidence/pr92-20261119-preparation.json -Raw | ConvertFrom-Json
$ownerWorkspaceId = [guid]$inspection.ownerWorkspaceId
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/main refs/heads/codex/legacy-storage-billing-exclusion-20261118
./scripts/inspect-storage-release-state.ps1 -Lineage historical -WorkspaceId $ownerWorkspaceId
. ./scripts/lib/forge-managed-credential.ps1
. ./scripts/lib/forge-node-runtime.ps1
Invoke-WithForgeManagedSupabaseCapacityReadCredential -Operation {
  (Invoke-ForgeNode -RepositoryRoot (Get-Location).Path -Arguments @(
    'scripts/collect-hosted-recovery-readiness-evidence.mjs',
    '--action','Observe','--project-ref','wtvdjndyxegudufrompx'
  )).StandardOutput
}
```

Expected before release: exact H444 prefix, stage 4/contract true, Test mode,
pending `[20261113175455,20261113214832]`, unchanged approved source hashes and
known owner identity. A new completed November 19 backup must be verified by ID,
timestamp and source, not just by expected schedule. Repeat the Netlify
get-project/get-deploy, Supabase list/get-edge-function and GitHub PR/check tools
against the exact identifiers in section A. Any unexpected divergence is NO-GO.

Offline package preparation is available, but packages **must remain unlinked**:

```powershell
$stage445 = node scripts/prepare-storage-successor-hosted-workdir.mjs (Get-Location).Path 20261113175455
node scripts/prepare-storage-successor-hosted-workdir.mjs (Get-Location).Path 20261113175455 $stage445
$stage446 = node scripts/prepare-storage-successor-hosted-workdir.mjs (Get-Location).Path 20261113214832
node scripts/prepare-storage-successor-hosted-workdir.mjs (Get-Location).Path 20261113214832 $stage446
```

Expected: 445/446 exact Git-byte prefixes, exact configuration/template, no
credentials or linked connection, `certification: BLOCKED`. The policy tools
accept supplied JSON only; they are not independent hosted preflight evidence.
Do not pass these packages directly to an unrestricted `supabase db push`.

**Prepared sequence below is blocked until every prerequisite is resolved and
the owner explicitly authorizes the concrete release.** Missing executors are
named as gaps; no invented or bypass command is provided.

| Order | Action/tool and required result | Present status |
|---|---|---|
| 1 | Pin the final reviewed Git candidate including `224cb82d` and this preparation. Recheck remote main and required CI. Obtain the authentic H/B1 closeout and a tested, version-bound executor. Bind approvals to exact migrations, app/function artifacts, recovery scope and window. | Blocked |
| 2 | Enforce and verify write pause at every relevant ingress. Drain in-flight uploads/transactions/jobs; fence stale browser sessions. Preserve pending work. Webhook admission must defer/retry without acknowledging unprocessed events. Record writer inventory and proof of quiescence. | No verified control/commands yet |
| 3 | Re-run lineage/contract/financial fingerprints and backup observation while paused. Reconcile the difference between the recovery point and pause time. Verify a real original 444 predecessor receipt; 445 must reference its original `d3a481ea…` payload, not fabricate a new receipt. | Read-only observations prepared; complete gate blocked |
| 4 | Run certified 445 Preflight → separately authorized Apply → PostVerify; exactly one pending target and count 445 afterward. Repeat for 446 with 445's receipt; final count 446/stage 6. Preserve history and protected financial fingerprints and durable attempt markers. | **No safe executable command currently exists** |
| 5 | Deliver the compatible Tongs app through the canonical Git-backed `main` release; follow the exact resulting Netlify commit to ready/published. Preserve remote changes and branch protections; never force push or use manual production upload. | Awaiting approval and prior gates |
| 6 | Deploy reviewed `stripe-webhook` **and** existing `create-checkout-session` source with their complete shared dependencies and existing correct configuration. Separately verify function version/bundle/source, JWT/signature policy, Stripe account and Test mode. | Separate Supabase Edge Function delivery required; not automatic from Netlify |
| 7 | Re-run the inspector: count 446, stage 6, contract true, unchanged owner membership. Validate ordinary-owner writes still fail without entitlement, unknown-owner denial, and exact-version exclusion behavior; do not infer capacity from operator status. | Awaiting hosted schema/app |
| 8 | Using the real authenticated platform operator, observe the exact approved historical object set with `tongs.observe_storage_historical_accounting(uuid[])`. Compare fresh identities/hashes with the preserved set before explicitly approving `tongs.approve_storage_historical_accounting(uuid,text,text,text)`. No object ownership/access changes; replacements remain billable. | Separate writes/approval required; no service-role impersonation |
| 9 | Allow only the controlled billing/smoke-test lane, keeping general writers paused. Perform genuine owner Checkout and signed webhook processing as below. Require canonical receipts and positive capacity; then verify manifest CAS, registry/hash agreement, conflict behavior, Storage accounting, save/reopen from Supabase and access denial. | Not run |
| 10 | Reconcile queued webhooks and uploads, verify all deployed components remain compatible, invalidate/reload stale clients, and resume writers under the reviewed control. Update actual operational records with dated evidence. | Blocked until all acceptance passes |

Production deployment policy remains [AGENTS.md](../../AGENTS.md#production-deployment-policy-canonical).
There is no safe ordering of old writers and migration 446 without the verified
pause: old writers fail against 446, and the new writer requires 446's RPC.
Do not substitute a database-project pause that must be lifted before migrations
can run while uncontrolled clients immediately reconnect.

**Owner-capacity activation prepared, not executed:** use the existing Forge
Stripe account `acct_1Spw8c1OSG3CCNl8`, **Test mode**, not the separately limited
sandbox account. The active explicit Storage offer
`price_1THQiC1OSG3CCNl8KMwHQFQU` is USD 5/month for 53,687,091,200 bytes (50 GiB),
the smallest current Storage tier and sufficient for the observed usage.
Creator monthly `price_1THQeN1OSG3CCNl8MHVMvIbG` is USD 19/month and supplies
5 GiB once its paid membership receipt is recognized; this is the smaller
capacity but more expensive subscription alternative. Both prices were read
from Stripe Test tonight. Do not use the old one-time 50 GiB alias to establish
recurring capacity.

After the Checkout update, the authenticated existing `create-checkout-session`
request uses `{ "priceId": "price_1THQiC1OSG3CCNl8KMwHQFQU" }` plus configured
success/cancel URLs. The owner must complete genuine Stripe Test Checkout. A
success redirect is not entitlement evidence. Verify the real Test subscription,
paid invoice and billing period, validated webhook signature, event account/mode,
and successful fenced `begin_subscription_refresh`/`commit_subscription_refresh`
processing. Require `billing_subscriptions`, `subscription_cycle_receipts`,
`subscription_service_periods` and refresh receipts to agree. Re-read canonical
owner capacity; the Storage-only choice should contribute 53,687,091,200 bytes.
Capacity does not resolve the separate 475-object accounting hold.

The enabled Test webhook endpoint is `we_1T7NyK1OSG3CCNl8XCyfPu3j`, API version
`2025-12-15.clover`, targeting this project's `/functions/v1/stripe-webhook`.
Its subscriptions include Checkout completion, subscription created/updated/
deleted, invoice paid/failed, refunds and disputes. Signing-secret correctness,
runtime Test credentials, delivery/retry acceptance and live-mode rejection must
be demonstrated during the controlled verification; endpoint configuration alone
does not prove them. Do not use trigger-generated synthetic billing objects,
manual capacity inserts, or fabricated invoice/subscription receipts.

## D. Recovery sequence

| Failure | Required response |
|---|---|
| Any preflight/certification mismatch | Do not pause or mutate production. Record NO-GO and preserve evidence. |
| Migration error, timeout or lost response | Keep writes paused. Inspect installed versions/contract independently; never blindly repeat Apply. The future executor must support PostVerify against the original durable attempt receipt. Without it, stop. No history repair or migration renumbering. |
| 445 succeeds but 446 fails | Preserve exact 445 state and evidence. Keep the pause; decide reviewed forward repair or approved whole-state recovery. Do not pretend both migrations rolled back. |
| 446 succeeds but app deployment fails | Keep the pause. Repair and release through Git-backed main; old main cannot resume writing against 446. Follow the exact deployment commit. |
| Webhook/Checkout deployment or billing verification fails | Keep financial activation closed. Defer/retry genuine events without duplicate fulfillment; inspect provider IDs and canonical receipts. Never grant capacity manually to finish the test. |
| Manifest/accounting/access postflight fails | Keep general writes paused; preserve object/version and registry evidence. No deletion of historical objects or blanket exclusion. Fix forward only after review. |

If a database restore is selected, obtain explicit authorization for its exact
backup ID, data-loss interval and whole-project impact. Use Supabase Dashboard →
Database → Backups → the verified daily backup → review/confirm restore; observe
completion and ACTIVE_HEALTHY before reconnecting clients. **This is an available
provider operation, not a tested Forge recovery runbook.** No automatic restore
command or promise of recovery time is provided.

Before resuming after restore, validate historical marker/history/catalog and
financial fingerprints, deploy application and Edge Function artifacts compatible
with that restored schema, and reconcile Storage object versions and external
Stripe subscriptions/invoices/deliveries against restored receipts. Retain the
write pause throughout. Database rollback cannot roll back object bytes, Netlify
or Edge Function releases, or external payments. If the necessary byte versions,
post-backup changes, or event reconciliation cannot be recovered, recovery remains
NO-GO; a backup is not a substitute for that missing capability.

## E. Morning GO/NO-GO checklist

- [ ] Fresh November 19 physical backup is actually completed; ID/time/source,
  restore permission and accepted recovery gap verified again.
- [ ] Authentic H444 restoration/rehearsal through 446 and required H/B1
  certification accepted; no synthetic substitution or implicit policy waiver.
- [ ] Reviewed final remote candidate contains the local tooling and all app/
  webhook/Checkout sources; required checks pass for that exact head.
- [ ] Exact-version hosted executors, original predecessor receipts, fresh
  recovery evidence, per-stage owner approvals and ambiguous-outcome checks exist.
- [ ] Enforceable write pause/drain/resume covers every writer, including stale
  clients, Storage uploads, workers and financial deliveries.
- [ ] Recovery across DB, object bytes, Stripe and app/function versions is
  demonstrably executable; isolation and any restore-project cost are approved.
- [ ] Exact-set historical activation, genuine Test Checkout, signed webhook,
  owner capacity, save/reopen and manifest/accounting/access acceptance are ready
  for the controlled verification lane, with explicit stop conditions.

**Any unchecked prerequisite means NO-GO.** Tonight several are unchecked and
cannot be satisfied merely by waiting for the next backup. No production write
pause, migration, exclusion, entitlement, merge, push, deployment, restore, private
data transfer, or cloud worker was performed. Preserve this preparation and obtain
separate approval for any work beyond the stated preparation scope.
