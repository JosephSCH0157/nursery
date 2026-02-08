# Podcaster's Forge (Forge v1.0) - Nursery

Nursery is the **front door** and **single login** for the Podcaster's Forge ecosystem. Users authenticate here (email + password) and then unlock the `/app` workspace where every Forge tool lives (Anvil, Hearth, Hammer, Barstock, etc.).

## Release status

- Forge `v1.0.0` is released and tagged as `forge-v1.0.0`.
- This repo documents the v1.0 baseline for Nursery and its connected tools.

## Forge v1.0.0 release index

- Nursery / ForgeHub canonical doc: [`apps/nursery/FORGEHUB_V1_MANIFEST.md`](apps/nursery/FORGEHUB_V1_MANIFEST.md)
- Bar-Stock canonical doc: [`apps/bar-stock/README.md`](apps/bar-stock/README.md)
- Tongs canonical doc: [`packages/tongs/TONGS_V1_MANIFEST.md`](packages/tongs/TONGS_V1_MANIFEST.md)
- Hearth canonical doc (`HEARTH_V1_MANIFEST`): [`apps/hearth/HEARTH_V1_MANIFEST.md`](apps/hearth/HEARTH_V1_MANIFEST.md)
- Anvil canonical doc: [`apps/anvil/MANIFEST.md`](apps/anvil/MANIFEST.md) (integrated link: Coming Soon)

## Repository layout

- `apps/nursery/` - the Vite SPA that handles login plus the authenticated `/app` experience.
- `packages/` - shared/internal packages used by Forge tools (for example, Tongs and Hearth packages).
- `pnpm-workspace.yaml` - workspace definition for aggregating the apps and packages.
- `package.json` - root scripts that channel `pnpm` into `apps/nursery`.
- `netlify.toml` - build and redirect configuration for deployment.
- `.gitignore` - repository-level ignores.

## Getting started

1. `npm install -g pnpm` (if not already installed).
2. Run `pnpm install` from the repo root to install dependencies for every workspace member.
3. Run `pnpm dev` to launch `apps/nursery` locally.

## Before pushing

Run:

```
pnpm check
```

## Routes

### Public
- `/login` - SPA login route for current Nursery authentication.
- `/auth/callback` - magic-link handler for recovery/invites.
- `/reset-password` - password reset form.

### Gated (`/app`)
- `/app` - the Forge hub for navigating the tools.
- `/app/anvil`, `/app/hearth`, `/app/hammer`, `/app/tongs`, `/app/quench`, `/app/ledger`, `/app/barstock`, `/app/calendar` - route mount points used by Nursery to host each tool (some remain placeholder shells in v1.0).

## Tech stack

- Vite + React for SPA experiences.
- Supabase Auth for sessions.
- `apps/nursery/src/lib/supabase.ts` keeps every Forge tool on the same Supabase session.
