# Slice A public object inventory

Evidence baseline: read-only production catalog and schema-only dump from project `wtvdjndyxegudufrompx`, reconciled against the completed 411-migration audit. DDL is source-controlled in A1/A2/A3; `public_slice_a_catalog_parity.sql` verifies normalized DDL, ownership, columns/defaults, constraints, indexes, RLS, policies, ACL, view definitions, functions, and triggers.

All listed objects are owned by `postgres`. All tables have RLS enabled and not forced. Both views use `security_invoker=true`. `PUBLIC` is omitted from relation ACLs unless explicitly shown by the parity test.

Classification means:

- **Retained**: active public Data API or compatibility surface that remains first-class in Slice A.
- **Legacy required**: preserved because authentication, identity, subscription, billing, or historical clients still depend on its behavior.
- **Tongs candidate**: current canonical consumers use `tongs`, but the public compatibility relation remains untouched pending a later migration decision.

## Relations

| Object | Class | RLS/policies | Effective grantees besides owner | Dependencies and active consumers |
|---|---|---|---|---|
| `account_balances` | Legacy required | own-row SELECT | `anon`, `authenticated`, `service_role` | Auth user FK; account/subscription compatibility and `account_overview_v`; current Nursery account display uses canonical Tongs but the public surface is retained. |
| `account_identities` | Legacy required | own-row SELECT | `anon`, `authenticated`, `service_role` | Auth user FK; joined by `account_overview_v`. |
| `ai_credit_packs` | Legacy required | authenticated SELECT | `authenticated`, `service_role` | Public AI-credit compatibility catalog; generated Nursery DB types. |
| `ai_credit_topups` | Legacy required | own-row SELECT | `anon`, `authenticated`, `service_role` | Auth user compatibility data; owns `ai_credit_topups_id_seq`. |
| `billing_catalog` | Legacy required | authenticated SELECT | `authenticated`, `service_role` | Referenced by public balance recomputation. Canonical financial authority remains in Tongs. |
| `billing_customers` | Legacy required | own-row SELECT | `anon`, `authenticated`, `service_role` | Auth user FK; legacy fallback for billing portal and billing functions. |
| `billing_events` | Legacy required | own-row SELECT | `anon`, `authenticated`, `service_role` | Auth user FK; written by service-only billing function. |
| `billing_one_time_purchases` | Legacy required | own-row SELECT | `anon`, `authenticated`, `service_role` | Auth user FK; Stripe one-time purchase compatibility. |
| `billing_subscriptions` | Legacy required | own-row SELECT | `anon`, `authenticated`, `service_role` | Auth user FK; subscription display and balance recomputation compatibility. |
| `display_pair_sessions` | Retained | RLS enabled, no policies | `anon`, `authenticated`, `service_role` | `display-ws` and Anvil `pair-qr` service paths. Client grants remain unusable through RLS, matching production. |
| `forge_memberships` | Legacy required | three duplicate own-read policies plus three duplicate client-write blockers | `anon`, `authenticated`, `service_role` | Auth user FK; identity/billing compatibility. Duplicate policies intentionally retained. |
| `plans` | Legacy required | two overlapping active-plan SELECT policies | `anon`, `authenticated`, `service_role` | `user_plans`, `get_my_plan`, legacy plan configuration. Duplicate policy behavior retained. |
| `profiles` | Retained | own SELECT/INSERT/UPDATE | `anon`, `authenticated`, `service_role` | Auth user FK and `profiles_id_seq`; active Nursery profile/subscription fallback, checkout functions, Hammer notice, and Anvil profile/settings persistence. Redundant user-id indexes retained. |
| `stripe_event_log` | Legacy required | service-role ALL | `service_role` | Stripe webhook/event compatibility; no client access. |
| `tp_profiles` | Retained | own SELECT/INSERT/UPDATE | `anon`, `authenticated`, `service_role` | Auth user FK; active Anvil teleprompter profile persistence. |
| `user_plans` | Legacy required | own-row SELECT | `anon`, `authenticated`, `service_role` | Auth user and `plans` FKs; legacy signup/trial functions and `get_my_plan`. |
| `workpiece_events` | Tongs candidate | workspace-member SELECT | `anon`, `authenticated`, `service_role` | Policy depends on `tongs.workspace_members`; active Bar-Stock and Nursery server consumers already select `tongs.workpiece_events`. Public compatibility remains. |
| `workpiece_files` | Tongs candidate | workspace-member SELECT | `anon`, `authenticated`, `service_role` | Policy depends on `tongs.workspace_members`; active Bar-Stock and Nursery server consumers already select `tongs.workpiece_files`. Public compatibility remains. |
| `account_overview_v` | Legacy required | security-invoker view | `authenticated`, `service_role` | Joins `account_identities`, `profiles`, and `account_balances`; generated Nursery type surface. |
| `workspaces` | Retained | security-invoker view | `authenticated`, `service_role` | Projects four unchanged columns from `tongs.workspaces`; active Hearth raw REST compatibility and historical clients. |

