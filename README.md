# Podcasters Forge

**Current tagged release: Forge v1.2.12 — Fire Burning**

Podcasters Forge is an integrated creator-production system for taking an idea from first spark through scripting, recording, editing, publishing, and operational review. Nursery provides the **front door, shared authentication, workspace context, and navigation** for the Forge ecosystem.

The creator workflow is built from specialized tools around one canonical backbone:

```text
Bar Stock -> Hearth -> Anvil / Bellows -> Hammer -> Quench
                 \        Tongs        /
                  \---- canonical ----/
                         state

Ledger observes billable usage, credits, and operational cost activity.
```

**Tongs is not merely another step in the pipeline.** It is the canonical data and contract layer shared by the Forge tools.

## Release status

- Latest tagged release: **`v1.2.12`**.
- Forge v1.2.12 completed release certification on **September 3, 2026**.
- `main` is an active development branch and may contain work beyond the tagged production baseline.
- Release record: [`RELEASE_v1.2.12.md`](RELEASE_v1.2.12.md)

## Forge tool map

| Tool | Primary responsibility |
| --- | --- |
| **Nursery / ForgeHub** | Authentication, workspace selection, navigation, account surfaces, and shared application shell |
| **Bar Stock** | Fast idea capture, sparks, grouping, and creator-authorized topic discovery |
| **Hearth** | Conversational script development, editorial shaping, research/reference workflows, and creator-directed AI assistance |
| **Tongs** | Canonical persistence, contracts, authority boundaries, RLS, workspaces, workpieces, state, receipts, and cross-tool handoff |
| **Anvil** | Scripted recording and teleprompter-driven capture |
| **Bellows** | Multi-location live studio and remote capture; intentionally runs as a top-level application surface |
| **Hammer** | Non-destructive editing, media assembly, shorts, export, and post-production handoff |
| **Quench** | Publishing and distribution workflow, destination preparation, uploads, and manual-platform handoff where direct publishing is unavailable |
| **Ledger** | Workspace AI/media usage, credits, payer visibility, billing activity, and operator-side purchase/accounting surfaces |

Individual tools may be under active reconstruction even when their route and data contracts already exist. The tagged release is the stable reference point; `main` represents current development.

## Canonical authority and persistence rules

These rules are non-negotiable:

- Supabase, primarily the `tongs` schema, is the canonical SSOT for persisted Forge state.
- `localStorage`, IndexedDB, browser memory, and local mirrors may support cache, custody, recovery, or media access only where explicitly designed; they do **not** silently replace canonical Tongs authority.
- If persistence semantics change, the same change must include the required database migration, RLS/permission treatment, and contract updates. Otherwise STOP and surface the missing database work.
- One concept has one authority. Split-brain ownership is a defect, not a compatibility feature.
- Cross-tool state must survive reloads and handoffs through canonical identifiers rather than UI-only state.
- AI may assist creator work, but creator intent and explicit authorization remain authoritative.

For lifecycle and state-machine behavior, see:

- [`FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`](FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md)
- [`STATE_MACHINE_DIAGRAM.md`](STATE_MACHINE_DIAGRAM.md)
- [`WORKPIECE_DELETION_POLICY_PLAN.md`](WORKPIECE_DELETION_POLICY_PLAN.md)
- [`LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md`](LOCAL_MIRROR_SSOT_BURNDOWN_LOCK.md)
- [`LOCAL_MIRROR_SSOT_BURNDOWN_IMPLEMENTATION_PLAN.md`](LOCAL_MIRROR_SSOT_BURNDOWN_IMPLEMENTATION_PLAN.md)
- [`LOCAL_MIRROR_SSOT_POST_CAMPAIGN_STABILIZATION_NOTE.md`](LOCAL_MIRROR_SSOT_POST_CAMPAIGN_STABILIZATION_NOTE.md)
- [`LOCAL_MIRROR_INGEST_STATE_MACHINE.md`](LOCAL_MIRROR_INGEST_STATE_MACHINE.md)

## Billing and AI-usage boundaries

Forge supports explicit payer lanes rather than silently mixing platform-funded and creator-funded activity.

- **Forge-funded** operations use Forge billing/credits under the applicable authorization and budget rules.
- **Provider BYO** operations use the creator's connected provider account and remain distinct from Forge-funded usage.
- Workspace Ledger surfaces customer-relevant usage, credits, charge ceilings/settlement, and payment-source information.
- Provider costs, pricing inputs, and operator-only purchase/accounting data must remain private from ordinary workspace members.
- Billing authority belongs in server-side/Tongs contracts, never in client-only state.

## Canonical documentation index

