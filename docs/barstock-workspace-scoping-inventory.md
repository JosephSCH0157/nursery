# Bar Stock Workspace-Scoped Inventory

Updated: 2026-03-02

## Scoped tables

| Table | Purpose | `workspace_id` | `created_by` | Access path |
|---|---|---|---|---|
| `tongs.barstock_sparks` | Spark records | Yes (`NOT NULL`) | Yes (nullable legacy rows possible) | Direct Supabase client writes/reads from Bar Stock (`apps/bar-stock/src/lib/tongs-sync.ts`, `apps/bar-stock/src/lib/tongs-api.ts`) |
| `tongs.barstock_assignments` | Project records | Yes (`NOT NULL`) | Yes (`NOT NULL`) | Direct Supabase client writes/reads from Bar Stock (`apps/bar-stock/src/lib/tongs-sync.ts`, `apps/bar-stock/src/lib/tongs-api.ts`) |
| `tongs.barstock_project_episode_links` | Deterministic project -> episode/workpiece link | Yes (`NOT NULL`) | No | Resolved in Tongs API/Hearth intake paths (`packages/tongs/src/workpiece-commit-api.ts`) |
| `tongs.episodes` | Hearth workpiece rows targeted by project links | Yes (`NOT NULL`) | No | Tongs API + Supabase queries (`packages/tongs/src/workpiece-commit-api.ts`, `apps/bar-stock/src/lib/tongs-api.ts`) |

## Related workspace constraints

- Canonical role-gated RLS exists for `viewer` read, `editor` write, `admin` delete on:
  - `tongs.barstock_sparks`
  - `tongs.barstock_assignments`
  - `tongs.barstock_project_episode_links`
  - `tongs.episodes`
- Enforced by migration: `20260302200000_tongs_workspace_and_barstock_policy_canonical_cleanup.sql`.
- Additional workspace consistency triggers:
  - `barstock_project_episode_links` workspace consistency trigger (project/workpiece alignment).
  - `barstock_sparks` workspace consistency trigger added in `20260302231500_tongs_barstock_workspace_consistency_backstops.sql`.
