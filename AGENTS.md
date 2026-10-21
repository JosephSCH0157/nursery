# Podcaster's Forge Agents

This document defines the **canonical agent roles** inside the Podcaster's Forge workspace. Each agent has a clear scope, inputs/outputs, and guardrails so tools can cooperate without stepping on each other.

Release baseline: **Forge v1.2.0 Fire Burning** (`forge-v1.2.0`).

Canonical lifecycle constitution: `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`.

---

## Production Deployment Policy (Canonical)

The Podcaster's Forge Netlify production site is released only by the Git-backed
deployment triggered from `main`.

- Do not use `netlify deploy --prod`, artifact uploads, or equivalent Netlify API
  calls for production deployment.
- For an authorized release, run the required checks, fetch the remote state,
  integrate the reviewed changes through the repository's established Git
  workflow, and push without force.
- If `main` has advanced, preserve and reconcile the remote changes. Never assume
  a previously observed baseline is still current.
- Respect branch protections and any required pull-request workflow.
- Follow the Netlify build triggered by the exact Git commit and verify that the
  ready, published production deployment serves that commit.
- If the build fails, inspect the build logs, repair the verified defect, and
  release the repair through Git again.
- Never change site configuration to permit manual production deployment.

Release records and runbooks must reference this section instead of defining a
different production deployment path.

## Single-checkout workflow (Canonical)

- Use only `D:\nursery\nursery` for Forge source work. Do not create additional
  clones, worktrees, runnable source snapshots, or full-source backup archives.
- Preserve unfinished work in named Git branches within this repository before
  integration. Preservation does not authorize merging old or unfinished work.
- Coordinate shared-file writers and localhost watcher/HMR effects before a
  checkout or source transition. Do not restart user-owned servers implicitly.
- Store necessary private evidence/configuration in access-restricted local
  storage excluded from Git, serving, and deployment. Never overwrite canonical
  environment files with another checkout's configuration.
- Removing historical copies requires an exact-path preservation manifest and
  explicit approval. Unresolved files, archives, and active dependencies stay on
  hold. Creator media and Supabase data are not duplicate-source cleanup targets.

---

## SSOT / Persistence Policy (Canonical)

The Supabase database (`tongs` schema) is the canonical single source of truth (SSOT) for all persisted state: workspaces, projects, sparks, episodes/workpieces, links, approvals, credits, and any user data that must survive refresh/reload/device changes.

Local storage and in-memory state are non-canonical caches only (UI convenience). They MUST NOT be relied on for persistence or correctness.

If a feature requires saving, syncing, or retrieving persisted state, it MUST go through Supabase (direct queries/RPC via the existing data access layer).

If an edit request would require schema changes, migrations, RLS policies, or triggers, the agent MUST:

1. STOP and call it out explicitly ("This requires a DB migration / RLS update.")
2. Provide the SQL migration and the exact app code changes needed to use it.

The agent MUST NEVER fake persistence by writing to local files or `localStorage` as a substitute.

Fail-safe rule: when in doubt about persistence, assume it belongs in Supabase and ask/flag it rather than inventing a local workaround.

Hard gate: if a requested change touches persistence semantics, relationships, lifecycle, or query behavior, the agent MUST NOT implement only UI changes and hope. It MUST either include migration + RLS updates in the same change set, or stop and state: "DB changes required; here is the migration."

Agent instructions must follow the canonical lifecycle defined in `FORGE_SPARK_TO_ANVIL_LIFECYCLE_CANON.md`.

---

## Database Migration and Certification Policy (Canonical)

`DATABASE_ARCHITECTURE.md` defines why Forge has two permanent database
lineages; `DATABASE_OPERATIONS.md` is the only supported operating runbook.

- Historical lineage `historical-v1` (H) is the immutable 414-migration audit
  and upgrade record through `20261020171522`. Never amend, renumber, delete, or
  replay it to create a new database.
- Fresh installations use canonical baseline lineage `baseline-v1` (B1), whose
  reserved epoch is `20261021000000` through `20261021235959`. Never apply the
  baseline to an existing or hosted historical database.
- All migrations from `20261022000000` onward are the single shared forward tail
  (T) in `supabase/migrations`; both lineages must receive identical bytes.
- Installed lineage is recorded by the private singleton
  `forge_meta.database_lineage`; never fabricate or bypass that marker.
- Every database command must select and validate a lineage through the checked-in
  scripts. Direct historical-root bootstrap is prohibited. Supabase CLI must be
  exactly `2.84.2`.
- Historical migrations and frozen baseline artifacts are immutable. Do not use
  `--include-all`, `migration repair`, direct writes to migration-history tables,
  or unapproved migration renumbering.
- A migration must transactionally establish its complete owner, dependencies,
  RLS, policies, grants/revocations, and function execution contract. Objects in
  Data API schemas require explicit grants and RLS; do not rely on automatic or
  default privileges.