## Sequences

| Sequence | Owner/dependency | Grantees |
|---|---|---|
| `profiles_id_seq` | owned by `profiles.id` identity | `anon`, `authenticated`, `service_role` |
| `ai_credit_topups_id_seq` | owned by `ai_credit_topups.id` identity | `anon`, `authenticated`, `service_role` |

## Functions

Every security-definer function has an explicit search path and is executable only by owner plus `service_role`. The two invoker functions retain production's `PUBLIC`, `anon`, `authenticated`, and `service_role` execution behavior.

| Function | Security | Purpose/dependencies |
|---|---|---|
| `auto_assign_trial_plan()` | definer; service only | Legacy auth trigger helper writing `user_plans`. |
| `ensure_account_balance_row(uuid)` | definer; service only | Creates/reads `account_balances`. |
| `ensure_profile_for_user(uuid,text)` | definer; service only | Creates/updates `profiles`. |
| `get_my_plan()` | invoker; public/client/service execute | Reads `user_plans` and `plans` under caller RLS. |
| `handle_new_user()` | definer; service only | Active `auth.users` trigger; bootstraps `profiles` and invokes `tongs.create_workspace_admin`. |
| `handle_new_user_account_bootstrap()` | definer; service only | Retained inactive compatibility helper for profile/balance bootstrap. |
| `handle_new_user_default_plan()` | definer; service only | Retained inactive compatibility helper for `user_plans`. |
| `recompute_account_balances(uuid)` | definer; service only | Reads public subscription/catalog/credit relations and writes `account_balances`. |
| `record_billing_event(...)` | definer; service only | Writes `billing_events` and related public billing compatibility rows. |
| `rls_auto_enable()` | definer; service only | Retained event-trigger function; enables RLS on newly created public tables. Separate security review pending. |
| `set_updated_at()` | invoker; public/client/service execute | Shared row-update trigger helper. |
| `start_trial_on_first_login()` | definer; service only | Retained legacy trial helper for `user_plans`. |
| `upsert_billing_customer(...)` | definer; service only | Public billing-customer compatibility mutation. |
| `upsert_billing_one_time_purchase(...)` | definer; service only | Public one-time-purchase compatibility mutation. |
| `upsert_billing_subscription(...)` | definer; service only | Public subscription compatibility mutation. |

## Triggers and dependency edges

| Trigger | Relation | Function |
|---|---|---|
| `on_auth_user_created` | `auth.users` | `public.handle_new_user()` |
| `trg_account_balances_updated_at` | `public.account_balances` | `public.set_updated_at()` |
| `trg_billing_catalog_updated_at` | `public.billing_catalog` | `public.set_updated_at()` |
| `trg_billing_customers_updated_at` | `public.billing_customers` | `public.set_updated_at()` |
| `trg_billing_one_time_purchases_updated_at` | `public.billing_one_time_purchases` | `public.set_updated_at()` |
| `trg_billing_subscriptions_updated_at` | `public.billing_subscriptions` | `public.set_updated_at()` |
| `trg_tp_profiles_updated_at` | `public.tp_profiles` | `public.set_updated_at()` |
| `ensure_rls` (event trigger) | `ddl_command_end`, tag `CREATE TABLE` | `public.rls_auto_enable()` |

Additional FK edges are fingerprinted exactly: public identity/profile/billing membership rows reference `auth.users`; `user_plans.plan_id` references `plans`; view and policy dependencies are listed above. A1 must precede A2 because A2 reuses `set_updated_at()` and `ensure_account_balance_row(uuid)`. A3 depends on the earlier canonical `tongs.workspaces` and `tongs.workspace_members` contracts but does not alter them.

## Historical dependency ordering

The migrations that require the production-only `public.profiles` relation are:

- `20260306224500_fix_signup_workspace_provisioning_drift.sql`: first unguarded dependency in `handle_new_user()`; now owns the canonical table before the function.
- `20260320153000_tongs_billing_canonical_contract.sql`: guarded profile synchronization/backfill.
- `20260325111500_auth_signup_fail_open_and_workspace_rpc.sql`: guarded profile bootstrap.
- `20260325114000_auth_user_create_unblock.sql`: installs the active auth trigger.
- `20260327170000_tongs_ai_policy_foundation_milestone_a.sql`: unguarded PL/pgSQL profile query plus guarded public entitlement reads.
- `20260401120000_tongs_billing_pro_membership_and_ai_credits.sql`: same profile/public entitlement assumptions.
- `20260901113000_tongs_membership_entitlement_without_legacy_profiles.sql`: explicitly makes legacy public entitlement sources optional.

No earlier migration requires the A2 public financial tables or A3 public workpiece relations. `20260206120007_000002_public_workspaces_view.sql` is already at the correct historical dependency point immediately after canonical `tongs.workspaces` creation.
