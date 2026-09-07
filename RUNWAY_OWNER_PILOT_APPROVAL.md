# Runway Owner Pilot Approval Packet

Status: implementation and fake-provider verification complete; production deployment and all activation remain pending owner approval.

## Exact live pilot

- Provider/model: Runway `gen4.5`
- Generation mode: text-to-video, no reference images
- Duration: 5 seconds
- Output: default MP4, `1280:720`
- Concurrency: 1
- Paid submissions: at most 1 under the initial budget period
- Direct provider ceiling: 60 Runway credits at $0.01/credit = $0.600000
- Supporting-cost ceiling: $0.150000
- Total per-operation cap: $0.750000
- Proposed total owner budget: $0.750000 for a 24-hour production period, scoped to provider `runway`, route `tongs_broll_v2`, and SKU `gen4.5:5s:1280:720`

The proposed supporting ceiling covers up to $0.060000 of Runway sales-tax/credit-acquisition contingency, $0.020000 of Netlify function compute, $0.006000 of 30-day Supabase object retention at the route's 250 MB hard media limit, $0.045000 for up to two 250 MB uncached Supabase egress transfers, and $0.019000 of request/database/observability contingency. The current Runway path does not invoke Fly.io or Postmark, so both are zero for this pilot. Actual support cost must be measured and reconciled; the ceiling is not recorded as actual expense.

## Cutover

The migration installs `observe` only. Cutover requires all of the following, in order:

1. Apply the migration and deploy the Tongs route revision together, migration first.
2. Create and review the exact private SKU cost revision. This owner-only cost revision does not establish customer markup.
3. Create the 24-hour, $0.750000 owner operating budget scoped exactly as above.
4. Create and accept the owner operation quote, atomically reserve the full $0.750000, and bind the immutable operation ID, fingerprint, user, workspace, model, duration, ratio, and pricing revision.
5. Enable pricing infrastructure, owner-budget spending, and provider execution while leaving customer settlement disabled.
6. Set the Runway rollout to `enforce` through the operator-only RPC.

After cutover, every production `brollVideoProvider.submit()` call must receive an affirmative database authorization. Missing, mismatched, duplicate, terminal, or ambiguous reservations fail before provider transmission. Polling and background resume paths use the existing durable Runway task ID and do not resubmit.

## Rollback

Insert an operator-authorized Runway rollout revision with mode `halt_new`. This is the supported rollback: it blocks every new paid Runway submission before transmission but leaves polling, completion receipts, cost reconciliation, discrepancy handling, and settlement for already-submitted jobs available. Returning from `halt_new` to `enforce` requires a reviewed recovery migration; it cannot silently fall back to the legacy path.

## Accounting outcome

Completion records a $0.600000 contract-derived Runway estimate, not an authoritative expense. The reservation remains held until the provider amount and supporting costs are measured. Final reconciliation consumes the owner operating budget for actual direct plus actual supporting expense, records zero customer debit and zero customer revenue, and marks margin `not_applicable`. An actual total above $0.750000 creates an owner-only pricing discrepancy and is never passed to a customer.
