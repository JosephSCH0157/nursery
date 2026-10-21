# Disposable hosted-upgrade capsule

The capsule certifies the historical upgrade path without customer data and without changing hosted migration history.

## Input

- a disposable Supabase project created for certification;
- schema-only, owner-reviewed pre-tail contract material for `auth`, `storage`, `public`, `tongs`, extensions, functions, triggers, policies, ACLs, owners, and default privileges;
- a genuine `supabase_migrations.schema_migrations` history preserved by an owner-approved snapshot mechanism and exactly matching the immutable `H` manifest boundary;
- zero production rows and zero copied sequence state.

The capsule is not a production backup and must never be linked to a production project. It contains no `auth.users`, customer/workspace/content, Stripe, provider, credential, balance, ledger, pricing-publication, activation, operator, or operational evidence rows.

## Certification flow

1. Provision a new disposable project in an isolated test organization and assert its reference/project ID is on a CI-created allowlist.
2. Restore the approved schema-only capsule using a supported mechanism that preserves its genuine historical version metadata as part of the immutable snapshot. The target must be empty and disposable.
3. Verify that the restored historical versions exactly equal `H`. Do not insert, repair, delete, or relabel migration-history rows during the certification run.
4. Verify schema/security fingerprint and the `historical-v1` lineage marker before any tail command.
5. Apply only canonical `T` with normal Supabase CLI ordering and no `--include-all`.
6. Run catalog/ACL/RLS/Data API/signup and financial fail-closed tests with synthetic data.
7. Export only normalized fingerprints, test results, CLI logs, and project identity—not row data.
8. Destroy the project and fail the job if destruction cannot be confirmed.

## Safety gates

The installer must require three independent facts: an explicit capsule mode token, a project ID created by the current CI run, and an empty application catalog/migration history. It rejects known production/staging IDs, non-empty auth/customer tables, any baseline marker, unknown migration versions, or a manifest mismatch. Service credentials are ephemeral and scoped to the disposable project.

## Open implementation issue

Supabase CLI does not provide a supported command that turns an arbitrary current schema into an already-migrated historical database without representing its history. No supported provider mechanism has yet been verified that can produce a customer-free snapshot while retaining genuine history. Gate 2 must prove that mechanism and teardown guarantees before implementation. If the only available method is manual history insertion/repair or a clone that ever copies customer data, the capsule is blocked and owner direction is required. Existing hosted upgrades continue from their genuine hosted `H` history and never use the capsule.