- A fresh baseline stays financially inactive and fail closed. Do not add pricing
  activation, credentials, balances, grants, operational Stripe/provider state,
  or customer data.
- Run frozen-artifact, lineage, catalog/ACL, RLS/Data API, application, and
  financial certification before review. Fail closed on any unapproved catalog
  difference; only the recorded `wrappers` 0.5.6/0.5.7 exception is allowed.
- Hosted schema changes and all production writes require explicit owner approval.
  Never deploy, apply migrations, alter hosted history, or write production data
  merely because local certification passed.

---

## Test / Live Financial Parity — Non-Negotiable

Forge has ONE customer financial system.

- Development, testing, beta, and production MUST use the same application paths for subscriptions, purchases, customer credits, pricing, reservations, spend controls, settlement, accounting, and failure handling.
- Development and beta run through Stripe Test credentials; launch runs through Stripe Live credentials.
- Test and Live may differ only through external configuration/credentials, never separate product logic or branching workflows.
- Go-live MUST NOT require new billing, pricing, reservation, settlement, or accounting implementation. It is an environment activation, not a product rewrite.
- If proposed work introduces separate Test and Live financial behavior: **STOP**, do not patch around it, and raise an architecture issue.
- If code behavior contradicts this rule, the code is wrong.

Canonical financial manifest: `docs/billing/FORGE_FINANCIAL_ARCHITECTURE.md`.

---

## 🏗️ Core System Agents

### **Podcaster's Forge** (Orchestrator)

**Role:** Workspace coordinator and contract enforcer.

* Owns boot order, environment wiring, and cross‑tool contracts.
* Validates schema versions and feature flags.
* No business logic; routes and verifies only.

**Inputs:** Workspace config, feature flags, tool manifests  
**Outputs:** Initialized tools, validated contracts

---

### **Tongs** (Storage & Registry)

**Role:** Canonical storage brain and calendar.

* Mount registry (cloud/local, role‑based).
* Script/recording metadata, revisions, mirrors.
* Calendar, sessions, and scheduling.

**Inputs:** Tool storage requests  
**Outputs:** Normalized storage decisions, snapshots, mirrors

Canonical storage contract: `TONGS_PATH_CHARTER.md`.

---

## 🔥 Creation Agents

### **Bar‑Stock** (Idea Capture)

**Role:** Fast idea intake.

* Sparks, notes, fragments.
* UUID‑first creation.
* Zero structure pressure.

**Inputs:** Raw ideas  
**Outputs:** Sparks → Hearth

---

### **Hearth** (Script & Research)

**Role:** Idea‑to‑script refinement.

* Drafting, outlining, research assist.
* Style adaptation per creator.
* Script revisions (non‑destructive).

**Inputs:** Sparks, references  
**Outputs:** Scripts → Anvil / Tongs

---

## ⚒️ Production Agents

### **Anvil** (Teleprompter & Recording)

**Role:** Performance and capture.

* Script rendering & scroll engines.
* Recording (audio/video).
* ASR assist (mode‑aware).

**Inputs:** Scripts, settings  
**Outputs:** Recordings → Hammer / Tongs

---

### **Hammer** (Editing)

**Role:** Post‑production shaping.

* Cuts, trims, shorts.
* Non‑linear edits.

**Inputs:** Raw recordings  
**Outputs:** Finals → Quench

---

## 🚀 Distribution & Insight Agents

### **Quench** (Publish & Distribute)

**Role:** Platform delivery.

* Uploads, scheduling.
* Metadata & thumbnails.

**Inputs:** Final media  
**Outputs:** Live publishes

---

### **Ledger** (Analytics)

**Role:** Feedback and metrics.

* Views, CTR, retention.
* Comment intake & response cues.

**Inputs:** Platform data  
**Outputs:** Insights → Hearth / Strategy

---

## 🧭 Design Principles

* **Single Source of Truth:** Tongs for storage decisions.
* **Loose Coupling:** Agents communicate via contracts, not internals.
* **Fail Fast:** Invalid contracts halt rendering by design.
* **Creator First:** Tools adapt to the human, not the reverse.

---

## Docker Desktop ownership

Docker Desktop is user-owned infrastructure.

Agents MUST NOT:

- launch Docker Desktop
- restart Docker Desktop
- quit Docker Desktop
- kill Docker Desktop processes
- reset Docker Desktop
- alter Docker Desktop configuration

Before performing Docker-dependent work, check availability with:

```
docker info
```

If Docker is unavailable, STOP and tell the user that Docker Desktop must be
started manually. Do not attempt to start or repair Docker Desktop yourself.

The agent may use `docker`, `docker compose`, and related CLI commands only
after the Docker engine is already available.

---

*Last updated: 2026-10-21*
