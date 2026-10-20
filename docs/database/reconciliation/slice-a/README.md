# Supabase public schema Slice A reconciliation

Status: implemented on `codex/supabase-public-slice-a` for local review only. No hosted migration, production SQL, deployment, merge, or push was performed.

## Scope and boundaries

Slice A makes the 18 production `public` tables, two views, two owned sequences, 15 functions, seven ordinary triggers, and the `ensure_rls` event trigger reproducible without changing their production-effective behavior. It does not retire, relocate, consolidate, or redesign any object. The detailed relation inventory is in [PUBLIC_OBJECT_INVENTORY.md](PUBLIC_OBJECT_INVENTORY.md).

The forward boundary is intentionally split:

- A1, `20261020171517_public_slice_a1_identity_profile_access_baseline.sql`: identity, profile, plan, account display, pairing, signup, and profile-update contracts.
- A2, `20261020171519_public_slice_a2_legacy_financial_baseline.sql`: legacy public billing, Stripe compatibility, AI-credit compatibility, and balance recomputation contracts.
- A3, `20261020171522_public_slice_a3_tongs_compatibility_surfaces.sql`: `public.workspaces`, public workpiece compatibility relations, and the retained `ensure_rls` event trigger.

Each migration is one transaction. It fingerprints every existing in-scope object before DDL, creates only an entirely missing atomic group, installs its complete owner/RLS/policy/ACL/function/trigger configuration before commit, and verifies the resulting production fingerprint. Partial groups and unknown definitions fail with SQLSTATE `55000` and roll back.

Function fingerprints normalize CRLF to LF. This removes platform line-ending noise while retaining exact function definition, owner, security-definer posture, search path, volatility, parallel/strict/leakproof flags, and ACL checks.

## Historical reconciliation

Only the two owner-approved historical files changed.

| Migration | Original SHA-256 | Amended SHA-256 | Original Git blob | Amended Git blob |
|---|---|---|---|---|
| `20260206120007_000002_public_workspaces_view.sql` | `938fb0a8dcbd306de01fb3464bbbecef41cb41e36e079e95c3b57641af295a2c` | `7e4186d5e35464b35c52562bdf7aea357eae230ab4e1517bc85fae1e723a8e2a` | `72341f42c651b0b40bc3adc6c7ad14653aaa2854` | `8844494725e6bb03915c11a2fc830b4209fdd85c` |
| `20260306224500_fix_signup_workspace_provisioning_drift.sql` | `e68f8f7485316f4b1d272ebf683d05532f38f63ab78f954c582e8da5c8e656b6` | `02f5d0d264b91746df9e672acb3bd67ef64f9ee46dfd8d04831570cbcbbed82b` | `d4118012e2ee19add3bca7ac48e63d568f8db739` | `99dcabf60f021d89f6b7d71cd303bc32baf4c51a` |

Byte-preserving originals are stored under `original/`. The workspace-view amendment wraps the unchanged projection in a transaction, sets `security_invoker=true`, assigns owner `postgres`, revokes `PUBLIC` and `anon`, and grants the production-equivalent authenticated/service-role ACL. The signup amendment creates the production-equivalent `public.profiles` table, identity sequence, constraints, redundant index, RLS policies, relation/sequence ACL, and exact function execution ACL before the unchanged signup function is created.

The historical `handle_new_user()` body is unchanged. Explicit `anon` and `authenticated` revocations are necessary because permissive Supabase default privileges otherwise add execution grants that production does not have.

No later migration creates, alters, or drops `public.profiles` or `profiles_id_seq`. Later references either use the exact retained columns or guard the relation's existence. The first unguarded dependency remains the signup migration itself, so introducing the canonical table there resolves ordering without changing signup/workspace behavior. `public.workspaces` is required from its original 202602 boundary and retains the same dependency on `tongs.workspaces`.

Hosted projects that already record these versions in `supabase_migrations.schema_migrations` will not reexecute the amended files during a normal migration deployment. Slice A does not use migration-history repair, manual hosted SQL, or `--include-all`.

## Security model and the two grant issues

