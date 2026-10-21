# Gate 3 environment normalization

The accepted Gate 2 oracle remains unchanged. It intentionally captured both the Forge application contract and hosted/runtime-owned catalog state. Gate 3 found four classes of values that application migrations cannot make portable:

1. PostgreSQL TOAST relation OIDs embedded by `pg_describe_object`; these are allocation-order identifiers, not schema semantics.
2. The transient `cli_login_postgres` membership created by linked CLI access.
3. Supabase-image-owned memberships and role settings for `supabase_admin`, `authenticator`, Realtime, and Functions.
4. The Supabase-image-owned `storage` schema ACL.

`canonical_baseline_v1_contract_rows.sql` therefore excludes runtime roles and memberships, excludes the platform-owned `storage` schema ACL, and removes only TOAST-table dependency identities. It still fingerprints exact extension versions, application schemas, every `public` and `tongs` object, owners, ACLs, column ACLs, RLS, policies, routines, triggers, default privileges, publications, and all non-TOAST dependency edges. The eight Forge policies on `storage.objects` are tested explicitly and their dependencies remain in the normalized dependency set.

Production capture: 15,901 entries, contract SHA-256 `de7ae3443829d6b693f8a86853ae7aaba9f84150f6ccb368aed766bad95117f0`.

The disposable 0.5.7 diagnostic replay also produced 15,901 entries. Its only difference from the normalized production contract was `extension|wrappers`. All application-owned entries matched exactly. This diagnostic is not certification and is not authority to accept the extension change.

## Dropped column ordinals

`pg_dump` cannot represent dropped-column physical gaps. Production retains one gap in each of `tongs.barstock_sparks`, `tongs.episodes`, `tongs.recording_capture_authorities`, and `tongs.workspaces`. The baseline creates and drops an inert placeholder at each exact ordinal. No retired field or data is restored; the operation preserves production column order and generated client behavior.

## Default privileges

The baseline neutralizes both global and schema-specific ambient grants before creating application objects. The dump then restores the approved production default ACLs and explicit object ACLs inside the same transaction. This makes object ACLs identical whether the disposable database starts with permissive or restrictive defaults. It does not implement Slice B hardening.
