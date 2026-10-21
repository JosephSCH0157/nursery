# Proposed integration, deployment, and recovery sequence

This is a proposal for later owner authorization, not deployment authorization.

## Integration sequence

1. Review the Gate 4 commit without changing the frozen Gate 3B artifacts.
2. Run frozen-artifact, entrypoint, lineage-rejection, permissive/restrictive baseline, application, and financial gates from a clean checkout with Supabase CLI 2.84.2.
3. Obtain genuine historical-upgrade evidence described in `HISTORICAL_UPGRADE_CERTIFICATION.md`. Until then, integration may prepare developer/CI baseline use, but hosted application of Slice A and the lineage marker remains blocked.
4. Re-run a read-only hosted prefix/catalog preflight immediately before any separately authorized release. Fail closed on any new migration, marker, or fingerprint difference.
5. Use the established Git-backed review and release workflow. Do not run the baseline against an existing project. The historical project may receive only the three reviewed Slice A migrations and then the shared marker/tail through normal ordered migration deployment.
6. Verify post-deployment migration history, historical marker metadata, catalog/security fingerprint, Data API behavior, RLS isolation, and financial inactivity before declaring success.

## Failure and recovery conditions

The lineage migration is transactional. A history mismatch, pre-existing ambiguous `forge_meta` schema, incompatible marker, ownership/RLS/ACL discrepancy, or unexpected application-role access aborts before commit. Slice A migrations also validate existing objects and reject incompatible contracts.

Stop without retrying or repairing migration history if any of these checks fail. Preserve database logs and normalized catalog/history evidence. Do not apply the baseline, edit hosted history, use `--include-all`, or manually force the marker. Recovery is to leave the existing database unchanged or rely on the platform's supported database recovery capability under a separately approved incident plan; then diagnose the exact catalog divergence and obtain owner approval for any new reconciliation.

The fresh baseline is disposable: on failure, stop it without backup and recreate it from frozen source. No production data is needed or permitted for that recovery.

## Residual risks

- Genuine historical upgrade execution has not yet been certified.
- Supabase dashboard branching is public alpha, so its suitability must be confirmed at the time of certification.
- The approved local/hosted `wrappers` version difference remains environmental and narrowly allowlisted; any new version is a hard failure.
- Older diagnostic scripts still describe staged historical replay. They remain unsupported and must not be mistaken for approved developer, CI, or deployment entrypoints.
- The marker migration's historical qualification is intentionally exact. Any hosted migration added before it requires a reviewed new tail ordering/qualification decision rather than bypassing the guard.
