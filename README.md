# Podcaster's Forge (Forge v1.2 Fire Burning)

Podcaster's Forge is the **front door** and **single login** for the ecosystem. Users authenticate here (email + password) and then unlock the `/app` workspace where every Forge tool lives (Anvil, Hearth, Hammer, Barstock, etc.).

For system behavior of ideas, scripts, persistence, and recording:
- `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`
- `STATE_MACHINE_DIAGRAM.md`
- `WORKPIECE_DELETION_POLICY_PLAN.md`
- `LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`
- `LOCAL_MIRROR_SSOT_BURNDOWN_IMPLEMENTATION_PLAN.md`
- `LOCAL_MIRROR_SSOT_POST_CAMPAIGN_STABILIZATION_NOTE.md`
- `LOCAL_MIRROR_INGEST_STATE_MACHINE.md`

## Release status

- Forge `v1.2.0` (**Fire Burning**) is released and tagged as `forge-v1.2.0`.
- This repo documents the v1.2 baseline for Podcaster's Forge and its connected tools.

## SSOT Persistence Rule (Non-Negotiable)

- Supabase (`tongs` schema) is the canonical SSOT for persisted state.
- `localStorage`/in-memory data are cache-only and MUST NOT be used as persistence.
- If persistence semantics change, include DB migration + RLS in the same change, or STOP and call out that DB changes are required with the migration SQL.

## Forge v1.2.0 Fire Burning release index

- Forge system architecture (canonical): [`docs/FORGE_SYSTEM_ARCHITECTURE.md`](docs/FORGE_SYSTEM_ARCHITECTURE.md)
- Podcaster's Forge / ForgeHub canonical doc: [`apps/nursery/FORGEHUB_V1_MANIFEST.md`](apps/nursery/FORGEHUB_V1_MANIFEST.md)
- Bar-Stock canonical doc: [`apps/bar-stock/README.md`](apps/bar-stock/README.md)
- Tongs canonical doc: [`packages/tongs/TONGS_V1_MANIFEST.md`](packages/tongs/TONGS_V1_MANIFEST.md)
- Hearth canonical doc (`HEARTH_V1_MANIFEST`): [`apps/hearth/HEARTH_V1_MANIFEST.md`](apps/hearth/HEARTH_V1_MANIFEST.md)
- Hearth V2 status + contract: [`apps/hearth/HEARTH_V2_CONTRACT.md`](apps/hearth/HEARTH_V2_CONTRACT.md)
- Hammer canonical doc: [`docs/HAMMER_MANIFEST.md`](docs/HAMMER_MANIFEST.md)
- Hammer orientation README: [`apps/hammer/README.md`](apps/hammer/README.md)
- Quench canonical doc: [`docs/QUENCH_MANIFEST.md`](docs/QUENCH_MANIFEST.md)
- Quench technical architecture: [`apps/quench/QUENCH_TECHNICAL_ARCHITECTURE.md`](apps/quench/QUENCH_TECHNICAL_ARCHITECTURE.md)
- Quench orientation README: [`apps/quench/README.md`](apps/quench/README.md)
- Anvil canonical doc: [`apps/anvil/MANIFEST.md`](apps/anvil/MANIFEST.md) (integrated link: Coming Soon)

## Repository layout

- `apps/nursery/` - the Vite SPA that handles login plus the authenticated `/app` experience.
- `packages/` - shared/internal packages used by Forge tools (for example, Tongs and Hearth packages).
- `pnpm-workspace.yaml` - workspace definition for aggregating the apps and packages.
- `package.json` - root scripts that channel `pnpm` into `apps/nursery`.
- `netlify.toml` - build and redirect configuration for deployment.
- `.gitignore` - repository-level ignores.

## Anvil Mirror Rules

- Canonical editable teleprompter shell: `apps/anvil/teleprompter_pro.html`.
- Generated copies (do not edit): `apps/anvil/dist/teleprompter_pro.html`, `apps/nursery/public/anvil/teleprompter_pro.html`, and `apps/nursery/dist/anvil/teleprompter_pro.html`.
- One-way sync command: `pnpm --filter nursery sync:anvil` (copies `apps/anvil/dist/**` into `apps/nursery/public/anvil/**`).

## Getting started

1. `npm install -g pnpm` (if not already installed).
2. Run `pnpm install` from the repo root to install dependencies for every workspace member.
3. Run `pnpm dev` to launch `apps/nursery` locally.

## Before pushing

Run:

```
pnpm check
```

`pnpm check` includes live Supabase-backed smoke coverage. In GitHub Actions, `.github/workflows/pr-smoke.yml` always runs `smoke:core`, and only enables the provisioned live-smoke jobs when the required repository secrets exist.

Required repo secrets for live smoke:

- `NURSERY_SUPABASE_URL`
- `NURSERY_SUPABASE_ANON_KEY`
- `NURSERY_SUPABASE_SERVICE_ROLE_KEY`
- `NURSERY_PLAYWRIGHT_EMAIL`
- `NURSERY_PLAYWRIGHT_PASSWORD`
- `NURSERY_HEARTH_PHASE4_WORKSPACE_ID`
- `NURSERY_HEARTH_PHASE4_WORKPIECE_ID`

Optional fallback for `smoke:team`:

- `NURSERY_SUPABASE_ACCESS_TOKEN` may be used when `NURSERY_SUPABASE_SERVICE_ROLE_KEY` is not provided.

## Routes

### Public
- `/login` - SPA login route for current Podcaster's Forge authentication.
- `/auth/callback` - magic-link handler for recovery/invites.
- `/reset-password` - password reset form.

### Gated (`/app`)
- `/app` - the Forge hub for navigating the tools.
- `/app/anvil`, `/app/hearth`, `/app/hammer`, `/app/tongs`, `/app/quench`, `/app/ledger`, `/app/barstock`, `/app/calendar` - route mount points used by Podcaster's Forge to host each tool (some remain placeholder shells in v1.0).

## Tech stack

- Vite + React for SPA experiences.
- Supabase Auth for sessions.
- `apps/nursery/src/lib/supabase.ts` keeps every Forge tool on the same Supabase session.
