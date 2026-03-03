# Prod Migration Order (2026-03-03)

Apply these in timestamp order for the Adaptive Style + Org thin-slice rollout:

1. `20260303103000_tongs_adaptive_style_alignment_flags_and_profile.sql`
2. `20260303114500_tongs_workspace_feature_toggle_audit.sql`
3. `20260303130000_tongs_orgs_teams_workspace_org_slice1.sql`

## Why This Order

- `20260303103000` creates workspace feature flags and style profile primitives used by the app and smoke scripts.
- `20260303114500` adds feature-toggle audit logging (`workspace.feature.toggled`) on top of those flags.
- `20260303130000` adds org/team entities and `workspaces.org_id` backfill/constraints for Model A thin slice.

## Prod Notes

- Keep `adaptive_style_alignment_enabled` default `FALSE` in production.
- Enable alignment only for internal dogfood workspace(s) after deploy.
- Run smoke with `pnpm smoke` (Playwright UI matrix is isolated and not part of default smoke).
