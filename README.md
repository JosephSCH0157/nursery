# Podcaster's Forge - Nursery

Nursery is the **front door** and **single login** for the Podcaster's Forge ecosystem. Users authenticate here (email + password) and then unlock the `/app` workspace where every Forge tool lives (Anvil, Hearth, Hammer, Barstock, etc.).

## Repository layout

- `apps/nursery/` - the Vite SPA that handles login plus the authenticated `/app` experience.
- `packages/` - placeholder for future tool packages (Tongs, Anvil, etc.).
- `pnpm-workspace.yaml` - workspace definition for aggregating the apps and packages.
- `package.json` - root scripts that channel `pnpm` into `apps/nursery`.
- `netlify.toml` - build and redirect configuration for future deployments.
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
- `/login` - SPA login route (for future React sessions).
- `/auth/callback` - magic-link handler for recovery/invites.
- `/reset-password` - password reset form.

### Gated (`/app`)
- `/app` - the Forge hub for navigating the tools.
- `/app/anvil`, `/app/hearth`, `/app/hammer`, `/app/tongs`, `/app/quench`, `/app/ledger`, `/app/barstock`, `/app/calendar` - the stubbed tools that will later power the workflow.

## Tech stack

- Vite + React for SPA experiences.
- Supabase Auth for sessions.
- `apps/nursery/src/lib/supabase.ts` keeps every Forge tool on the same Supabase session.