- Forge system architecture: [`docs/FORGE_SYSTEM_ARCHITECTURE.md`](docs/FORGE_SYSTEM_ARCHITECTURE.md)
- ForgeHub / Nursery manifest: [`apps/nursery/FORGEHUB_V1_MANIFEST.md`](apps/nursery/FORGEHUB_V1_MANIFEST.md)
- Bar Stock: [`apps/bar-stock/README.md`](apps/bar-stock/README.md)
- Tongs manifest: [`packages/tongs/TONGS_V1_MANIFEST.md`](packages/tongs/TONGS_V1_MANIFEST.md)
- Hearth V1 manifest: [`apps/hearth/HEARTH_V1_MANIFEST.md`](apps/hearth/HEARTH_V1_MANIFEST.md)
- Hearth V2 contract/status: [`apps/hearth/HEARTH_V2_CONTRACT.md`](apps/hearth/HEARTH_V2_CONTRACT.md)
- Anvil manifest: [`apps/anvil/MANIFEST.md`](apps/anvil/MANIFEST.md)
- Bellows V1 manifest: [`apps/bellows/BELLOWS_V1_MANIFEST.md`](apps/bellows/BELLOWS_V1_MANIFEST.md)
- Hammer manifest: [`docs/HAMMER_MANIFEST.md`](docs/HAMMER_MANIFEST.md)
- Hammer orientation: [`apps/hammer/README.md`](apps/hammer/README.md)
- Quench manifest: [`docs/QUENCH_MANIFEST.md`](docs/QUENCH_MANIFEST.md)
- Quench technical architecture: [`apps/quench/QUENCH_TECHNICAL_ARCHITECTURE.md`](apps/quench/QUENCH_TECHNICAL_ARCHITECTURE.md)
- Quench orientation: [`apps/quench/README.md`](apps/quench/README.md)

Canonical documents own their domains. The root README is an orientation layer and should not override a tool manifest or authority contract.

## Repository layout

- `apps/nursery/` — Vite/React application shell, authentication, ForgeHub, creator routes, and shared workspace experience.
- `apps/anvil/` — Anvil recording/teleprompter implementation and assets.
- `apps/hearth/` — Hearth contracts and supporting implementation.
- `apps/hammer/` — Hammer post-production implementation.
- `apps/quench/` — Quench publishing/distribution implementation.
- `apps/bellows/` — Bellows remote/live studio contracts and implementation.
- `packages/` — shared/internal packages, including Tongs contracts and persistence helpers.
- `supabase/migrations/` — canonical database evolution, RPCs, RLS, authority, receipts, and billing migrations.
- `pnpm-workspace.yaml` — monorepo workspace definition.
- `package.json` — root scripts and workspace orchestration.
- `netlify.toml` — deployment, routing, and function configuration.

## Anvil mirror rules

- Canonical editable teleprompter shell: `apps/anvil/teleprompter_pro.html`.
- Generated copies — **do not edit directly**:
  - `apps/anvil/dist/teleprompter_pro.html`
  - `apps/nursery/public/anvil/teleprompter_pro.html`
  - `apps/nursery/dist/anvil/teleprompter_pro.html`
- One-way sync command:

```bash
pnpm --filter nursery sync:anvil
```

## Getting started

1. Install `pnpm` if needed:

```bash
npm install -g pnpm
```

2. Install the workspace from the repository root:

```bash
pnpm install
```

3. Launch the Nursery development app:

```bash
pnpm --filter nursery dev
```

The canonical authenticated local-development origin is:

```text
http://127.0.0.1:5173
```

## Before pushing

Run the repository gate:

```bash
pnpm check
```

`pnpm check` covers the workspace's normal validation path. GitHub Actions adds provisioned live/integration coverage when the required repository or environment secrets are available.

Do not document secret **values** in the repository. Secret names and required scopes should live beside the workflows or authority documents that consume them so credential requirements can evolve without turning this README into a second configuration authority.

## Playwright origin law

- Canonical Playwright dev origin: `http://127.0.0.1:5173`.
- `apps/nursery/playwright/.auth/state.json` must be captured and replayed on that same origin.
- Smoke/auth resolution order is `FORGE_SMOKE_BASE_URL`, then `FORGE_TEST_BASE_URL`, then `PLAYWRIGHT_BASE_URL`.
- Port `4173` is deprecated for the authenticated Playwright smoke flow.

## Principal routes

### Public/authentication

- `/login`
- `/signup`
- `/auth/callback`
- `/auth/callback/recovery`
- `/reset-password`

### Authenticated Forge surfaces

- `/app` — ForgeHub
- `/app/anvil` — Anvil
- `/app/hearth` and `/apps/hearth` — Hearth
- `/app/hammer` — Hammer
- `/app/tongs` — Tongs
- `/app/quench` — Quench
- `/app/ledger` — Ledger
- `/app/barstock` and `/app/bar-stock` — Bar Stock
- `/app/iron-mine` — Iron Mine
- `/app/subscriptions` and `/app/account` — account/subscription surfaces
- `/app/settings` — settings and organization/storage administration
- `/app/calendar` — Calendar route currently remains a placeholder shell

### Bellows top-level surfaces

Bellows intentionally owns a top-level studio surface rather than running inside the normal `/app` shell:

- `/apps/bellows`
- `/apps/bellows/join/:sessionId`
- `/bellows` redirects to `/apps/bellows`
- `/app/bellows` redirects to `/apps/bellows`

## Tech stack

- TypeScript + React + Vite
- `pnpm` workspaces
- Supabase Auth, Postgres, RPC/RLS contracts, and Storage
- Netlify deployment/functions
- Playwright browser certification
- FFmpeg-backed media inspection and processing where required
- Server-side integrations for AI and media providers

---

**North star:** creator-controlled production, deterministic authority, recoverable state, and no hidden magic between tools.