The October 30 Supabase platform change identified by the 411-migration audit concerns automatic Data API grants for newly created `public` objects. Slice A removes that environmental dependency by stating every required relation, sequence, and function grant explicitly.

The `tongs` problem is separate: historical migrations establish broad schema default privileges in `tongs`. Slice A does not change those defaults, does not treat them as approval, and does not widen or narrow canonical Tongs authorization. That requires its own subsequent security remediation.

Production-effective public ACL and RLS behavior is preserved, including duplicate policies, redundant indexes, broad legacy relation grants constrained by RLS, `public.profiles`, billing compatibility, and `ensure_rls`. Preservation is not endorsement of the long-term design.

## Verification

The permanent checks are:

- `supabase/tests/public_slice_a_catalog_parity.sql`: normalized DDL/security fingerprints for all relations, sequences, functions, triggers and `ensure_rls`, plus exact object counts and sequence ownership.
- `supabase/tests/public_slice_a_security_behavior.sql`: synthetic signup/profile bootstrap, workspace bootstrap, profile/Anvil persistence, pairing behavior, account/subscription display, public billing compatibility, workpiece isolation, and function/relation reachability. The transaction rolls back.
- `scripts/test-public-slice-a-data-api.ps1`: real local Auth + PostgREST checks for own-profile access, `security_invoker` workspace access, pairing denial, anonymous denial, and service-role Stripe compatibility.

Passing local results:

- Historical chain through `20260915120000_tongs_runway_paid_execution_boundary.sql`, followed by A1/A2/A3: pass.
- Existing-object/idempotent replay of A1/A2/A3: pass.
- Catalog fingerprint parity in permissive defaults: pass.
- SQL RLS and compatibility behavior in permissive defaults: pass.
- Auth/PostgREST Data API behavior in permissive defaults: pass.
- Catalog fingerprint parity under deliberately restrictive `postgres` public-schema default privileges: pass.
- SQL RLS and compatibility behavior under restrictive defaults: pass.
- `supabase db lint --schema public --level error --fail-on error`: pass with no schema errors.

The local database advisors still report pre-existing warnings, chiefly per-row `auth.uid()` evaluation in legacy public policies, duplicate permissive policies, and unrelated mutable-search-path findings in `tongs`. Slice A intentionally preserves the audited production policy/index/function shapes, so these warnings are recorded as later hardening work rather than changed here.

The unchanged full replay remains blocked at `20260916110806_tongs_forge_credit_economy.sql` when its lived-in pricing fixture is absent, with `bounded Luna pricing baseline changed upstream`. This result is blocked, not passed. The repository's current staged-certification script backfills older versions by invoking `supabase migration up --include-all`; the owner explicitly prohibited `--include-all` for this reconciliation. A normal-order staged harness that stops before 20260916 and injects every later fixture at its historical boundary is therefore still required before full fresh-replay certification can pass. No pricing check or constant was weakened.

## Production authorization gate

Before owner-controlled integration or production authorization:

1. Run the full staged replay in strict chronological order without `--include-all` or history manipulation.
2. Run both SQL tests and the Data API test against that final disposable database.
3. Compare `public_slice_a_catalog_parity.sql` against a fresh read-only production fingerprint and fail closed on any difference.
4. Confirm the linked migration list has both historical versions already applied and none of A1/A2/A3 applied.
5. Review the migration diff and verify only the approved files are in the integration commit.

## Rollback, recovery, and stop conditions

- Before integration, rollback is a normal Git revert of the dedicated commit.
- On a fresh database, any mismatch or DDL error rolls back the current migration transaction; no partial security state commits.
- On an existing database, an unknown or partial object set fails before mutation.
- Do not attempt a destructive SQL rollback after A1/A2/A3. They establish retained compatibility objects; recovery is to preserve the database, diagnose the failed fingerprint, and issue a separately reviewed forward correction.
- Stop if production differs from the recorded fingerprints, the full staged replay needs another historical amendment, normal CLI ordering cannot be retained, or a test requires changed RLS, grants, pricing, or business behavior.
