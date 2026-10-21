# Forge canonical baseline v1 — Gate 3

Gate 3 produced an immutable baseline candidate and disposable certification tooling. It did not modify production, hosted history, pricing, financial activation, application behavior, or the two approved Slice A historical amendments.

## Baseline

- Workdir: `database/canonical-baseline-v1`
- Version: `20261021020814`
- Migration SHA-256: `353c74356937c049cbce9a18b7e01c4d328cfe84b45a149701b81f62f9526e57`
- Source schema-dump SHA-256: `3dcccc455ac03caa8610143d23eaeb061a2e3f49c8818c4d1d2ce687e55f3368`
- Required CLI: exactly 2.84.2
- Data: exactly three approved Quench scopes and four approved immutable capability revisions; every other `public` and `tongs` table starts empty.

The migration installs the exact approved extensions and application catalog, restores four dropped-column ordinal gaps, restores eight cross-schema Storage policies, creates the `auth.users` signup trigger and `ensure_rls` event trigger omitted by scoped `pg_dump`, neutralizes ambient default grants during object creation, restores production-effective ACL/default-ACL behavior, inserts the allowlist, and creates a private `baseline-v1` lineage marker. Application DDL, security, reference records, assertions, and marker creation are one transaction. Extension prerequisites precede that transaction because extension installation is platform-managed utility DDL.

## Commands

Static lineage check:

```powershell
./scripts/verify-supabase-lineage.ps1 -Lineage baseline -Workdir ./database/canonical-baseline-v1 -DatabaseTarget none -Mode bootstrap
```

Disposable certification gates:

```powershell
./scripts/certify-canonical-baseline-v1.ps1 -DefaultPrivilegeMode permissive
./scripts/certify-canonical-baseline-v1.ps1 -DefaultPrivilegeMode restrictive
```

Both currently fail closed on the documented `wrappers` image incompatibility. Do not interpret the successful 0.5.7 diagnostic as certification.

## Files

- `canonical-baseline-v1.manifest.json`: immutable candidate provenance and hashes.
- `canonical-application-catalog-fingerprint.json`: normalized application/security oracle.
- `ENVIRONMENT_NORMALIZATION.md`: exact normalization boundary and why it is necessary.
- `TRANSITION_DESIGN.md`: historical marker transition and shared-tail rules.
- `CERTIFICATION_RESULTS.md`: passing, failing, and blocked evidence.

The existing Slice A candidate is incorporated without discarding its migrations or tests. The baseline represents the post-Slice-A contract; existing hosted projects still receive Slice A through their historical lineage and never apply this baseline.
