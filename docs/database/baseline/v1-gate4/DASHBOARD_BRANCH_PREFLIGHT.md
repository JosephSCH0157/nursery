# Dashboard branch historical-upgrade preflight

## Conclusion

A data-less Supabase dashboard branch is supported as an isolated environment, but current evidence predicts that Forge branch creation will fail while replaying `20260916110806_tongs_forge_credit_economy.sql`. It is therefore a useful owner-authorized diagnostic, not yet a trustworthy historical-upgrade certification route.

Supabase states that a dashboard branch reads the base project's migration history and applies every entry as a migration. Migrations execute sequentially. A branch excludes production data and storage objects unless **Include data** is enabled. See the official [dashboard branching](https://supabase.com/docs/guides/deployment/branching/dashboard), [branching overview](https://supabase.com/docs/guides/deployment/branching), and [migration behavior](https://supabase.com/docs/guides/deployment/branching/working-with-branches) documentation.

## Forge evidence

The read-only hosted inspection on 2026-10-21 found:

- 411 history entries from `20260131120000` through `20261018120000`.
- Version-only SHA-256 `e60976a860ddaa0518ed84ed9feb4d335a040778035b7b07e47fc2fd06693ae3`, exactly matching the first 411 entries of the frozen 414-file manifest.
- Stored SQL exists for `20260916110806`; it contains the exact bounded-Luna assertion.
- Current production has the required pricing schema, one platform operator, the bounded Luna policy, and its revision-1 `11015`-micro price state.
- Before `20260916110806`, the stored migration statements contain no bounded-Luna policy code, no call that creates the operator pricing revision, and no `11015` value. One earlier migration inserts an operator, but it does not create the required Luna pricing state.

The required Luna policy and revision were lived-in non-customer operator/economic state, not a preceding migration result. A data-less branch does not copy that current row state. Sequential replay therefore reaches `20260916110806` with `v_policy` absent and is expected to raise `bounded Luna pricing baseline changed upstream`. The current production database succeeded historically because that state existed when the backdated migration was applied, not because chronological replay can reconstruct it.

The branch consequently cannot be assumed to represent the current 411-version installation. If provisioning unexpectedly succeeds, its history, catalog, security, and data absence must all be independently verified before it can be used as evidence.

## Proposed owner-authorized diagnostic

Do not run this procedure without separate approval to create and write to a disposable hosted branch.

1. Record the production read-only preflight, accepted source commit, CLI `2.84.2`, 411-version digest above, and current organization usage.
2. Enable dashboard branching only if an Owner/Administrator accepts the public-alpha feature and cost.
3. Create one ephemeral Micro branch named `gate4-h-upgrade-cert-20261021` from production. Leave **Include data** off. Do not connect GitHub, add a seed, create a merge request, or merge/update the production branch.
4. Watch the Pull, Health, and Migrate steps. Capture non-sensitive logs, timestamps, failed version, SQLSTATE, and message.
5. Expected result: provisioning stops at `20260916110806` with the bounded-Luna prerequisite failure. If so, classify dashboard replay as unsuitable, delete the branch immediately, and do not inject the fixture or retry with Include data.
6. If the branch unexpectedly becomes healthy, stop before applying pending migrations. Using its branch-specific connection string kept only in a private environment variable, run read-only checks for:
   - exactly 411 migration versions, the recorded range and digest, and no unknown version;
   - no `forge_meta.database_lineage` marker;
   - zero customer/auth/profile/workspace, Stripe operational, transaction, balance, reservation, settlement, credential, and provider-attempt rows;
   - normalized catalog/security parity, with no new environmental exception;
   - `wrappers` at an explicitly approved version.
7. Run `supabase db push --db-url "$env:FORGE_CERT_BRANCH_DB_URL" --dry-run --workdir .` and require exactly A1 `20261020171517`, A2 `20261020171519`, A3 `20261020171522`, and T marker `20261022000000`, in that order. Never add `--include-all`.
8. Only if steps 1–7 pass and the owner separately authorizes branch mutation, run the same command without `--dry-run`, then execute catalog/ACL, RLS, Data API, application, and financial suites against the branch. Current repository automation does not yet target an arbitrary branch for every suite; that missing branch adapter must be reviewed before this step can be claimed complete.
9. Export only normalized, non-sensitive logs and fingerprints. Delete the branch whether the test passes, fails, or times out. Confirm it no longer appears in the branch list and review organization usage.

## Cost and teardown

Supabase lists no fixed preview-branch fee. The default Micro branch starts at **$0.01344 per branch-hour**, plus any disk, egress, Storage, and other service usage. Branch usage counts toward organization quotas, is not protected by Spend Cap, and Branching Compute is not covered by Compute Credits. See [Manage Branching usage](https://supabase.com/docs/guides/platform/manage-your-usage/branching).

Exact cost cannot be known before the run because provisioning duration and non-compute usage are variable. Include data is prohibited and would use a larger disk and the base project's compute size, increasing cost. Delete immediately after evidence capture; do not leave the branch persistent.

Teardown is mandatory on provisioning failure, unexpected schema/history, detected customer data, unknown extension/catalog difference, security-test failure, pending-migration mismatch, loss of operator control, or timeout. Deletion must be verified; a failed deployment is not assumed to have removed all billable branch resources.

## Supported alternatives

No documented alternative currently supplies equivalent evidence without violating a Forge stop condition:

- A GitHub preview branch replays repository migrations and encounters the same historical defect.
- A schema-only dump tests catalog compatibility but not the authentic H transition.
- Manually inserting history or fixtures fabricates migration state.
- PITR, backup restoration, a read replica, or **Include data** copies production data.
- A production transaction/rollback test writes to production and does not prove CLI history handling.

The remaining escalation is to ask Supabase Support whether they provide a supported schema-plus-authentic-history, data-less clone or an intervention that can provision the branch past the known replay defect without altering the base project. Until such a mechanism is demonstrated, genuine H upgrade certification remains blocked.
