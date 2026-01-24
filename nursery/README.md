# Podcaster’s Forge — Nursery

Nursery is the **front door** and **single login** for the Podcaster’s Forge ecosystem.

Users authenticate here (email + password). Once signed in, the same Supabase session unlocks the entire `/app` workspace where Forge tools live (Anvil, Hearth, Hammer, Barstock, etc.).

---

## What Nursery is

- **Primary authentication surface** (email + password)
- **Central app shell** (`/app`) with navigation to Forge modules
- **Shared Supabase session** for all tools hosted under the same origin
- **Magic links are reserved for** password recovery, invite flows, and email verification (not day-to-day navigation)

---

## Routes

### Public
- `/` — login shell (static `index.html`)
- `/login` — (optional) SPA login route if/when we move fully into React routing
- `/auth/callback` — auth callback handler for magic links (recovery/invite/verify)
- `/reset-password` — set a new password after recovery

### Gated
- `/app/*` — requires a valid session
  - `/app` — Nursery home / dashboard
  - `/app/anvil` — Anvil (teleprompter/recording)
  - `/app/hearth` — Hearth (script creation)
  - `/app/hammer` — Hammer (editing)
  - `/app/barstock` — Barstock (idea capture)

> Note: “Single login” works cleanly when all tools are served under the **same origin** (e.g. `podcastersforge.com/app/anvil`). If we move tools to separate subdomains later, we’ll add proper SSO.

---

## Tech Stack

- React + Vite (SPA for `/app`)
- Supabase Auth (session + user management)
- Static login shell (`index.html`) using Supabase password auth
- Assets served from `public/assets`

---