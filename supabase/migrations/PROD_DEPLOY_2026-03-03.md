# Prod Migration Order (2026-03-03)

Apply these in timestamp order for the Adaptive Style + Org thin-slice rollout:

1. `20260303103000_tongs_adaptive_style_alignment_flags_and_profile.sql`
2. `20260303114500_tongs_workspace_feature_toggle_audit.sql`
3. `20260303130000_tongs_orgs_teams_workspace_org_slice1.sql`
4. `20260303153000_tongs_org_teams_slice2_rpcs.sql`
5. `20260303170000_tongs_org_team_member_email_rpcs.sql`
6. `20260303173000_tongs_org_team_member_ambiguity_fix.sql`
7. `20260303224000_tongs_org_membership_invariant_and_repair.sql`

## Why This Order

- `20260303103000` creates workspace feature flags and style profile primitives used by the app and smoke scripts.
- `20260303114500` adds feature-toggle audit logging (`workspace.feature.toggled`) on top of those flags.
- `20260303130000` adds org/team entities and `workspaces.org_id` backfill/constraints for Model A thin slice.
- `20260303153000` adds org-scoped Teams CRUD/member RPCs plus `team.member.add/remove` audit breadcrumbs.
- `20260303170000` adds email-based member lookup/add RPCs for teams.
- `20260303173000` fixes ambiguous `team_id` references in the email-add path.
- `20260303224000` enforces team-member→org-member invariants, backfills missing memberships, and adds mismatch detect/repair RPCs.

## Prod Notes

- Keep `adaptive_style_alignment_enabled` default `FALSE` in production.
- Enable alignment only for internal dogfood workspace(s) after deploy.
- Run smoke with `pnpm smoke` (Playwright UI matrix is isolated and not part of default smoke).
