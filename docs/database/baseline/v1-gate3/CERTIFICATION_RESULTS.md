# Gate 3B certification results

Status: **local fresh-install certification passed; integration and hosted-upgrade certification remain blocked**.

## Compatibility decision

The only approved environmental difference is `extension|wrappers`:

- Hosted production, captured read-only on 2026-10-21: `wrappers` 0.5.6 in `extensions`.
- Supabase CLI 2.84.2 disposable PostgreSQL image `17.6.1.095`: `wrappers` 0.5.7 in `extensions`.
- All other 15,900 normalized catalog/security entries match exactly.
- Any version other than 0.5.6 for the linked oracle or 0.5.7 for this pinned local environment fails certification.

Forge has no foreign data wrappers, foreign servers, foreign tables, user mappings, or application dependency on a `wrappers` routine/type. Repository migrations and application source do not invoke the extension. The 0.5.7 release changes affect FDWs that Forge has not configured, so the change cannot alter a Forge execution path. The compatibility contract is recorded in `wrappers-extension-compatibility.json`.

## Passing evidence

- Historical manifest: 414/414 files match; aggregate SHA-256 `66a094037af456e95b34ec0ca3fb18bcc791d296fa6c2619af9639a87f7d7f40`.
- Linked schema dump: SHA-256 `3dcccc455ac03caa8610143d23eaeb061a2e3f49c8818c4d1d2ce687e55f3368`, unchanged from Gate 3.
- Baseline migration: SHA-256 `73d2779c406b9428e7fdf189ab7ad084671cf1d03908041dbbe855816556c62e`.
- Permissive default-privilege replay: passed.
- Restrictive default-privilege replay: passed. The harness restarts only its disposable PostgREST container after applying the baseline because that lane deliberately starts without the configured `tongs` schema.
- Normalized catalog: 15,901 entries; local hash `49d06bfb75f11053662c5966e021b13e96ac78006759ca39b33bede71db7266f`; 15,900 strict matches plus the one approved wrappers difference.
- Slice A catalog, ACL, RLS, policy, function-execution, trigger, authentication, profile, workspace, pairing, Anvil profile, subscription, billing, and workpiece-isolation tests: passed in both lanes.
- HTTP Data API: anonymous `public.workspaces` access denied; two synthetic signups each received only their own profile/workspace; three global Quench scopes remained discoverable; passed in both lanes.
- Baseline lineage, seven-record allowlist, zero-other-row state, Storage policies, signup bootstrap, zero-credit behavior, paid-RPC ACL, Quench discovery, Stripe/OpenAI/Runway fail-closed behavior: passed in both lanes.
- Financial static contract suite: 32 passed, 0 failed.
- No production/hosted write, migration-history change, deployment, customer-data copy, financial activation, or external provider call occurred.

## Remaining blocker

The no-customer-data hosted-upgrade capsule remains unresolved. No supported disposable hosted upgrade mechanism has been approved, so this result does not authorize Slice A integration, merge, deployment, or a hosted migration.
