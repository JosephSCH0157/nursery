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

*Last updated: 2026-03-02*
